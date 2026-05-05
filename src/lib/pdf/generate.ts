const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL ?? 'http://localhost:8000';

export type FillFieldType = 'text' | 'number' | 'date' | 'checkbox';

export interface FillField {
  sourcePage: number; // 1-indexed page in source PDF
  x: number;          // PDF points, bottom-left origin
  y: number;
  width: number;
  height: number;
  value: string;
  fieldType: FillFieldType;
}

export async function generateFilledAnnex(
  pdfBytes: Buffer,
  startPage: number,
  endPage: number,
  fields: FillField[]
): Promise<Buffer> {
  const form = new FormData();
  // Copy into a fresh ArrayBuffer-backed Uint8Array to satisfy Blob's BlobPart type
  const ab = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(ab).set(pdfBytes);
  form.append('file', new Blob([ab], { type: 'application/pdf' }), 'source.pdf');
  form.append(
    'request',
    JSON.stringify({
      start_page: startPage,
      end_page: endPage,
      fields: fields.map((f) => ({
        source_page: f.sourcePage,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        value: f.value,
        field_type: f.fieldType,
      })),
    })
  );

  const res = await fetch(`${PDF_SERVICE_URL}/generate-annex`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`pdf-service /generate-annex failed (${res.status}): ${text}`);
  }

  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}
