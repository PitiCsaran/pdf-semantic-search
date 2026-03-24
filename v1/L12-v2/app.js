// ─── MODEL CONFIG (only this block differs between variants) ──────────────────
const MODEL_ID   = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const MODEL_NAME = 'multilingual-MiniLM-L12-v2';
const APP_PORT   = 8080;

// ─── IMPORTS ─────────────────────────────────────────────────────────────────
import { pipeline, env } from './libs/transformers.min.js';

// Use local model files; load WASM runtime from CDN (cached after first use)
env.localModelPath       = './model/';
env.allowRemoteModels    = false;
env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const MAIN_SCALE  = 1.5;
const THUMB_SCALE = 0.15;

// ─── GLOBALS ─────────────────────────────────────────────────────────────────
let embedder       = null;
let pdfDoc         = null;
let currentPage    = 1;
let totalPages     = 0;
let rows           = [];
let pageWrappers   = [];   // [{ wrapper, canvas, rendered }]
let scrollObserver = null;
let renderObserver = null;
let thumbObserver  = null;
let sessionDirHandle = null;
const IDB_STORE    = 'session-handle';
const IDB_KEY      = 'dirHandle';
const LS_HISTORY   = `pss-history-${APP_PORT}`;

// ─── DOM REFS ─────────────────────────────────────────────────────────────────
const inputPdf          = document.getElementById('inputPdf');
const inputExcel        = document.getElementById('inputExcel');
const btnTemplate       = document.getElementById('btnTemplate');
const statusDot         = document.getElementById('statusDot');
const statusText        = document.getElementById('statusText');
const modelBadge        = document.getElementById('modelBadge');
const searchInput       = document.getElementById('searchInput');
const btnSearch         = document.getElementById('btnSearch');
const topNSelect        = document.getElementById('topNSelect');
const scoreSlider       = document.getElementById('scoreSlider');
const scoreVal          = document.getElementById('scoreVal');
const progressWrap      = document.getElementById('progressWrap');
const progressBar       = document.getElementById('progressBar');
const progressText      = document.getElementById('progressText');
const resultsBody       = document.getElementById('resultsBody');
const noResults         = document.getElementById('noResults');
const historyChips      = document.getElementById('historyChips');
const fsCanvas          = document.getElementById('fsCanvas');
const pdfPlaceholder    = document.getElementById('pdfPlaceholder');
const pageInfo          = document.getElementById('pageInfo');
const fsPageInfo        = document.getElementById('fsPageInfo');
const fsBtnPrev         = document.getElementById('fsBtnPrev');
const fsBtnNext         = document.getElementById('fsBtnNext');
const btnFullscreen     = document.getElementById('btnFullscreen');
const fsBtnClose        = document.getElementById('fsBtnClose');
const fullscreenOverlay = document.getElementById('fullscreenOverlay');
const btnToggleThumbs   = document.getElementById('btnToggleThumbs');
const pdfViewerBody     = document.getElementById('pdfViewerBody');
const thumbnailStrip    = document.getElementById('thumbnailStrip');
const pdfScrollView     = document.getElementById('pdfScrollView');
const sessionsModal     = document.getElementById('sessionsModal');
const btnSessions       = document.getElementById('btnSessions');
const btnCloseModal     = document.getElementById('btnCloseModal');
const btnSetFolder      = document.getElementById('btnSetFolder');
const folderHint        = document.getElementById('folderHint');
const sessionList       = document.getElementById('sessionList');
const toast             = document.getElementById('toast');

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
  searchInput.disabled = !ready;
  btnSearch.disabled   = !ready;
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
  btnFullscreen.disabled = false;
  await setupScrollView();
  await renderAllThumbnails();
  navigateToPage(1, false);
  checkSearchReady();
}

// ─── PDF SCROLL VIEW SETUP ────────────────────────────────────────────────────
async function setupScrollView() {
  if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }
  if (renderObserver) { renderObserver.disconnect(); renderObserver = null; }

  pdfScrollView.innerHTML = '';
  pageWrappers = [];

  // Track which page is most visible → update page info + thumbnail highlight
  scrollObserver = new IntersectionObserver(entries => {
    let best = null, bestRatio = 0;
    entries.forEach(e => {
      if (e.isIntersecting && e.intersectionRatio > bestRatio) {
        bestRatio = e.intersectionRatio;
        best = e.target;
      }
    });
    if (best) {
      const p = parseInt(best.dataset.page);
      if (p !== currentPage) {
        currentPage = p;
        updatePageInfo();
        highlightThumb(currentPage);
        syncThumbScroll(currentPage);
      }
    }
  }, { root: pdfScrollView, threshold: [0.1, 0.3, 0.5, 0.7] });

  // Lazy-render pages as they approach the viewport
  renderObserver = new IntersectionObserver(async entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const i = parseInt(e.target.dataset.page) - 1;
      const pw = pageWrappers[i];
      if (pw && !pw.rendered) {
        pw.rendered = true;
        await renderPageToCanvas(i + 1, pw.canvas, MAIN_SCALE);
      }
    }
  }, { root: pdfScrollView, rootMargin: '400px' });

  // Use first page dimensions as placeholder size for all canvases
  const firstPage = await pdfDoc.getPage(1);
  const firstVP   = firstPage.getViewport({ scale: MAIN_SCALE });

  for (let p = 1; p <= totalPages; p++) {
    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.dataset.page = p;
    const canvas = document.createElement('canvas');
    canvas.width  = firstVP.width;
    canvas.height = firstVP.height;
    wrapper.appendChild(canvas);
    pdfScrollView.appendChild(wrapper);
    pageWrappers.push({ wrapper, canvas, rendered: false });
    scrollObserver.observe(wrapper);
    renderObserver.observe(wrapper);
  }
}

// ─── THUMBNAIL STRIP ──────────────────────────────────────────────────────────
async function renderAllThumbnails() {
  if (thumbObserver) { thumbObserver.disconnect(); thumbObserver = null; }
  thumbnailStrip.innerHTML = '';

  // Lazy-render thumbnails as they scroll into view in the strip
  thumbObserver = new IntersectionObserver(async entries => {
    for (const e of entries) {
      if (!e.isIntersecting || e.target.dataset.rendered) continue;
      e.target.dataset.rendered = '1';
      const p      = parseInt(e.target.dataset.page);
      const canvas = e.target.querySelector('canvas');
      await renderPageToCanvas(p, canvas, THUMB_SCALE);
    }
  }, { root: thumbnailStrip, rootMargin: '300px' });

  for (let p = 1; p <= totalPages; p++) {
    const item   = document.createElement('div');
    item.className = 'thumb-item';
    item.dataset.page = p;
    const canvas = document.createElement('canvas');
    const label  = document.createElement('span');
    label.textContent = p;
    item.appendChild(canvas);
    item.appendChild(label);
    item.addEventListener('click', () => navigateToPage(p));
    thumbnailStrip.appendChild(item);
    thumbObserver.observe(item);
  }
}

// ─── SHARED RENDER HELPER ────────────────────────────────────────────────────
async function renderPageToCanvas(pageNum, canvas, scale) {
  const page = await pdfDoc.getPage(pageNum);
  const vp   = page.getViewport({ scale });
  canvas.width  = vp.width;
  canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
}

// ─── PAGE NAVIGATION ──────────────────────────────────────────────────────────
function navigateToPage(pageNum, smooth = true) {
  if (!pdfDoc || !pageWrappers.length) return;
  currentPage = Math.max(1, Math.min(pageNum, totalPages));
  const wrapper = pageWrappers[currentPage - 1].wrapper;
  // Scroll within the pdfScrollView container directly
  const containerRect = pdfScrollView.getBoundingClientRect();
  const wrapperRect   = wrapper.getBoundingClientRect();
  const offset = wrapperRect.top - containerRect.top + pdfScrollView.scrollTop - 16;
  pdfScrollView.scrollTo({ top: offset, behavior: smooth ? 'smooth' : 'instant' });
  updatePageInfo();
  highlightThumb(currentPage);
  syncThumbScroll(currentPage);
}

function updatePageInfo() {
  if (!pageInfo.isConnected) return; // input is showing instead
  pageInfo.textContent = `${currentPage} / ${totalPages}`;
}

function highlightThumb(pageNum) {
  thumbnailStrip.querySelectorAll('.thumb-item').forEach(el => el.classList.remove('active'));
  const active = thumbnailStrip.querySelector(`.thumb-item[data-page="${pageNum}"]`);
  if (active) active.classList.add('active');
}

function syncThumbScroll(pageNum) {
  const t = thumbnailStrip.querySelector(`.thumb-item[data-page="${pageNum}"]`);
  if (!t) return;
  const cr = thumbnailStrip.getBoundingClientRect();
  const tr = t.getBoundingClientRect();
  const offset = tr.top - cr.top + thumbnailStrip.scrollTop - thumbnailStrip.clientHeight / 2;
  thumbnailStrip.scrollTo({ top: offset, behavior: 'smooth' });
}

// ─── EDITABLE PAGE NUMBER ─────────────────────────────────────────────────────
pageInfo.addEventListener('click', () => {
  if (!pdfDoc) return;
  const input = document.createElement('input');
  input.type = 'number';
  input.min  = 1;
  input.max  = totalPages;
  input.value = currentPage;
  input.className = 'page-input-edit';
  pageInfo.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const n = parseInt(input.value);
    input.replaceWith(pageInfo);
    if (n >= 1 && n <= totalPages) navigateToPage(n);
    else updatePageInfo();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { input.replaceWith(pageInfo); updatePageInfo(); }
  });
});

// ─── THUMBNAIL TOGGLE ─────────────────────────────────────────────────────────
btnToggleThumbs.addEventListener('click', () => {
  pdfViewerBody.classList.toggle('thumbs-hidden');
});

// ─── FULLSCREEN ───────────────────────────────────────────────────────────────
btnFullscreen.addEventListener('click', async () => {
  fullscreenOverlay.style.display = 'flex';
  fsBtnPrev.disabled = currentPage <= 1;
  fsBtnNext.disabled = currentPage >= totalPages;
  fsPageInfo.textContent = `${currentPage} / ${totalPages}`;
  await renderPageToCanvas(currentPage, fsCanvas, 1.8);
});

fsBtnClose.addEventListener('click', () => {
  fullscreenOverlay.style.display = 'none';
});

async function fsNavigate(delta) {
  const next = Math.max(1, Math.min(currentPage + delta, totalPages));
  if (next === currentPage) return;
  currentPage = next;
  fsBtnPrev.disabled = currentPage <= 1;
  fsBtnNext.disabled = currentPage >= totalPages;
  fsPageInfo.textContent = `${currentPage} / ${totalPages}`;
  await renderPageToCanvas(currentPage, fsCanvas, 1.8);
  updatePageInfo();
  highlightThumb(currentPage);
}

fsBtnPrev.addEventListener('click', () => fsNavigate(-1));
fsBtnNext.addEventListener('click', () => fsNavigate(1));

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const inInput = document.activeElement === searchInput;
  if (e.key === 'Enter' && inInput) { runSearch(); return; }
  if (e.key === 'Escape') { fullscreenOverlay.style.display = 'none'; return; }
  if (!inInput) {
    const isFS = fullscreenOverlay.style.display !== 'none';
    if (e.key === 'ArrowLeft')  { if (isFS) fsNavigate(-1); else navigateToPage(currentPage - 1); }
    if (e.key === 'ArrowRight') { if (isFS) fsNavigate(1);  else navigateToPage(currentPage + 1); }
  }
});

// Digit accumulation → jump to page (when outside search input)
let jumpBuffer = '';
let jumpTimer  = null;
document.addEventListener('keydown', e => {
  if (document.activeElement === searchInput) return;
  if (/^\d$/.test(e.key)) {
    jumpBuffer += e.key;
    clearTimeout(jumpTimer);
    jumpTimer = setTimeout(() => {
      const n = parseInt(jumpBuffer, 10);
      if (n >= 1 && n <= totalPages) navigateToPage(n);
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

    const scorePct   = Math.round(row.score * 100);
    const badgeClass = scorePct >= 80 ? 'score-green' : scorePct >= 60 ? 'score-yellow' : 'score-gray';

    tr.innerHTML = `
      <td class="td-page">${row.pageNumber}</td>
      <td class="td-topic">${escHtml(row.topic)}</td>
      <td class="td-detail"><div class="detail-cell collapsed">${escHtml(row.detail)}</div></td>
      <td><span class="score-badge ${badgeClass}">${scorePct}%</span></td>
    `;

    tr.addEventListener('click', () => {
      document.querySelectorAll('#resultsBody tr').forEach(t => t.classList.remove('active'));
      tr.classList.add('active');
      navigateToPage(row.pageNumber);
    });

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
  } catch { /* permission denied or stale handle */ }
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
    const pdfHandle = await subDir.getFileHandle(pdfFile.name, { create: true });
    const pdfWriter = await pdfHandle.createWritable();
    await pdfWriter.write(pdfFile);
    await pdfWriter.close();
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
        <button class="btn-rename" title="Rename">&#9998;</button>
        <button class="btn-load">&#9654; Load</button>
      </div>
    `;

    card.querySelector('.btn-load').addEventListener('click', async () => {
      await resumeSession(entry);
      sessionsModal.style.display = 'none';
    });

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
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') input.replaceWith(nameEl);
      });
    });

    sessionList.appendChild(card);
  });
}

async function resumeSession(entry) {
  if (entry.meta.modelId && entry.meta.modelId !== MODEL_ID) {
    showToast(`Session created with ${entry.meta.modelId}. Search scores may be inaccurate.`, true);
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

btnSessions.addEventListener('click', () => { sessionsModal.style.display = 'flex'; });
btnCloseModal.addEventListener('click', () => { sessionsModal.style.display = 'none'; });
sessionsModal.addEventListener('click', e => { if (e.target === sessionsModal) sessionsModal.style.display = 'none'; });

// ─── INIT ─────────────────────────────────────────────────────────────────────
(async () => {
  renderHistory();
  await initModel();
  await tryRestoreSessionFolder();
})();
