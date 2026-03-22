# PDF Semantic Search

A browser-based semantic search tool for PDF presentations. Upload a PDF and a structured Excel table (Page Number, Topic, Detail), then search slide content using natural language queries.

## Features

- Semantic search using multilingual sentence embeddings
- Hybrid scoring: semantic similarity + keyword overlap
- Split-screen PDF viewer with page navigation and full-screen mode
- Session auto-save to a local or cloud folder (File System Access API)
- Resume previous sessions instantly — no re-computation needed
- Two model variants: L12-v2 (fast, ~118 MB) and LaBSE (highest quality, ~470 MB)
- Fully browser-based — no backend, no Python packages required

## Before You Start — Preparing Your Excel File

> **v1 does not extract content from the PDF automatically.**
> You must prepare the Excel file yourself before using this app.

This is intentional. In organizational settings, PDF documents may contain sensitive or confidential information. Extracting and summarizing content with an AI tool should go through your **organization's approved generative AI** to comply with data governance and acceptable-use policies.

**Recommended workflow:**

1. Open your PDF presentation
2. Use your organization's approved generative AI tool (e.g. **Microsoft Copilot**, or another sanctioned tool) to read each slide and produce a summary table with:
   - The page number
   - A short topic label
   - A detailed description of the slide content
3. Paste the output into the Excel template (download it from within the app)
4. Upload both the PDF and the completed Excel to this app

This ensures that all AI-assisted content extraction happens within your organization's approved environment, while this app handles only the local search and retrieval — entirely on your own machine with no data sent externally.

---

## How It Works

1. Upload a PDF (e.g. a slide deck) and an Excel file with columns: `Page Number`, `Topic`, `Detail`
2. The app computes semantic embeddings for each row — locally, on your machine
3. Type a natural language query — results are ranked by similarity
4. Click any result row to view that slide in the PDF viewer panel
5. Sessions are auto-saved so you can resume instantly next time

## Versions

| Version | Status | Notes |
|---------|--------|-------|
| `v1/` | Current release | Two model variants: L12-v2 and LaBSE |
| `v2/` | In development | — |

## Variants

| Variant | Model | Size | Best for |
|---------|-------|------|----------|
| `v1/L12-v2/` | paraphrase-multilingual-MiniLM-L12-v2 | ~118 MB | Fast, multilingual (50+ languages) |
| `v1/LaBSE/` | LaBSE | ~470 MB | Highest quality, 109 languages |

## Setup

See the `README.txt` inside each variant folder for step-by-step setup instructions.

**Requirements:**
- Python 3 — [python.org/downloads](https://www.python.org/downloads/)
- Chrome or Edge browser (File System Access API not supported in Firefox)

## Excel Template

Download the template from within the app (click "Download Template") or use the following column structure:

| Page Number | Topic | Detail |
|-------------|-------|--------|
| 1 | Introduction | Overview of the presentation scope and objectives |
| 2 | Key Findings | Summary of the main results and insights |

## License

MIT
