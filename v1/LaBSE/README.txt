=== PDF Semantic Search — LaBSE ===

Model:  LaBSE (Language-agnostic BERT Sentence Embedding)
Size:   ~470 MB (downloaded once)
Port:   http://localhost:8081
Languages: 109 languages including Thai and English

REQUIREMENTS
------------
  - Python 3    Download at: https://www.python.org/downloads/
  - Chrome or Edge browser
    (File System Access API is not supported in Firefox)

SETUP (first time on a new PC)
-------------------------------
1. Copy this entire folder from OneDrive to your local PC.

2. Download the model (ONE TIME — requires internet):
   Double-click: download_model.bat
   Wait for all 4 files to finish (~5-10 minutes, model is ~470 MB).

3. Start the app:
   Double-click: start.bat
   Your browser will open automatically at http://localhost:8081

4. Set your session folder (ONE TIME per PC):
   Click [📁 Sessions] -> [Set Session Folder]
   Pick your shared OneDrive sessions folder.
   The app will remember this folder on this PC.

DAILY USE
---------
1. Double-click start.bat
2. Click [Allow] when the browser asks for folder access (one click)
3. Pick a previous session to resume, or upload new files

NOTE: LaBSE model is larger and loads more slowly than L12-v2.
  - First load after starting: ~40-70 seconds (please be patient)
  - Embedding 100 rows: ~20-40 seconds
  - After first load, the model is cached by the browser

UPLOADING NEW FILES
-------------------
1. Click [Upload PDF] — select your presentation PDF
2. Click [Upload Excel] — select your detail table
   (Use [Download Template] to get the correct Excel format)
3. Wait for embeddings to compute (progress bar shown)
4. Session is saved automatically to your sessions folder

EXCEL FORMAT
------------
Your Excel file must have these exact column headers in row 1:
  - Page Number   (integer — the PDF page the slide appears on)
  - Topic         (short title for the slide)
  - Detail        (full description used for semantic search)

SEARCHING
---------
- Type a natural language query and press Enter or click [Search]
- Results are sorted from most to least relevant
- Click any row to view that slide in the PDF panel
- Use [⛶] to expand the PDF to full screen
- Arrow keys (← →) navigate pages when not typing in the search box

SESSION FOLDER NOTE
-------------------
- Both L12-v2 (port 8080) and LaBSE (port 8081) can share the same
  sessions folder on OneDrive.
- Each variant remembers the folder separately (first-time setup
  needed once per variant per PC).
- If you load a session saved by the other variant, a warning will
  appear (search scores may differ slightly).
