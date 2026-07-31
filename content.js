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

// ---------- Run on load + SPA nav ----------
function handlePageContext() {
  const classId = getClassId();
  if (!classId) return;
  currentClassId = classId;

  setTimeout(() => {
    scrapeTeachers(classId);
    scanStreamPosts();
    loadAndApplySavedFilter(classId);
    watchFeed(classId);
  }, 1500);
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