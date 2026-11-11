"""Rebuild the pinned PDF.js assets from its official npm archive (no network).
Usage: python tools/vendor_pdfjs.py /path/to/pdfjs-dist-5.6.205.tgz
No course PDFs, page images or extracted text are accepted by this tool.
"""
import base64
import hashlib
import json
from pathlib import Path
import sys
import tarfile

EXPECTED = "tlUj+2IDa7G1SbvBNN74UHRLJybZDWYom+k6p5KIZl7huBvsA4APi6mKL+zCxd3tLjN5hOOEE9Tv7VdzO88pfg=="
archive = Path(sys.argv[1])
assert base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode() == EXPECTED, "Unexpected npm archive integrity"
target = Path(__file__).resolve().parents[1] / "vendor" / "pdfjs"
target.mkdir(parents=True, exist_ok=True)
resources = {}
with tarfile.open(archive) as package:
    for item in package:
        if not item.isfile():
            continue
        relative = item.name.removeprefix("package/")
        if relative in ["legacy/build/pdf.min.mjs", "legacy/build/pdf.worker.min.mjs", "LICENSE"] or relative.startswith(("cmaps/", "standard_fonts/", "wasm/")):
            data = package.extractfile(item).read()
            if relative.startswith(("cmaps/", "standard_fonts/")):
                folder, filename = relative.split("/", 1)
                if filename.startswith("LICENSE"):
                    relative = f"{folder}-LICENSE"
                else:
                    resources[relative] = data
                    continue
            relative = relative.removeprefix("legacy/build/")
            assert not relative.startswith("/") and ".." not in relative.split("/")
            destination = target / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
binary = bytearray()
index = {}
for name, data in sorted(resources.items()):
    index[name] = [len(binary), len(data)]
    binary.extend(data)
(target / "resources.bin").write_bytes(binary)
(target / "resources.json").write_text(json.dumps(index, separators=(",", ":")) + "\n")
checksums = {str(f.relative_to(target)): hashlib.sha256(f.read_bytes()).hexdigest()
             for f in sorted(target.rglob("*")) if f.is_file() and f.name != "SHA256SUMS.json"}
(target / "SHA256SUMS.json").write_text(json.dumps(checksums, indent=2) + "\n")
print(f"Verified official PDF.js 5.6.205; {len(resources)} unchanged library resources packed.")
