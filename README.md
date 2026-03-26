# PDF Semantic Search

A browser-based semantic search tool for PDF presentations. Upload a PDF and search slide content using natural language queries — all processing runs locally on your machine with no data sent externally.

## Versions

| Version | Status | Notes |
|---------|--------|-------|
| `v1/` | Stable | Upload PDF + Excel; semantic search |
| `v2/` | Current | All v1 features + auto-generate Excel from PDF + editable table cells |

---

## V2 — What's New

### Generate Excel from PDF
- Click **Generate Excel** after uploading a PDF — no manual Excel preparation needed
- Extracts text from each page automatically (PDF.js for digital PDFs; Tesseract.js OCR for scanned pages)
- Auto-fills the Topic (first meaningful line) and Detail (full page text) columns
- All OCR runs locally in the browser via WebAssembly — no internet required after one-time setup

### Editable Table Cells
- Click any **Topic** or **Detail** cell to edit it in-place
- Press **Enter** (Topic) or click outside (Detail) to save
- The embedding for that row is recomputed automatically on save
- An edit marker (✎) appears next to the page number for edited rows
- Press **Escape** to cancel without saving

### Download Excel
- Export the current table (including any in-place edits) as `.xlsx` at any time

---

## V1 Features (also in V2)

- Semantic search using multilingual sentence embeddings
- Hybrid scoring: semantic similarity + keyword overlap
- Split-screen PDF viewer with thumbnails, zoom controls, and full-screen mode
- Session auto-save to a local or cloud folder (File System Access API)
- Resume previous sessions instantly — no re-computation needed
- Fully browser-based — no backend, no Python packages required beyond serving files

---

## Variants

| Variant | Model | Size | Speed | Best for |
|---------|-------|------|-------|----------|
| `v1/L12-v2/` | paraphrase-multilingual-MiniLM-L12-v2 | ~118 MB | Fast | 50+ languages, quick setup |
| `v1/LaBSE/` | LaBSE | ~470 MB | Slower | Highest quality, 109 languages |
| `v2/L12-v2/` | paraphrase-multilingual-MiniLM-L12-v2 | ~118 MB | Fast | V2 features, 50+ languages |
| `v2/LaBSE/` | LaBSE | ~470 MB | Slower | V2 features, highest quality |

---

## Setup

See the `README.txt` inside each variant folder for step-by-step setup instructions.

**Requirements:**
- Python 3 — [python.org/downloads](https://www.python.org/downloads/)
- Chrome or Edge browser (File System Access API not supported in Firefox)
- Internet connection for first-time model and OCR data downloads

### Quick Start (V2/L12-v2)

1. Run `download_model.bat` — downloads the embedding model (~118 MB, ~1–2 min)
2. *(Optional)* Run `download_tessdata.bat` — downloads OCR language data for English + Thai (~11 MB); skip if your PDFs are all digital
3. Run `start.bat` — browser opens at `http://localhost:8082`

### Port Assignments

| Variant | Port |
|---------|------|
| v1/L12-v2 | 8080 |
| v1/LaBSE  | 8081 |
| v2/L12-v2 | 8082 |
| v2/LaBSE  | 8083 |

---

## How to Use

### Search (V1 workflow, also works in V2)

1. Upload a PDF (e.g. a slide deck)
2. Upload an Excel file with columns: `Page Number`, `Topic`, `Detail`
3. The app computes semantic embeddings locally
4. Type a natural language query — results are ranked by similarity
5. Click any result row to jump to that slide in the PDF viewer

### Generate Excel (V2 only)

1. Upload a PDF
2. Click **Generate Excel** — extraction runs automatically (3 passes: extract → OCR → embed)
3. Review and edit the generated Topic/Detail cells directly in the table
4. Click **Download Excel** to save the file
5. Run a search when ready

---

## Excel Template

Download the template from within the app (click **Template**), or use this column structure:

| Page Number | Topic | Detail |
|-------------|-------|--------|
| 1 | Introduction | Overview of the presentation scope and objectives |
| 2 | Key Findings | Summary of the main results and insights |

---

## Data Governance Note

All processing — embedding, OCR, session storage — happens locally in your browser. No PDF content or query text is sent to any external server. This makes the tool suitable for use with confidential or internal documents without requiring approval for cloud data transfer.

---

## License

MIT
