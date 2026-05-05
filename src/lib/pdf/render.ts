import { readFile } from 'fs/promises';
import { logger } from '@/lib/logger';

const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL ?? 'http://localhost:8000';

export interface RenderedPage {
  imageBase64: string;
  widthPx: number;
  heightPx: number;
  widthPts: number;
  heightPts: number;
}

export async function renderPage(pdfPath: string, page: number, dpi = 150): Promise<RenderedPage> {
  const pdfBytes = await readFile(pdfPath);
  const pdfBase64 = pdfBytes.toString('base64');

  const res = await fetch(`${PDF_SERVICE_URL}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdf_base64: pdfBase64, page, dpi }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`pdf-service /render failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    image_base64: string;
    width_px: number;
    height_px: number;
    width_pts: number;
    height_pts: number;
  };

  logger.info({ pdfPath, page, dpi, widthPx: data.width_px, heightPx: data.height_px }, 'page rendered');

  return {
    imageBase64: data.image_base64,
    widthPx: data.width_px,
    heightPx: data.height_px,
    widthPts: data.width_pts,
    heightPts: data.height_pts,
  };
}

export async function isPdfServiceAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${PDF_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
}
