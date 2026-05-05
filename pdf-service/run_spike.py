import httpx, sys

pdf_path = r"C:\Users\roeew\Sites\tenderim\TENDER ANALYZER SPEC.pdf"
out_path = r"C:\Users\roeew\Sites\tenderim\spike_output.pdf"

with open(pdf_path, "rb") as f:
    r = httpx.post(
        "http://localhost:8000/spike/rtl-test",
        files={"file": ("spec.pdf", f, "application/pdf")},
        timeout=30,
    )

print("Status:", r.status_code)
print("X-Htmlbox-RC:", r.headers.get("x-htmlbox-rc"))
print("Content-Length:", len(r.content), "bytes")

if r.status_code == 200:
    with open(out_path, "wb") as out:
        out.write(r.content)
    print("Written:", out_path)
    rc = int(r.headers.get("x-htmlbox-rc", -1))
    if rc == 0:
        print("SPIKE PASSED — Hebrew RTL rendering works")
    else:
        print(f"SPIKE FAILED — insert_htmlbox returned {rc}")
else:
    print("ERROR:", r.text)
    sys.exit(1)
