import * as cheerio from 'cheerio';
import { lookup } from 'dns/promises';
import { logger } from '@/lib/logger';

export interface ScrapedFile {
  url: string;
  filename: string;
  fileType: string;
}

export interface ScrapedTender {
  title: string;
  publisher: string | null;
  deadline: Date | null;
  tenderNumber: string | null;
  files: ScrapedFile[];
}

// Match dates like 17/05/2026, 17.05.2026, optionally with "14:00" time prefix or suffix
const DEADLINE_DATE = /(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/;
const DEADLINE_TIME = /(\d{1,2}):(\d{2})/;

function parseHebrewDeadline(text: string): Date | null {
  const dm = text.match(DEADLINE_DATE);
  if (!dm) return null;
  const [, dd, mm, yyyy] = dm;
  const tm = text.match(DEADLINE_TIME);
  let hour = 0, minute = 0;
  if (tm) {
    hour = parseInt(tm[1], 10);
    minute = parseInt(tm[2], 10);
  }
  // Israel is UTC+2 (or UTC+3 in DST). Use UTC-anchored ISO so DB stores correctly.
  // For tender deadlines we treat the time as Israel local; subtract 3h as a rough adjustment.
  const d = new Date(Date.UTC(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10), hour - 3, minute));
  return isNaN(d.getTime()) ? null : d;
}

const FILE_EXTENSIONS = /\.(pdf|xlsx?|docx?|zip)(\?|$|#)/i;

const CONTENT_TYPE_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

function extFromUrl(href: string): string | null {
  const m = href.match(FILE_EXTENSIONS);
  return m ? m[1].toLowerCase() : null;
}

function lastPathSegment(absUrl: string): string {
  try {
    const u = new URL(absUrl);
    const seg = u.pathname.split('/').filter(Boolean).pop() ?? '';
    return decodeURIComponent(seg);
  } catch {
    return '';
  }
}

const PRIVATE_RANGES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

async function assertPublicHost(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost')) {
    throw new Error('כתובת מקומית אינה מורשית');
  }
  try {
    const { address } = await lookup(hostname);
    if (PRIVATE_RANGES.some((re) => re.test(address))) {
      throw new Error('כתובת פרטית אינה מורשית');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('כתובת')) throw err;
    throw new Error(`לא ניתן לפענח את שם המארח: ${hostname}`);
  }
}

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (compatible; TenderImBot/1.0; +https://tenderim.app)',
  Accept: 'text/html,application/pdf,application/octet-stream,*/*',
  'Accept-Language': 'he,en;q=0.8',
};

export async function scrapeTenderPage(pageUrl: string): Promise<ScrapedTender> {
  const url = new URL(pageUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('יש להשתמש ב-http או https בלבד');
  }
  await assertPublicHost(url.hostname);

  const res = await fetch(pageUrl, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(30_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`שגיאה בקריאת הדף: ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = ($('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').text().trim() ||
    'מכרז').slice(0, 200);

  const publisher = url.hostname;

  // Pull authoritative deadline directly from the page (mr.gov.il displays it cleanly)
  let deadline: Date | null = null;
  // Strategy: find any element whose text contains "מועד אחרון להגשה" and look at the next sibling/value
  const fullText = $.text();
  const deadlineIdx = fullText.indexOf('מועד אחרון להגשה');
  if (deadlineIdx >= 0) {
    // Look in the next ~80 chars for date + optional time
    const window = fullText.slice(deadlineIdx, deadlineIdx + 120);
    deadline = parseHebrewDeadline(window);
  }

  // Tender number — look for "מס' הליך" pattern (mr.gov.il)
  let tenderNumber: string | null = null;
  const tnIdx = fullText.indexOf("מס' הליך");
  if (tnIdx >= 0) {
    const window = fullText.slice(tnIdx, tnIdx + 80);
    const m = window.match(/(\d+\/\d+)/);
    if (m) tenderNumber = m[1];
  }

  const filesByUrl = new Map<string, ScrapedFile>();
  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    if (!href) return;

    const hasDownloadAttr = $el.attr('download') !== undefined;
    const cls = ($el.attr('class') ?? '').toLowerCase();
    const hasDownloadClass = /\b(download|attach)/.test(cls);
    const isAttachmentPath = /\/attachment\//i.test(href);
    const ext = extFromUrl(href);

    // Accept if any reliable signal points to a downloadable file
    if (!ext && !hasDownloadAttr && !hasDownloadClass && !isAttachmentPath) return;

    let absUrl: string;
    try {
      absUrl = new URL(href, pageUrl).toString();
    } catch {
      return;
    }

    // Don't re-add the same URL; don't follow same-page anchors
    if (filesByUrl.has(absUrl)) return;
    const parsed = new URL(absUrl);
    if (parsed.pathname === url.pathname && parsed.hash) return;

    const linkText = $el.text().trim();
    const segName = lastPathSegment(absUrl);
    const dlAttr = $el.attr('download');
    // Prefer real filename hints; the link text on tender sites is often a date column
    const looksLikeDate = /^\s*\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/.test(linkText);
    const rawName =
      (dlAttr && dlAttr.trim()) ||
      segName ||
      (linkText && !looksLikeDate && linkText.length < 120 ? linkText : '') ||
      'file';

    const fileType = ext ? (ext.startsWith('xls') ? 'xlsx' : ext.startsWith('doc') ? 'docx' : ext) : '';

    filesByUrl.set(absUrl, { url: absUrl, filename: rawName, fileType });
  });

  return {
    title,
    publisher,
    deadline,
    tenderNumber,
    files: Array.from(filesByUrl.values()),
  };
}

export async function downloadFile(fileUrl: string): Promise<{ data: Buffer; filename: string }> {
  const url = new URL(fileUrl);
  await assertPublicHost(url.hostname);

  const res = await fetch(fileUrl, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(120_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`שגיאה בהורדה (${res.status}): ${fileUrl}`);

  const cd = res.headers.get('content-disposition');
  let filename = '';
  if (cd) {
    const m = cd.match(/filename\*=UTF-8''([^;\s]+)|filename="([^"]+)"|filename=([^;\s]+)/i);
    if (m) filename = decodeURIComponent(m[1] ?? m[2] ?? m[3] ?? '');
  }
  if (!filename) {
    filename = decodeURIComponent(
      url.pathname.split('/').pop()?.split('?')[0] ?? 'file'
    );
  }

  // If filename has no extension, infer from Content-Type
  if (!/\.[a-z0-9]{2,5}$/i.test(filename)) {
    const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const ext = CONTENT_TYPE_EXT[ct];
    if (ext) filename = `${filename}.${ext}`;
  }

  const data = Buffer.from(await res.arrayBuffer());
  logger.info({ url: fileUrl, sizeBytes: data.length, filename }, 'file downloaded');
  return { data, filename };
}
