// ── Pass 1: File classification ────────────────────────────────────────────

export const CLASSIFY_SYSTEM = `You are analyzing files from an Israeli government tender (מכרז) package.
Classify each file as exactly one of:
- MAIN_TENDER: The primary tender document, usually the largest PDF
- ANNEX_FORM: A standalone annex form to be filled out
- SPEC: Technical specification document
- CONTRACT: Contract or agreement template
- REFERENCE_DATA: Reference/background data (Excel sheets, equipment lists, price data)
- PRICE_SHEET: Price quotation form
- OTHER: Anything else

If uncertain: large PDFs → MAIN_TENDER, Excel files → REFERENCE_DATA.
Return JSON only. No markdown fences, no explanation.`;

export const CLASSIFY_USER = (
  files: Array<{ filename: string; fileType: string; pageCount?: number | null; firstPagesText?: string }>
) => `Classify the following files from a tender package:

${files
  .map(
    (f) =>
      `Filename: ${f.filename}
Type: ${f.fileType}${f.pageCount ? `\nPages: ${f.pageCount}` : ''}${f.firstPagesText ? `\nSample text (first pages):\n${f.firstPagesText.slice(0, 600)}` : ''}`
  )
  .join('\n\n---\n\n')}

Return a JSON object mapping each filename to its classification string.
Example: {"main.pdf": "MAIN_TENDER", "data.xlsx": "REFERENCE_DATA"}`;

// ── Pass 2: Annex segmentation ─────────────────────────────────────────────

export const SEGMENT_SYSTEM = `You are analyzing an Israeli government tender document (מכרז) written in Hebrew.
Your task is to identify every annex (נספח) and return their page ranges.

Annexes are labeled like: נספח א', נספח ב', נספח ג', נספח א' 2', etc.
Look for major section headers that mark the start of new forms or declarations.

Return a JSON array only. No markdown fences, no explanation.`;

export const SEGMENT_USER = (pageExcerpts: Array<{ page: number; text: string }>) =>
  `Find all annexes (נספחים) in this tender document.

Document pages (first ~200 chars per page):
${pageExcerpts.map((p) => `=== PAGE ${p.page} ===\n${p.text.slice(0, 200)}`).join('\n\n')}

Return a JSON array where each element is:
{
  "code": "נספח א'",
  "title": "תצהיר בדבר אי תיאום מכרז",
  "startPage": 45,
  "endPage": 51
}

Important:
- Use actual Hebrew text from the document for code and title
- startPage and endPage are 1-indexed page numbers
- If unsure about endPage, estimate from the next annex's startPage minus 1`;

// ── Pass 3: Tender metadata ────────────────────────────────────────────────

export const METADATA_SYSTEM = `You are extracting structured metadata from an Israeli government tender document (מכרז) written in Hebrew.
Extract all fields accurately. Use null for fields you cannot find.

CRITICAL — about the "deadline" field:
- This is the SUBMISSION DEADLINE: the date and time by which proposals must be submitted to the publishing body.
- Look for phrases like: "המועד האחרון להגשת הצעות", "מועד אחרון להגשה", "מועד הגשה אחרון" — usually accompanied by an exact time of day (e.g., "בשעה 14:00").
- DO NOT use the bond/guarantee expiry date ("תוקף ערבות", "ערבות הצעה תהיה בתוקף עד") — that is a different date and goes into milestones with category=GUARANTEE.
- DO NOT use the service start date ("תחילת מתן שירותים", "התחלת ביצוע") — also a milestone, not the submission deadline.
- DO NOT use the clarifications deadline ("מועד אחרון להגשת שאלות הבהרה") — also a milestone, not the submission deadline.
- If the document references multiple "מועד אחרון" dates, the SUBMISSION deadline is the one for HANDING IN the proposal itself, typically the latest of the proposal-submission-related dates.
- If you cannot identify the submission deadline with confidence, return null for "deadline" rather than guessing.

Return JSON only. No markdown fences, no explanation.`;

export const METADATA_USER = (text: string) =>
  `Extract metadata from this Israeli government tender document:

${text.slice(0, 15000)}

Return a single JSON object with this exact structure:
{
  "title": "...",
  "publisher": "...",
  "tenderNumber": "...",
  "deadline": "2026-05-17T00:00:00.000Z",
  "ervutAmount": 50000,
  "contactName": null,
  "contactEmail": null,
  "contactPhone": null,
  "submissionMethod": null,
  "milestones": [
    {
      "title": "סיור קבלנים",
      "description": null,
      "date": "2026-04-10T00:00:00.000Z",
      "category": "PHYSICAL_ACTION",
      "isDeadline": false
    }
  ]
}

milestone category must be one of: DATE | DOCUMENT | GUARANTEE | SIGNATURE | PHYSICAL_ACTION
isDeadline is true ONLY for the final submission deadline.
For milestones array: include every date, event, and deadline mentioned in the document.
All text fields should be in Hebrew where the source is Hebrew.`;

// ── Pass 4: Vision-based field extraction ─────────────────────────────────

export const FIELD_EXTRACT_SYSTEM = `You are extracting fillable fields from a page of an Israeli government tender form (נספח).
The page image is provided. Extract ONLY fields that are meant to be filled in.

For each fillable field:
- label: Hebrew label/name describing what the field asks for
- fieldType: see enum below
- bbox: bounding box in IMAGE PIXELS with TOP-LEFT origin: { "x": int, "y": int, "width": int, "height": int }
- required: true unless clearly optional
- maxLength: character limit if specified, else null

FieldType options:
SHORT_TEXT (text under ~100 chars), LONG_TEXT (multi-line or >100 chars),
NUMBER, CURRENCY (NIS amounts), DATE, CHECKBOX, RADIO, SELECT,
ID_NUMBER (ז.ת. or תעודת זהות — 9-digit Israeli ID),
COMPANY_ID (ח.פ. or מספר עוסק — 9-digit company number),
PHONE, EMAIL, ADDRESS,
SIGNATURE (חתימה — human only, never AI-filled),
STAMP (חותמת — human only),
LAWYER_BLOCK (attestation/notarization block — human only)

Rules:
- DO mark: blank lines with labels, empty table cells for data, checkboxes, text boxes
- DO NOT mark: instructions, section headers, pre-printed text, page numbers
- Checkboxes: return one CHECKBOX field per checkbox, label = the option text
- For "חתימה" / "חותמת" / lawyer blocks: mark as SIGNATURE/STAMP/LAWYER_BLOCK
- If this page has no fillable fields, return empty array

Return JSON only. No markdown fences.`;

export const FIELD_EXTRACT_USER = (params: {
  pageNum: number;
  annexCode: string;
  widthPx: number;
  heightPx: number;
  pageText: string;
}) =>
  `Extract all fillable fields from this tender form page.
Page ${params.pageNum} · Annex: ${params.annexCode}
Image dimensions: ${params.widthPx} × ${params.heightPx} pixels

OCR text (reference only — use the IMAGE as primary source):
${params.pageText.slice(0, 2000)}

Return a JSON array of fields. Empty array if no fillable fields exist.`;

// ── Pass 5: Deduplication ──────────────────────────────────────────────────

export const DEDUP_SYSTEM = `You are analyzing form fields from an Israeli government tender. Fields are in Hebrew.
Your task: deduplicate fields into canonical questions that will be shown to the user once.

Rules:
- Group fields that ask for the same data even if labels differ slightly
  Example: "שם החברה", "שם המציע", "שם התאגיד" → one question labeled "שם החברה"
- DO NOT include fields with fieldType SIGNATURE, STAMP, or LAWYER_BLOCK (these are human-only)
- DO NOT invent fields — only deduplicate what exists
- fieldIds must collectively cover EVERY input field (except SIGNATURE/STAMP/LAWYER_BLOCK)
- Sort logically: fundamental data first (name, ID) then specific data

Return JSON only. No markdown fences, no explanation.`;

export const DEDUP_USER = (fields: Array<{ id: string; label: string; fieldType: string; annexCode: string }>) =>
  `Deduplicate these form fields into canonical questions.

INPUT fields (${fields.length} total):
${JSON.stringify(fields, null, 2)}

Return a JSON array of canonical questions. Each question:
{
  "tempId": "q1",
  "category": "COMPANY_INFO",
  "label": "שם החברה",
  "helpText": null,
  "fieldType": "SHORT_TEXT",
  "required": true,
  "order": 1,
  "fieldIds": ["field-id-1", "field-id-2"]
}

category must be one of: COMPANY_INFO | SIGNATORY_INFO | EXPERIENCE | DECLARATIONS | NARRATIVE`;

// ── Pass 4.5: Quick-start dedup (universal fields only) ─────────────────────

export const QUICK_DEDUP_SYSTEM = `You are matching form fields from an Israeli government tender to a small fixed list of universal questions every tender asks.

For each input field, decide if it clearly asks for one of these standard pieces of company/signatory information. Return a confidence score 0–1 per match. Mark a match only when the field clearly maps to that specific universal question. Do not invent matches.

Universal questions (canonical Hebrew labels):
- "שם החברה": company name (the entity submitting the proposal — including aliases like שם המציע, שם התאגיד)
- "ח.פ.": Israeli company registration number (9 digits — also מספר תאגיד, מספר עוסק מורשה)
- "כתובת": company address (also כתובת המציע, כתובת המשרד)
- "טלפון": company phone
- "אימייל": company email
- "שם החותם": full name of person authorized to sign on behalf of the company (also שם מורשה החתימה)
- "ת.ז. החותם": signatory's 9-digit Israeli ID number (also ת.ז., תעודת זהות)
- "תפקיד": signatory's role/title (also תפקיד החותם, מורשה חתימה)

Return JSON only. No markdown fences, no explanation.`;

export const QUICK_DEDUP_USER = (
  fields: Array<{ id: string; label: string; fieldType: string }>,
  universals: string[]
) => `Map these form fields to the universal question that best matches each one, or null if none match.

Fields (${fields.length}):
${JSON.stringify(fields, null, 2)}

Universal questions: ${JSON.stringify(universals)}

Return:
{
  "mappings": [
    { "fieldId": "<field id>", "canonical": "שם החברה" | null, "confidence": 0.0-1.0 }
  ]
}`;

// ── Pass 6: Scope summary (from Excel) ────────────────────────────────────

export const SCOPE_SUMMARY_SYSTEM = `You are summarizing the scope of work in an Israeli government tender.
You have access to Excel data from the tender package.
Write a concise summary in Hebrew describing: number of facilities, total area, types of work/equipment.
Return JSON only. No markdown fences, no explanation.`;
