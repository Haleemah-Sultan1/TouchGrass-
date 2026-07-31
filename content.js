console.log("✅ TouchGrass GCR loaded");

// ---------- State ----------
let currentClassId = null;
let currentPath = location.pathname;
const postAuthorMap = new WeakMap();
let scannedPosts = [];
let feedObserver = null;

// ---------- Utils ----------
function getClassId() {
  const match = location.pathname.match(/\/(c|r)\/([^\/]+)/);
  return match ? match[2] : null;
}

function looksLikeName(line) {
  const words = line.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  for (const w of words) {
    if (/\d/.test(w) || w.includes('@') || w.includes('_') || w.includes('-')) return false;
    if (w[0] !== w[0].toUpperCase()) return false;
  }
  const uiText = ['View all', 'Invite', 'Email', 'Sort by', 'Options', 'Help', 'Posted', 'Edited', 'Class comment'];
  if (uiText.some(ui => line.includes(ui))) return false;
  return true;
}

// ---------- Teacher scraping (People page) ----------
function scrapeTeachers(classId) {
  const mainArea = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
  const fullText = mainArea.innerText;
  const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let teachers = [];
  let inTeachersSection = false;

  for (let line of lines) {
    if (line === 'Teachers') { inTeachersSection = true; continue; }
    if (inTeachersSection && (line === 'Classmates' || line.startsWith('Classmates '))) break;
    if (inTeachersSection && looksLikeName(line) && !teachers.includes(line)) {
      teachers.push(line);
    }
  }

  if (teachers.length > 0) {
    chrome.storage.local.get("classPeople", (data) => {
      const classPeople = data.classPeople || {};
      classPeople[classId] = { teachers, students: [], scrapedAt: Date.now() };
      chrome.storage.local.set({ classPeople }, () => {
        console.log("📇 Teachers saved for", classId, teachers);
      });
    });
  }
}

// ---------- Stream post scraping ----------
// Classroom's stream cards are marked with a data-stream-item-id attribute
// on (or near) each post. The earlier "main [role=listitem]" style
// selectors don't match Classroom's real markup at all, which is why
// nothing was ever found. This anchors off the real attribute instead.
function findPostContainers() {
  const markers = document.querySelectorAll('[data-stream-item-id]');

  let container = null;
  if (markers.length > 0) container = markers[0].parentElement;
  if (!container) container = document.querySelector('main') || document.body;

  let cards = Array.from(container.children).filter(el =>
    el.offsetHeight > 20 && el.offsetParent !== null
  );

  // Fallback: if that didn't yield a plausible list of cards, cast a wider
  // net across main's direct + grandchild elements as a best-effort guess.
  if (cards.length < 2) {
    const main = document.querySelector('main') || document.body;
    cards = Array.from(main.querySelectorAll(':scope > *, :scope > * > *'))
      .filter(el =>
        el.innerText &&
        el.innerText.trim().split('\n').length >= 2 &&
        el.offsetHeight > 40 &&
        el.offsetHeight < 2000 &&
        el.offsetParent !== null
      );
  }

  return cards;
}

function extractAuthorFromPost(postEl) {
  const lines = postEl.innerText.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    if (looksLikeName(lines[i])) return lines[i];
  }
  return null;
}

function scanStreamPosts() {
  const containers = findPostContainers();
  scannedPosts = [];

  containers.forEach(postEl => {
    const author = extractAuthorFromPost(postEl);
    if (author) {
      postAuthorMap.set(postEl, author);
      scannedPosts.push({ el: postEl, author });
    }
    // Pin button goes on every scanned card, whether or not we found an author for it.
    if (currentClassId) injectPinButton(postEl, currentClassId, author || 'Unknown');
  });

  console.log(`📰 Found ${scannedPosts.length} posts`, scannedPosts.map(p => p.author));
  return scannedPosts;
}

// ---------- Filtering ----------
function applyFilter(teacher) {
  scanStreamPosts();
  scannedPosts.forEach(({ el, author }) => {
    if (teacher === 'all' || !teacher) {
      el.style.display = '';
    } else {
      el.style.display = (author === teacher) ? '' : 'none';
    }
  });
}

function saveActiveFilter(classId, teacher) {
  chrome.storage.local.get("activeFilters", (data) => {
    const activeFilters = data.activeFilters || {};
    activeFilters[classId] = teacher;
    chrome.storage.local.set({ activeFilters });
  });
}

function loadAndApplySavedFilter(classId) {
  chrome.storage.local.get("activeFilters", (data) => {
    const teacher = (data.activeFilters || {})[classId];
    if (teacher && teacher !== 'all') applyFilter(teacher);
  });
}

// ==================== PIN FEATURE ====================
// Adds a 📌 button to every stream card. Pinning stores a snippet plus,
// when we can find one, a real permalink to that announcement - so
// clicking a pinned item later can navigate straight there.

const PIN_BTN_CLASS = 'tg-pin-btn';

function injectPinStyles() {
  if (document.getElementById('tg-pin-styles')) return;
  const style = document.createElement('style');
  style.id = 'tg-pin-styles';
  style.textContent = `
    .${PIN_BTN_CLASS} {
      position: absolute;
      top: 22px;
      right: 35px;
      background: none;
      border: none;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s, transform 0.15s;
      padding: 4px;
      border-radius: 6px;
      z-index: 10;
      font-size: 18px;
      line-height: 1;
      color: #999;
    }
    .${PIN_BTN_CLASS}:hover {
      transform: scale(1.15);
      background: rgba(127, 119, 221, 0.12);
    }
    .${PIN_BTN_CLASS}.tg-pinned-active {
      opacity: 1 !important;
      color: #7F77DD;
    }
    [data-tg-hoverable]:hover .${PIN_BTN_CLASS} {
      opacity: 1;
    }
    .tg-card-pinned {
      outline: 2px solid #7F77DD !important;
      box-shadow: 0 0 0 4px rgba(127, 119, 221, 0.13) !important;
      background-color: rgba(127, 119, 221, 0.05) !important;
    }
  `;
  document.head.appendChild(style);
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function getPostSnippet(postEl) {
  const text = postEl.innerText?.trim().replace(/\s+/g, ' ') || '';
  return text.slice(0, 120);
}

// Classroom stream cards usually have a timestamp link like
// /c/<classId>/p/<postId>/details buried inside them - that's a real,
// navigable permalink to the individual post.
function extractPinLink(postEl) {
  const anchors = Array.from(postEl.querySelectorAll('a[href*="/c/"]'));
  for (const a of anchors) {
    const href = a.getAttribute('href') || '';
    if (/\/c\/[^\/]+\/(p|a)\/[^\/]+/.test(href)) {
      return href.startsWith('http') ? href : (location.origin + href);
    }
  }
  return null;
}

function makePinId(postEl, snippet, link) {
  if (link) {
    const match = link.match(/\/(p|a)\/([^\/]+)/);
    if (match) return match[2];
  }
  return 'tg_' + hashString(snippet);
}

function getPinnedPosts(classId, callback) {
  chrome.storage.local.get("pinnedPosts", (data) => {
    const all = data.pinnedPosts || {};
    callback(all[classId] || []);
  });
}

function savePinnedPosts(classId, pins) {
  chrome.storage.local.get("pinnedPosts", (data) => {
    const all = data.pinnedPosts || {};
    all[classId] = pins;
    chrome.storage.local.set({ pinnedPosts: all });
  });
}

function togglePin(classId, pinId, snippet, link, el, btn) {
  getPinnedPosts(classId, (pins) => {
    const exists = pins.find(p => p.id === pinId);
    if (exists) {
      savePinnedPosts(classId, pins.filter(p => p.id !== pinId));
      btn.textContent = '📌';
      btn.title = 'Pin this post';
      btn.classList.remove('tg-pinned-active');
      el.classList.remove('tg-card-pinned');
    } else {
      const newPin = { id: pinId, snippet, url: link, pinnedAt: Date.now() };
      savePinnedPosts(classId, [...pins, newPin]);
      btn.textContent = '📍';
      btn.title = 'Unpin this post';
      btn.classList.add('tg-pinned-active');
      el.classList.add('tg-card-pinned');
    }
  });
}

function injectPinButton(postEl, classId, author) {
  if (postEl.querySelector('.' + PIN_BTN_CLASS)) return;
  injectPinStyles();
 
  postEl.setAttribute('data-tg-hoverable', '1');
  if (getComputedStyle(postEl).position === 'static') postEl.style.position = 'relative';
 
  const snippet = getPostSnippet(postEl);
  const link = extractPinLink(postEl);
  const pinId = makePinId(postEl, snippet, link);
 
  const btn = document.createElement('button');
  btn.className = PIN_BTN_CLASS;
  btn.textContent = '📌';
  btn.title = 'Pin this post';
  btn.setAttribute('aria-label', 'Pin this post');
 
  getPinnedPosts(classId, (pins) => {
    if (pins.find(p => p.id === pinId)) {
      btn.textContent = '📍';
      btn.title = 'Unpin this post';
      btn.classList.add('tg-pinned-active');
      postEl.classList.add('tg-card-pinned');
    }
  });
 
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    togglePin(classId, pinId, snippet, link, postEl, btn);
  });
 
  postEl.appendChild(btn);
}

// ---------- Watch feed for lazy-loaded posts ----------
function watchFeed(classId) {
  if (feedObserver) feedObserver.disconnect();
  const mainArea = document.querySelector('main') || document.body;
  feedObserver = new MutationObserver(() => {
    scanStreamPosts(); // re-scans + re-injects pin buttons on newly loaded cards
    chrome.storage.local.get("activeFilters", (data) => {
      const teacher = (data.activeFilters || {})[classId];
      if (teacher && teacher !== 'all') applyFilter(teacher);
    });
  });
  feedObserver.observe(mainArea, { childList: true, subtree: true });
}

// ==================== MILESTONE 7: COMMENT SUMMARIZATION ====================
// Everything in this section is new and additive. It only activates on a
// specific coursework detail page (/c/<classId>/a/<courseworkId>/details)
// and does not touch any of the stream/pin/dark-mode/people logic above.

function isCourseworkDetailPage() {
  return /\/c\/[^\/]+\/a\/[^\/]+\/details/.test(location.pathname);
}

function getCourseworkIdFromUrl() {
  const match = location.pathname.match(/\/c\/[^\/]+\/a\/([^\/]+)\/details/);
  return match ? match[1] : null;
}

// Kept for potential future use, but scrapeClassComments() below no longer
// relies on this — DOM-structure guessing proved unreliable, since the
// comments list isn't a close ancestor of the "N class comments" heading.
function findClassCommentsContainer() {
  const candidates = Array.from(document.querySelectorAll('div, span, h2, h3'));
  const heading = candidates.find(el =>
    el.children.length === 0 &&
    /^\s*\d+\s+class comments?\s*$/i.test(el.textContent || '')
  );
  if (!heading) return null;

  let node = heading;
  for (let i = 0; i < 5; i++) {
    if (!node.parentElement) break;
    node = node.parentElement;
    if (node.innerText && node.innerText.split('\n').length > 4) {
      return node;
    }
  }
  return heading.parentElement || heading;
}

// Scrapes {author, dateStr, text} for every class comment by working off
// the FULL PAGE's flattened text (main.innerText) rather than trying to
// locate a specific DOM container. The "N class comments" heading marks
// where to start reading from — everything before it (assignment
// description, "Your work" panel, etc.) is discarded, and everything after
// is parsed for "Name • Date" comment headers, stopping at the
// "Add class comment..." input. This is more robust than DOM-structure
// guessing since innerText reflects everything rendered regardless of how
// or where it's nested in the tree.
function scrapeClassComments() {
  const fullText = (document.querySelector('main') || document.body).innerText || '';
  const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const startIndex = lines.findIndex(l => /^\d+\s+class comments?$/i.test(l));
  if (startIndex === -1) {
    console.warn('TouchGrass: could not locate "N class comments" heading on this page.');
    return [];
  }

  const relevantLines = lines.slice(startIndex + 1);

  console.log('TouchGrass DEBUG — lines after "class comments" heading:');
  relevantLines.slice(0, 30).forEach((l, i) => console.log(`  [${i}] "${l}"`));

  // "Name • Apr 20", "Name • May 2", "Name • Just now", "Name • Edited May 2"
  const headerRegex = /^(.{1,60}?)\s*•\s*((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(,\s*\d{4})?|Just now|Yesterday|Edited\s+.+)$/i;
  // Stop parsing once we hit the "Add class comment..." input placeholder,
  // which marks the end of the comment list.
  const stopRegex = /^add class comment/i;

  const rawEntries = [];
  let current = null;

  for (const line of relevantLines) {
    if (stopRegex.test(line)) break;

    const match = line.match(headerRegex);
    if (match) {
      if (current) rawEntries.push(current);
      current = { author: match[1].trim(), dateStr: match[2].trim(), textLines: [] };
    } else if (current) {
      current.textLines.push(line);
    }
  }
  if (current) rawEntries.push(current);

  const seen = new Set();
  const comments = [];
  rawEntries.forEach(entry => {
    const text = entry.textLines.join(' ').trim();
    if (!text) return;
    const key = entry.author + '|' + text;
    if (seen.has(key)) return;
    seen.add(key);
    comments.push({ author: entry.author, dateStr: entry.dateStr, text });
  });

  console.log(`TouchGrass: scraped ${comments.length} class comment(s).`);
  return comments;
}

// Tags each comment's author using the SAME classPeople storage the
// existing People-page scraper already populates (keyed by the same
// classId getClassId() returns) — no new roster fetching needed.
function tagCommentsWithRoles(comments, classId, callback) {
  chrome.storage.local.get("classPeople", (data) => {
    const known = (data.classPeople || {})[classId] || { teachers: [], students: [] };
    const teacherSet = new Set(known.teachers || []);
    const studentSet = new Set(known.students || []);

    const tagged = comments.map(c => ({
      ...c,
      role: teacherSet.has(c.author) ? 'teacher' : (studentSet.has(c.author) ? 'student' : 'unknown'),
    }));
    callback(tagged);
  });
}

// ---- Injected UI: floating button + sliding sidebar panel ----

function injectCommentSummaryStyles() {
  if (document.getElementById('tg-comment-summary-styles')) return;
  const style = document.createElement('style');
  style.id = 'tg-comment-summary-styles';
  style.textContent = `
    #tg-summary-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: linear-gradient(135deg, #7F77DD, #534AB7);
      color: white;
      border: none;
      border-radius: 999px;
      padding: 12px 20px;
      font-family: sans-serif;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 6px 18px rgba(83, 74, 183, 0.4);
      transition: transform 0.15s;
    }
    #tg-summary-fab:hover {
      transform: scale(1.04);
    }
    #tg-summary-panel {
      position: fixed;
      top: 0;
      right: -420px;
      width: 400px;
      height: 100vh;
      background: #16151d;
      box-shadow: -8px 0 24px rgba(0,0,0,0.35);
      z-index: 1000000;
      font-family: sans-serif;
      color: #eee;
      transition: right 0.25s ease;
      display: flex;
      flex-direction: column;
    }
    #tg-summary-panel.tg-open {
      right: 0;
    }
    #tg-summary-header {
      padding: 18px 20px;
      border-bottom: 1px solid #2a2a35;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #tg-summary-header h2 {
      font-size: 16px;
      margin: 0;
      color: #cfc9ff;
    }
    #tg-summary-close {
      background: none;
      border: none;
      color: #999;
      font-size: 20px;
      cursor: pointer;
      line-height: 1;
    }
    #tg-summary-close:hover {
      color: #fff;
    }
    #tg-summary-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
    }
    #tg-summary-status {
      font-size: 13px;
      color: #9c94e8;
      padding: 8px 0;
    }
    .tg-query-card {
      background: #1e1d29;
      border: 1px solid #2f2d40;
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 14px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    }
    .tg-query-card .tg-q-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #a99bff;
      margin-bottom: 4px;
    }
    .tg-query-card .tg-q-text {
      font-size: 13.5px;
      color: #f0f0f5;
      margin-bottom: 12px;
      line-height: 1.4;
    }
    .tg-query-card .tg-a-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #7fe0b0;
      margin-bottom: 4px;
    }
    .tg-query-card .tg-a-text {
      font-size: 13.5px;
      color: #d8f5e6;
      line-height: 1.4;
    }
    .tg-query-card .tg-a-text.tg-unanswered {
      color: #f2a154;
      font-style: italic;
    }
    .tg-query-card .tg-teacher-name {
      display: inline-block;
      margin-top: 8px;
      font-size: 11px;
      color: #888;
    }
  `;
  document.head.appendChild(style);
}

function getOrCreateSummaryPanel() {
  let panel = document.getElementById('tg-summary-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'tg-summary-panel';
    panel.innerHTML = `
      <div id="tg-summary-header">
        <h2>💬 Comment Summary</h2>
        <button id="tg-summary-close">✕</button>
      </div>
      <div id="tg-summary-body"></div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#tg-summary-close').addEventListener('click', () => {
      panel.classList.remove('tg-open');
    });
  }
  return panel;
}

function renderQueryCards(queries) {
  const body = document.getElementById('tg-summary-body');
  if (!body) return;
  body.innerHTML = '';

  if (!queries || queries.length === 0) {
    body.innerHTML = '<div id="tg-summary-status">No student questions found in the class comments.</div>';
    return;
  }

  queries.forEach(q => {
    const card = document.createElement('div');
    card.className = 'tg-query-card';
    const isUnanswered = !q.teacherReply || /not answered yet/i.test(q.teacherReply);
    card.innerHTML = `
      <div class="tg-q-label">Question</div>
      <div class="tg-q-text">${escapeHtml(q.query)}</div>
      <div class="tg-a-label">Answer</div>
      <div class="tg-a-text${isUnanswered ? ' tg-unanswered' : ''}">${escapeHtml(q.teacherReply || 'Not answered yet')}</div>
      ${(!isUnanswered && q.teacherName) ? `<div class="tg-teacher-name">— ${escapeHtml(q.teacherName)}</div>` : ''}
    `;
    body.appendChild(card);
  });
}

function runCommentSummary(classId, courseworkId) {
  const panel = getOrCreateSummaryPanel();
  panel.classList.add('tg-open');
  const body = document.getElementById('tg-summary-body');
  body.innerHTML = '<div id="tg-summary-status">Reading class comments…</div>';

  const rawComments = scrapeClassComments();
  if (rawComments.length === 0) {
    body.innerHTML = '<div id="tg-summary-status">No class comments found on this page. Make sure comments have loaded, then try again.</div>';
    return;
  }

  tagCommentsWithRoles(rawComments, classId, (tagged) => {
    body.innerHTML = '<div id="tg-summary-status">Summarizing questions and answers…</div>';
    chrome.runtime.sendMessage(
      { type: 'SUMMARIZE_COMMENTS', comments: tagged, classId, courseworkId },
      (resp) => {
        if (chrome.runtime.lastError) {
          body.innerHTML = `<div id="tg-summary-status">Error: ${escapeHtml(chrome.runtime.lastError.message)}</div>`;
          return;
        }
        if (resp && resp.ok) {
          renderQueryCards(resp.queries);
        } else {
          body.innerHTML = `<div id="tg-summary-status">❌ Failed: ${escapeHtml(resp?.error || 'unknown error')}</div>`;
        }
      }
    );
  });
}

function injectCommentSummaryButton(classId, courseworkId) {
  if (document.getElementById('tg-summary-fab')) return;
  injectCommentSummaryStyles();

  const fab = document.createElement('button');
  fab.id = 'tg-summary-fab';
  fab.textContent = '💬 Summarize Comments';
  fab.addEventListener('click', () => runCommentSummary(classId, courseworkId));
  document.body.appendChild(fab);
}

// ---------- Run on load + SPA nav ----------
function handlePageContext() {
  const classId = getClassId();
  if (!classId) return;
  currentClassId = classId;

  if (isPeoplePage()) {
    window.__tgTeachers = new Map();
    window.__tgStudents = new Map();
    setTimeout(() => startPeopleAccumulator(classId), 800);
  } else if (isCourseworkDetailPage()) {
    const courseworkId = getCourseworkIdFromUrl();
    setTimeout(() => injectCommentSummaryButton(classId, courseworkId), 800);
  } else {
    injectPinStyles();
    loadDarkMode();
    let attempts = 0;
    const tryInit = () => {
      attempts++;
      const cards = findStreamCards();
      if (cards.length > 0 || attempts > 10) {
        scanStreamPosts();
        injectPinButtonsOnAllCards(classId);
        refreshPinBar(classId);
        loadAndApplySavedFilter(classId);
        watchFeed(classId);
      } else {
        setTimeout(tryInit, 800);
      }
    };
    setTimeout(tryInit, 800);
  }
}

handlePageContext();

setInterval(() => {
  if (location.pathname !== currentPath) {
    currentPath = location.pathname;
    handlePageContext();
  }
}, 800);

// ---------- Messages from popup ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SET_FILTER') {
    applyFilter(msg.teacher);
    if (currentClassId) saveActiveFilter(currentClassId, msg.teacher);
    sendResponse({ ok: true, postsFound: scannedPosts.length });
  }
  if (msg.type === 'GET_DEBUG') {
    sendResponse({ classId: currentClassId, postsFound: scannedPosts.length, authors: scannedPosts.map(p => p.author) });
  }
  if (msg.type === 'GET_PINS') {
    getPinnedPosts(msg.classId || currentClassId, (pins) => {
      sendResponse({ pins });
    });
    return true; // async response
  }
  if (msg.type === 'SCROLL_TO_PIN') {
    scanStreamPosts();
    const containers = findPostContainers();
    let found = null;
    for (const el of containers) {
      const snippet = getPostSnippet(el);
      const link = extractPinLink(el);
      const id = makePinId(el, snippet, link);
      if (id === msg.pinId) { found = el; break; }
    }
    if (found) {
      found.scrollIntoView({ behavior: 'smooth', block: 'center' });
      found.style.transition = 'box-shadow 0.3s';
      found.style.boxShadow = '0 0 0 4px rgba(127, 119, 221, 0.5)';
      setTimeout(() => { found.style.boxShadow = ''; }, 1500);
    }
    sendResponse({ found: !!found });
  }
  if (msg.type === 'UNPIN_FROM_POPUP') {
    getPinnedPosts(currentClassId, (pins) => {
      const updated = pins.filter(p => p.id !== msg.pinId);
      savePinnedPosts(currentClassId, updated);
      scanStreamPosts();
      const containers = findPostContainers();
      for (const el of containers) {
        const snippet = getPostSnippet(el);
        const link = extractPinLink(el);
        const id = makePinId(el, snippet, link);
        if (id === msg.pinId) {
          el.classList.remove('tg-card-pinned');
          const btn = el.querySelector('.' + PIN_BTN_CLASS);
          if (btn) {
            btn.textContent = '📌';
            btn.title = 'Pin this post';
            btn.classList.remove('tg-pinned-active');
          }
          break;
        }
      }
    });
    sendResponse({ ok: true });
  }
  return true;
});