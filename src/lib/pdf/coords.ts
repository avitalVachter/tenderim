export interface ImageBbox {
  x: number;      // left edge, pixels from left
  y: number;      // top edge, pixels from top (image origin = top-left)
  width: number;
  height: number;
}

export interface PdfBbox {
  x: number;      // left edge in PDF points
  y: number;      // bottom edge in PDF points (PDF origin = bottom-left)
  width: number;
  height: number;
}

/**
 * Convert a bounding box from image pixel space (top-left origin)
 * to PDF point space (bottom-left origin).
 *
 * Claude vision returns coordinates in image space; PyMuPDF expects PDF space.
 */
export function imageToPdfBbox(
  img: ImageBbox,
  imageWidthPx: number,
  imageHeightPx: number,
  pageWidthPts: number,
  pageHeightPts: number
): PdfBbox {
  const scaleX = pageWidthPts / imageWidthPx;
  const scaleY = pageHeightPts / imageHeightPx;
  return {
    x: img.x * scaleX,
    y: pageHeightPts - (img.y + img.height) * scaleY, // flip Y, use bottom of box
    width: img.width * scaleX,
    height: img.height * scaleY,
  };
}

/** Sanity-check: bbox must be fully inside the page. */
export function isValidBbox(bbox: PdfBbox, pageWidthPts: number, pageHeightPts: number): boolean {
  return (
    bbox.x >= 0 &&
    bbox.y >= 0 &&
    bbox.x + bbox.width <= pageWidthPts + 1 &&
    bbox.y + bbox.height <= pageHeightPts + 1
  );
}
