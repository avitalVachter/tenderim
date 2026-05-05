"""
Sprint 0 smoke test — requires a running pdf-service and a sample PDF.
Run with: pytest tests/test_spike.py --pdf path/to/tender.pdf
"""
import io
import pytest
import httpx

BASE_URL = "http://localhost:8000"


def pytest_addoption(parser):
    parser.addoption("--pdf", action="store", default=None, help="Path to sample PDF")


@pytest.fixture
def pdf_path(request):
    p = request.config.getoption("--pdf")
    if not p:
        pytest.skip("Pass --pdf <path> to run spike tests")
    return p


def test_health():
    r = httpx.get(f"{BASE_URL}/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_rtl_spike(pdf_path):
    with open(pdf_path, "rb") as f:
        r = httpx.post(
            f"{BASE_URL}/spike/rtl-test",
            files={"file": ("tender.pdf", f, "application/pdf")},
            timeout=30,
        )
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    rc = int(r.headers.get("x-htmlbox-rc", "-1"))
    assert rc == 0, f"insert_htmlbox returned {rc} — Hebrew RTL rendering failed"
    # Sanity: output is a valid PDF
    assert r.content[:4] == b"%PDF"
    # Write output for manual inspection
    with open("spike_output.pdf", "wb") as out:
        out.write(r.content)
    print("Wrote spike_output.pdf — open it to verify Hebrew text looks correct")
