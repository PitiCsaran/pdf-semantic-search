=== PDF Semantic Search v2 — Setup ===

Model: LaBSE (highest quality, 109 languages)
Port:  8083

Requirements:
  - Python 3       (python.org/downloads)
  - Chrome or Edge (File System Access API not supported in Firefox)
  - Internet connection for first-time downloads

------------------------------------------------------------
FIRST-TIME SETUP (one time only)
------------------------------------------------------------

Step 1 — Download the embedding model:
  Double-click: download_model.bat
  Wait: ~5-10 minutes (~470 MB)

Step 2 — Download OCR language data (for scanned PDFs):
  Double-click: download_tessdata.bat
  Wait: ~1 minute (~11 MB)
  Note: Skip this step if your PDFs are all digital (not scanned).

------------------------------------------------------------
STARTING THE APP
------------------------------------------------------------

  Double-click: start.bat
  Browser opens at http://localhost:8083 automatically.

------------------------------------------------------------
FEATURES
------------------------------------------------------------

SEARCH (same as v1):
  1. Upload a PDF
  2. Upload an Excel file (Page Number / Topic / Detail columns)
  3. Search using natural language

GENERATE EXCEL (new in v2):
  1. Upload a PDF
  2. Click "Generate Excel" — the app extracts text from each page
     automatically and fills the Topic/Detail columns
  3. Review and edit the generated content in the table
  4. Click "Download Excel" to save the final file
  5. Run a search when ready

  Note: For scanned PDFs, download_tessdata.bat must be run first
  to enable OCR. Digital PDFs work without it.

EDIT TABLE CELLS (new in v2):
  - Click any Topic or Detail cell to edit it in-place
  - Press Enter (Topic) or click outside (Detail) to save
  - The embedding for that row is recomputed automatically
  - An edit marker (✎) appears next to the page number
  - Press Escape to cancel without saving

DOWNLOAD EXCEL:
  - Available after either uploading or generating an Excel
  - Downloads the current table (including any edits) as .xlsx

SESSIONS:
  - Click "Sessions" to set a folder (e.g. on OneDrive)
  - Sessions auto-save after embedding or editing
  - Reload sessions on any PC by pointing to the same folder

------------------------------------------------------------
NOTES
------------------------------------------------------------

  - All processing happens locally — no data is sent to any server
  - OCR (Tesseract.js) runs in the browser via WebAssembly
  - Sessions from v1 can be loaded in v2 (backwards compatible)
  - Port 8083 avoids conflict with v1 ports (8080 / 8081 / 8082)
