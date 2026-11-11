# Vendored PDF.js 5.6.205

Official Mozilla PDF.js, Apache-2.0. The legacy browser build is used for broader Safari compatibility. This directory contains library code and standard PDF rendering resources only, **not course PDFs, page images, or source passages**.

- Upstream: https://github.com/mozilla/pdf.js
- Distribution: https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-5.6.205.tgz
- Verified npm archive integrity: `sha512-tlUj+2IDa7G1SbvBNN74UHRLJybZDWYom+k6p5KIZl7huBvsA4APi6mKL+zCxd3tLjN5hOOEE9Tv7VdzO88pfg==`
- `pdf.min.mjs`, `pdf.worker.min.mjs`: unchanged `legacy/build/` assets.
- `resources.bin` + `resources.json`: all 182 CMap and standard font files, concatenated unchanged with byte offset/length metadata. Resource licenses are retained separately. No resources were dropped based on assumed language coverage.
- `wasm/`: unchanged decoder assets, fallback and licenses.
- `SHA256SUMS.json`: integrity of vendored output, excluding the checksum file itself.

To reproduce, acquire the pinned archive from the official npm registry (`npm pack pdfjs-dist@5.6.205 --ignore-scripts`), then run `python tools/vendor_pdfjs.py /path/to/pdfjs-dist-5.6.205.tgz`. The script verifies the archive's SHA-512 before writing. Use `node tests/validate_source_viewer.js` afterward.

Runtime imports and resource requests stay on the app's origin. `BinaryDataFactory` reads only the known resource index and the three bundled WASM filenames. No CDN requests, fonts from Google, PDF uploads, analytics or remote document rendering are used.
