from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Literal
import fitz  # PyMuPDF
import io
import base64
import logging

logger = logging.getLogger("pdf-service")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="pdf-service", version="0.1.0")


class FieldOverlay(BaseModel):
    page: int  # 0-indexed
    x: float   # PDF point space, origin bottom-left
    y: float
    width: float
    height: float
    value: str
    field_type: Literal["text", "number", "date", "checkbox"]


class FillRequest(BaseModel):
    fields: list[FieldOverlay]


def _save_doc(doc: fitz.Document) -> bytes:
    """Save document to bytes. Incremental save requires file-backed doc; use full save for stream-opened docs."""
    buf = io.BytesIO()
    # garbage=0 + deflate keeps file size close to original while working with stream-opened docs
    doc.save(buf, garbage=0, deflate=True)
    doc.close()
    return buf.getvalue()


def _htmlbox_rc(result: object) -> int:
    """
    insert_htmlbox return value changed across PyMuPDF versions:
    - <1.24: returns int (0 = ok)
    - >=1.24: returns tuple (float, float) where [0] is overflow indicator (0.0 = ok)
    """
    if isinstance(result, tuple):
        return 0 if result[0] == 0.0 else 1
    return int(result)


class RenderRequest(BaseModel):
    pdf_base64: str
    page: int     # 1-indexed
    dpi: int = 150


class RenderResponse(BaseModel):
    image_base64: str   # JPEG bytes as base64
    width_px: int
    height_px: int
    width_pts: float    # original PDF page dimensions in points
    height_pts: float


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/render", response_model=RenderResponse)
def render_page(req: RenderRequest) -> RenderResponse:
    """Render a single PDF page to a JPEG image at the requested DPI."""
    try:
        pdf_bytes = base64.b64decode(req.pdf_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 pdf_base64")

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    if req.page < 1 or req.page > len(doc):
        raise HTTPException(
            status_code=422,
            detail=f"Page {req.page} out of range (doc has {len(doc)} pages)",
        )

    page = doc[req.page - 1]
    mat = fitz.Matrix(req.dpi / 72, req.dpi / 72)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    jpeg_bytes = pix.tobytes("jpeg")
    # Capture dimensions BEFORE closing the doc — page object becomes invalid after close
    width_pts = float(page.rect.width)
    height_pts = float(page.rect.height)
    pix_w = pix.width
    pix_h = pix.height
    doc.close()

    return RenderResponse(
        image_base64=base64.b64encode(jpeg_bytes).decode(),
        width_px=pix_w,
        height_px=pix_h,
        width_pts=width_pts,
        height_pts=height_pts,
    )


@app.post("/fill")
async def fill_pdf(
    file: UploadFile = File(...),
    request: str = "",  # JSON string of FillRequest, sent as form field
) -> Response:
    """
    Overlay text/checkmarks onto a PDF.
    Accepts multipart/form-data: file + request (JSON).
    Returns the modified PDF bytes.
    """
    import json

    try:
        payload = FillRequest(**json.loads(request)) if request else FillRequest(fields=[])
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid request JSON: {e}")

    raw = await file.read()
    doc = fitz.open(stream=raw, filetype="pdf")

    for field in payload.fields:
        if field.page >= len(doc):
            raise HTTPException(
                status_code=422,
                detail=f"Page {field.page} out of range (doc has {len(doc)} pages)",
            )
        page = doc[field.page]

        rect = fitz.Rect(
            field.x,
            # PyMuPDF uses top-left origin internally; convert from bottom-left
            page.rect.height - field.y - field.height,
            field.x + field.width,
            page.rect.height - field.y,
        )

        if field.field_type == "checkbox":
            page.draw_rect(rect, color=(0, 0, 0), width=1)
            if field.value.lower() in ("true", "1", "yes", "כן"):
                page.insert_text(
                    rect.tl + fitz.Point(2, rect.height - 3),
                    "✓",
                    fontsize=rect.height * 0.75,
                    color=(0, 0, 0),
                )
        else:
            html = _value_to_html(field.value, field.field_type)
            result = page.insert_htmlbox(rect, html, css="* { font-family: sans-serif; }")
            rc = _htmlbox_rc(result)
            if rc != 0:
                logger.warning("insert_htmlbox overflow for field at page %s", field.page)

    return Response(content=_save_doc(doc), media_type="application/pdf")


def _value_to_html(value: str, field_type: str) -> str:
    if field_type in ("number", "date"):
        return f'<p dir="ltr" style="text-align:left">{value}</p>'
    return f'<p dir="rtl" style="text-align:right">{value}</p>'


class AnnexGenerateField(BaseModel):
    source_page: int  # 1-indexed page in the source PDF
    x: float
    y: float
    width: float
    height: float
    value: str
    field_type: Literal["text", "number", "date", "checkbox"]


class GenerateAnnexRequest(BaseModel):
    start_page: int  # 1-indexed
    end_page: int    # 1-indexed
    fields: list[AnnexGenerateField]


@app.post("/generate-annex")
async def generate_annex(
    file: UploadFile = File(...),
    request: str = "",
) -> Response:
    """
    Extract page range [start_page..end_page] from source PDF and overlay filled fields.
    Field source_page is 1-indexed in the source PDF.
    Returns the generated annex PDF.
    """
    import json

    try:
        payload = GenerateAnnexRequest(**json.loads(request))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid request JSON: {e}")

    raw = await file.read()
    src = fitz.open(stream=raw, filetype="pdf")

    if payload.start_page < 1 or payload.end_page > len(src) or payload.start_page > payload.end_page:
        src.close()
        raise HTTPException(
            status_code=422,
            detail=f"Page range {payload.start_page}-{payload.end_page} invalid (source has {len(src)} pages)",
        )

    out = fitz.open()
    out.insert_pdf(src, from_page=payload.start_page - 1, to_page=payload.end_page - 1)
    src.close()

    for field in payload.fields:
        rel_page = field.source_page - payload.start_page  # 0-indexed in `out`
        if rel_page < 0 or rel_page >= len(out):
            logger.warning("field source_page %s outside annex range", field.source_page)
            continue
        page = out[rel_page]
        rect = fitz.Rect(
            field.x,
            page.rect.height - field.y - field.height,
            field.x + field.width,
            page.rect.height - field.y,
        )

        if field.field_type == "checkbox":
            if field.value.lower() in ("true", "1", "yes", "כן"):
                page.draw_rect(rect, color=(0, 0, 0), width=0.5)
                page.insert_text(
                    rect.tl + fitz.Point(2, rect.height - 3),
                    "X",
                    fontsize=max(rect.height * 0.7, 8),
                    color=(0, 0, 0),
                )
        else:
            html = _value_to_html(field.value, field.field_type)
            result = page.insert_htmlbox(rect, html, css="* { font-family: sans-serif; }")
            if _htmlbox_rc(result) != 0:
                logger.warning("insert_htmlbox overflow at source_page %s", field.source_page)

    return Response(content=_save_doc(out), media_type="application/pdf")


@app.post("/spike/rtl-test")
async def rtl_spike(file: UploadFile = File(...)) -> Response:
    """
    Sprint 0 spike: write sample Hebrew text onto page 0.
    Returns rc=0 in header if HarfBuzz RTL rendering succeeded.
    """
    raw = await file.read()
    doc = fitz.open(stream=raw, filetype="pdf")
    page = doc[0]

    rect = fitz.Rect(50, 100, 400, 140)
    hebrew_sample = 'שם החברה: חברת בדיקה בע"מ'
    html = f'<p dir="rtl" style="text-align:right; font-family:sans-serif; font-size:14px">{hebrew_sample}</p>'
    result = page.insert_htmlbox(rect, html)
    rc = _htmlbox_rc(result)
    logger.info("RTL spike insert_htmlbox rc=%s (raw=%s)", rc, result)

    return Response(
        content=_save_doc(doc),
        media_type="application/pdf",
        headers={"X-Htmlbox-RC": str(rc)},
    )
