// ─── MODEL CONFIG (only this block differs between variants) ──────────────────
const MODEL_ID   = 'Xenova/LaBSE';
const MODEL_NAME = 'LaBSE';
const APP_PORT   = 8081;

// ─── IMPORTS ─────────────────────────────────────────────────────────────────
import { pipeline, env } from './libs/transformers.min.js';

// Use local model files; load WASM runtime from CDN (cached after first use)
env.localModelPath       = './model/';
env.allowRemoteModels    = false;
env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/';

// ─── GLOBALS ─────────────────────────────────────────────────────────────────
let embedder       = null;
let pdfDoc         = null;
let currentPage    = 1;
let totalPages     = 0;
let rows           = [];          // normalized row objects with embeddings
let sessionDirHandle = null;
const IDB_STORE    = 'session-handle';
const IDB_KEY      = 'dirHandle';
const LS_HISTORY   = `pss-history-${APP_PORT}`;

// ─── DOM REFS ─────────────────────────────────────────────────────────────────
const inputPdf      = document.getElementById('inputPdf');
const inputExcel    = document.getElementById('inputExcel');
const btnTemplate   = document.getElementById('btnTemplate');
const statusDot     = document.getElementById('statusDot');
const statusText    = document.getElementById('statusText');
const modelBadge    = document.getElementById('modelBadge');
const searchInput   = document.getElementById('searchInput');
const btnSearch     = document.getElementById('btnSearch');
const topNSelect    = document.getElementById('topNSelect');
const scoreSlider   = document.getElementById('scoreSlider');
const scoreVal      = document.getElementById('scoreVal');
const progressWrap  = document.getElementById('progressWrap');
const progressBar   = document.getElementById('progressBar');
const progressText  = document.getElementById('progressText');
const resultsBody   = document.getElementById('resultsBody');
const noResults     = document.getElementById('noResults');
const historyChips  = document.getElementById('historyChips');
const pdfCanvas     = document.getElementById('pdfCanvas');
const fsCanvas      = document.getElementById('fsCanvas');
const pdfPlaceholder = document.getElementById('pdfPlaceholder');
const pageInfo      = document.getElementById('pageInfo');
const fsPageInfo    = document.getElementById('fsPageInfo');
const btnPrev       = document.getElementById('btnPrev');
const btnNext       = document.getElementById('btnNext');
const fsBtnPrev     = document.getElementById('fsBtnPrev');
const fsBtnNext     = document.getElementById('fsBtnNext');
const btnFullscreen = document.getElementById('btnFullscreen');
const fsBtnClose    = document.getElementById('fsBtnClose');
const fullscreenOverlay = document.getElementById('fullscreenOverlay');
const sessionsModal = document.getElementById('sessionsModal');
const btnSessions   = document.getElementById('btnSessions');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnSetFolder  = document.getElementById('btnSetFolder');
const folderHint    = document.getElementById('folderHint');
const sessionList   = document.getElementById('sessionList');
const toast         = document.getElementById('toast');

// ─── STATUS HELPERS ───────────────────────────────────────────────────────────
function setStatus(msg, state = 'ready') {
  statusText.textContent = msg;
  statusDot.className = `status-dot ${state}`;
}

function showToast(msg, isWarning = false) {
  toast.textContent = msg;
  toast.className = `toast ${isWarning ? 'warn' : 'info'}`;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

function updateProgress(i, total) {
  const pct = Math.round((i / total) * 100);
  progressBar.style.width = pct + '%';
  progressText.textContent = `Embedding row ${i} of ${total}`;
}

function checkSearchReady() {
  const ready = embedder && pdfDoc && rows.length > 0;
  searchInput.disabled  = !ready;
  btnSearch.disabled    = !ready;
  if (ready) setStatus(`Ready — ${totalPages} pages, ${rows.length} rows`, 'ready');
}

// ─── MODEL INIT ───────────────────────────────────────────────────────────────
async function initModel() {
  modelBadge.textContent = MODEL_NAME;
  setStatus('Loading model…', 'loading');
  try {
    embedder = await pipeline('feature-extraction', MODEL_ID, { quantized: true });
    setStatus('Model ready — upload PDF and Excel to begin', 'ready');
  } catch (e) {
    setStatus('Model failed to load. Run download_model.bat first.', 'error');
    console.error(e);
  }
}

// ─── MATH HELPERS ─────────────────────────────────────────────────────────────
function dotProduct(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function normalize(v) {
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return mag === 0 ? v : v.map(x => x / mag);
}

function averageEmbeddings(embs) {
  const len = embs[0].length;
  const avg = new Array(len).fill(0);
  for (const e of embs) for (let i = 0; i < len; i++) avg[i] += e[i];
  for (let i = 0; i < len; i++) avg[i] /= embs.length;
  return normalize(avg);
}

function weightedCombine(a, b, wa, wb) {
  return normalize(a.map((x, i) => wa * x + wb * b[i]));
}

// ─── TEXT CHUNKING ───────────────────────────────────────────────────────────
function chunkText(text, maxChars = 400) {
  if (!text || text.length <= maxChars) return [text || ''];
  const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text];
}

async function embedWithChunking(text) {
  const chunks = chunkText(text);
  const embs = await Promise.all(chunks.map(async c => {
    const out = await embedder(c, { pooling: 'mean', normalize: true });
    return Array.from(out.data);
  }));
  return embs.length === 1 ? embs[0] : averageEmbeddings(embs);
}

// ─── EXCEL UPLOAD ─────────────────────────────────────────────────────────────
inputExcel.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file || !embedder) return;
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab);
  const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  if (!rawRows.length) { showToast('Excel file appears empty.', true); return; }

  rows = rawRows.map(r => ({
    pageNumber: Number(r['Page Number']) || 0,
    topic:      String(r['Topic']  || ''),
    detail:     String(r['Detail'] || ''),
    embedding:  null,
    score:      0,
  }));

  // Compute embeddings with progress
  progressWrap.style.display = 'block';
  setStatus('Computing embeddings…', 'loading');
  for (let i = 0; i < rows.length; i++) {
    const topicEmb  = await embedWithChunking(rows[i].topic);
    const detailEmb = await embedWithChunking(rows[i].detail);
    rows[i].embedding = weightedCombine(topicEmb, detailEmb, 0.3, 0.7);
    updateProgress(i + 1, rows.length);
  }
  progressWrap.style.display = 'none';
  checkSearchReady();

  // Auto-save session if folder is set
  if (sessionDirHandle && pdfDoc && currentPdfFile) {
    await saveSession(currentPdfFile);
  }
});

// ─── PDF UPLOAD ───────────────────────────────────────────────────────────────
let currentPdfFile = null;

inputPdf.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  currentPdfFile = file;
  await loadPDF(file);
});

async function loadPDF(file) {
  const ab = await file.arrayBuffer();
  pdfDoc = await pdfjsLib.getDocument({ data: ab }).promise;
  totalPages = pdfDoc.numPages;
  pdfPlaceholder.style.display = 'none';
  btnPrev.disabled  = false;
  btnNext.disabled  = false;
  btnFullscreen.disabled = false;
  await renderPage(1);
  checkSearchReady();
}

// ─── PDF RENDERING ────────────────────────────────────────────────────────────
async function renderPage(pageNum, targetCanvas = pdfCanvas, scale = 1.5) {
  if (!pdfDoc) return;
  currentPage = Math.max(1, Math.min(pageNum, totalPages));
  const page = await pdfDoc.getPage(currentPage);
  const viewport = page.getViewport({ scale });
  targetCanvas.width  = viewport.width;
  targetCanvas.height = viewport.height;
  await page.render({ canvasContext: targetCanvas.getContext('2d'), viewport }).promise;
  const info = `Page ${currentPage} of ${totalPages}`;
  pageInfo.textContent   = info;
  fsPageInfo.textContent = info;
  btnPrev.disabled = currentPage <= 1;
  btnNext.disabled = currentPage >= totalPages;
  fsBtnPrev.disabled = currentPage <= 1;
  fsBtnNext.disabled = currentPage >= totalPages;
}

btnPrev.addEventListener('click', () => renderPage(currentPage - 1));
btnNext.addEventListener('click', () => renderPage(currentPage + 1));
fsBtnPrev.addEventListener('click', () => { renderPage(currentPage - 1); renderPage(currentPage - 1, fsCanvas, 1.8); });
fsBtnNext.addEventListener('click', () => { renderPage(currentPage + 1); renderPage(currentPage + 1, fsCanvas, 1.8); });

// ─── FULLSCREEN ───────────────────────────────────────────────────────────────
btnFullscreen.addEventListener('click', async () => {
  fullscreenOverlay.style.display = 'flex';
  await renderPage(currentPage, fsCanvas, 1.8);
});
fsBtnClose.addEventListener('click', () => {
  fullscreenOverlay.style.display = 'none';
});

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const inInput = document.activeElement === searchInput;
  if (e.key === 'Enter' && inInput) { runSearch(); return; }
  if (e.key === 'Escape') { fullscreenOverlay.style.display = 'none'; return; }
  if (!inInput) {
    if (e.key === 'ArrowLeft')  { renderPage(currentPage - 1); if (fullscreenOverlay.style.display !== 'none') renderPage(currentPage, fsCanvas, 1.8); }
    if (e.key === 'ArrowRight') { renderPage(currentPage + 1); if (fullscreenOverlay.style.display !== 'none') renderPage(currentPage, fsCanvas, 1.8); }
  }
});

// G+number jump: accumulate digits typed outside input
let jumpBuffer = '';
let jumpTimer  = null;
document.addEventListener('keydown', e => {
  if (document.activeElement === searchInput) return;
  if (/^\d$/.test(e.key)) {
    jumpBuffer += e.key;
    clearTimeout(jumpTimer);
    jumpTimer = setTimeout(() => {
      const n = parseInt(jumpBuffer, 10);
      if (n >= 1 && n <= totalPages) renderPage(n);
      jumpBuffer = '';
    }, 800);
  }
});

// ─── TEMPLATE DOWNLOAD ────────────────────────────────────────────────────────
btnTemplate.addEventListener('click', () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Page Number', 'Topic', 'Detail'],
    [1, 'Introduction', 'Overview of the presentation scope and main objectives for this session.'],
    [2, 'Key Findings', 'Summary of the primary results, data insights, and conclusions from analysis.'],
    [3, 'Next Steps',   'Recommended actions, timelines, and responsible parties for follow-up items.'],
  ]);
  ws['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 60 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Slides');
  XLSX.writeFile(wb, 'template.xlsx');
});

// ─── SEARCH ───────────────────────────────────────────────────────────────────
btnSearch.addEventListener('click', runSearch);

function keywordScore(query, text) {
  const qWords = new Set(query.toLowerCase().split(/\s+/).filter(Boolean));
  if (!qWords.size) return 0;
  const tWords = text.toLowerCase().split(/\s+/);
  const hits = tWords.filter(w => qWords.has(w)).length;
  return hits / qWords.size;
}

async function runSearch() {
  const query = searchInput.value.trim();
  if (!query || !embedder || !rows.length) return;
  setStatus('Searching…', 'loading');
  addHistory(query);

  const qEmb = await embedWithChunking(query);
  rows.forEach(r => {
    const sem = dotProduct(qEmb, r.embedding);
    const kw  = keywordScore(query, `${r.detail} ${r.topic}`);
    r.rawScore = 0.7 * sem + 0.3 * kw;
  });

  // Min-max normalization (guard against single row)
  const scores = rows.map(r => r.rawScore);
  const min = Math.min(...scores), max = Math.max(...scores);
  const range = max - min;
  rows.forEach(r => { r.score = range === 0 ? 1.0 : (r.rawScore - min) / range; });

  renderTable([...rows].sort((a, b) => b.score - a.score));
  setStatus(`Found ${rows.length} results`, 'ready');
}

// ─── TABLE RENDERING ─────────────────────────────────────────────────────────
function renderTable(sorted) {
  const minScore = parseInt(scoreSlider.value) / 100;
  const topN     = parseInt(topNSelect.value);

  let filtered = sorted.filter(r => r.score >= minScore);
  if (topN > 0) filtered = filtered.slice(0, topN);

  resultsBody.innerHTML = '';
  noResults.style.display = filtered.length ? 'none' : 'block';

  filtered.forEach(row => {
    const tr = document.createElement('tr');
    tr.dataset.page = row.pageNumber;

    const scorePct = Math.round(row.score * 100);
    const badgeClass = scorePct >= 80 ? 'score-green' : scorePct >= 60 ? 'score-yellow' : 'score-gray';

    tr.innerHTML = `
      <td class="td-page">${row.pageNumber}</td>
      <td class="td-topic">${escHtml(row.topic)}</td>
      <td class="td-detail"><div class="detail-cell collapsed">${escHtml(row.detail)}</div></td>
      <td><span class="score-badge ${badgeClass}">${scorePct}%</span></td>
    `;

    // Click row → navigate PDF
    tr.addEventListener('click', async () => {
      document.querySelectorAll('#resultsBody tr').forEach(t => t.classList.remove('active'));
      tr.classList.add('active');
      await renderPage(row.pageNumber);
    });

    // Click detail cell to expand
    tr.querySelector('.detail-cell').addEventListener('click', e => {
      e.stopPropagation();
      e.currentTarget.classList.toggle('collapsed');
    });

    resultsBody.appendChild(tr);
  });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Re-render on filter change
scoreSlider.addEventListener('input', () => {
  scoreVal.textContent = scoreSlider.value + '%';
  if (rows.some(r => r.score !== 0)) renderTable([...rows].sort((a, b) => b.score - a.score));
});
topNSelect.addEventListener('change', () => {
  if (rows.some(r => r.score !== 0)) renderTable([...rows].sort((a, b) => b.score - a.score));
});

// ─── SEARCH HISTORY ───────────────────────────────────────────────────────────
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY) || '[]'); } catch { return []; }
}
function saveHistory(h) { localStorage.setItem(LS_HISTORY, JSON.stringify(h)); }

function addHistory(query) {
  let h = loadHistory().filter(q => q !== query);
  h.unshift(query);
  h = h.slice(0, 5);
  saveHistory(h);
  renderHistory();
}

function renderHistory() {
  historyChips.innerHTML = '';
  loadHistory().forEach(q => {
    const chip = document.createElement('button');
    chip.className = 'history-chip';
    chip.textContent = q;
    chip.addEventListener('click', () => { searchInput.value = q; runSearch(); });
    historyChips.appendChild(chip);
  });
}

// ─── SESSION FOLDER (File System Access API) ─────────────────────────────────

// Open IndexedDB
function openIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('pss-sessions', 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

async function persistHandleToIDB(handle) {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    tx.oncomplete = res;
    tx.onerror    = () => rej(tx.error);
  });
}

async function loadHandleFromIDB() {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => res(req.result || null);
    req.onerror   = () => rej(req.error);
  });
}

async function tryRestoreSessionFolder() {
  const handle = await loadHandleFromIDB();
  if (!handle) return;
  try {
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      sessionDirHandle = handle;
      folderHint.textContent = handle.name;
      await loadSessionList();
    }
  } catch { /* permission denied or handle stale */ }
}

btnSetFolder.addEventListener('click', async () => {
  try {
    sessionDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await persistHandleToIDB(sessionDirHandle);
    folderHint.textContent = sessionDirHandle.name;
    await loadSessionList();
  } catch { /* user cancelled */ }
});

async function saveSession(pdfFile) {
  if (!sessionDirHandle || !rows.length) return;
  const base = pdfFile.name.replace(/\.[^/.]+$/, '');
  const date = new Date().toISOString().slice(0, 10);
  const name = `${base}_${date}`;
  try {
    const subDir = await sessionDirHandle.getDirectoryHandle(name, { create: true });
    // Save PDF
    const pdfHandle = await subDir.getFileHandle(pdfFile.name, { create: true });
    const pdfWriter = await pdfHandle.createWritable();
    await pdfWriter.write(pdfFile);
    await pdfWriter.close();
    // Save session.json
    const jsonHandle = await subDir.getFileHandle('session.json', { create: true });
    const jsonWriter = await jsonHandle.createWritable();
    await jsonWriter.write(JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      pdfFilename: pdfFile.name,
      modelId: MODEL_ID,
      rows,
    }));
    await jsonWriter.close();
    await loadSessionList();
    showToast('Session saved.');
  } catch (e) { showToast('Could not save session: ' + e.message, true); }
}

async function loadSessionList() {
  if (!sessionDirHandle) return;
  const sessions = [];
  for await (const [name, handle] of sessionDirHandle.entries()) {
    if (handle.kind !== 'directory') continue;
    try {
      const jsonFile = await (await handle.getFileHandle('session.json')).getFile();
      const meta = JSON.parse(await jsonFile.text());
      sessions.push({ name, handle, meta });
    } catch { /* skip invalid folders */ }
  }
  sessions.sort((a, b) => b.meta.createdAt.localeCompare(a.meta.createdAt));
  renderSessionCards(sessions);
}

function renderSessionCards(sessions) {
  sessionList.innerHTML = '';
  if (!sessions.length) {
    sessionList.innerHTML = '<p class="session-empty">No sessions found in this folder.</p>';
    return;
  }
  sessions.forEach(entry => {
    const date = new Date(entry.meta.createdAt).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const card = document.createElement('div');
    card.className = 'session-card';
    card.innerHTML = `
      <div class="session-info">
        <span class="session-name" data-folder="${entry.name}">${entry.name}</span>
        <span class="session-date">${date}</span>
        <span class="session-model">${entry.meta.modelId || ''}</span>
      </div>
      <div class="session-btns">
        <button class="btn-rename" title="Rename">✏</button>
        <button class="btn-load">▶ Load</button>
      </div>
    `;

    // Load
    card.querySelector('.btn-load').addEventListener('click', async () => {
      await resumeSession(entry);
      sessionsModal.style.display = 'none';
    });

    // Rename
    card.querySelector('.btn-rename').addEventListener('click', async () => {
      const nameEl = card.querySelector('.session-name');
      const old = nameEl.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = old;
      input.className = 'rename-input';
      nameEl.replaceWith(input);
      input.focus();
      const commit = async () => {
        const newName = input.value.trim();
        if (newName && newName !== old) {
          try {
            // Move by copying then deleting is not directly supported;
            // we rename by creating new subdir, moving files, deleting old
            const newDir = await sessionDirHandle.getDirectoryHandle(newName, { create: true });
            for await (const [fname, fhandle] of entry.handle.entries()) {
              if (fhandle.kind !== 'file') continue;
              const file = await fhandle.getFile();
              const newFH = await newDir.getFileHandle(fname, { create: true });
              const w = await newFH.createWritable();
              await w.write(file);
              await w.close();
              await entry.handle.removeEntry(fname);
            }
            await sessionDirHandle.removeEntry(old);
            await loadSessionList();
          } catch (e) { showToast('Rename failed: ' + e.message, true); }
        } else {
          input.replaceWith(nameEl);
        }
      };
      input.addEventListener('blur',  commit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') input.replaceWith(nameEl); });
    });

    sessionList.appendChild(card);
  });
}

async function resumeSession(entry) {
  if (entry.meta.modelId && entry.meta.modelId !== MODEL_ID) {
    showToast(`⚠ Session created with ${entry.meta.modelId}. Search scores may be inaccurate.`, true);
  }
  try {
    const pdfFile = await (await entry.handle.getFileHandle(entry.meta.pdfFilename)).getFile();
    currentPdfFile = pdfFile;
    await loadPDF(pdfFile);
    rows = entry.meta.rows;
    checkSearchReady();
    setStatus(`Session restored — ${totalPages} pages, ${rows.length} rows`, 'ready');
  } catch (e) { showToast('Failed to load session: ' + e.message, true); }
}

// Sessions modal
btnSessions.addEventListener('click', () => { sessionsModal.style.display = 'flex'; });
btnCloseModal.addEventListener('click', () => { sessionsModal.style.display = 'none'; });
sessionsModal.addEventListener('click', e => { if (e.target === sessionsModal) sessionsModal.style.display = 'none'; });

// ─── INIT ─────────────────────────────────────────────────────────────────────
(async () => {
  renderHistory();
  await initModel();
  await tryRestoreSessionFolder();
})();
