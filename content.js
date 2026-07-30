console.log("TouchGrass GCR loaded");

let currentClassId = null;
let currentPath = location.pathname;
let scannedPosts = [];
let feedObserver = null;
let debounceTimer = null;
let currentMatchIndex = -1;
let currentKnownTotal = null; // NEW: real total from synced API data, set by SET_FILTER

window.__tgTeachers = window.__tgTeachers || new Map();
window.__tgStudents = window.__tgStudents || new Map();

function cleanupPreviousState() {
  document.querySelectorAll('.tg-pin-btn').forEach(el => el.remove());
  document.querySelectorAll('.tg-pinned-badge').forEach(el => el.remove());
  document.querySelectorAll('.tg-card-pinned').forEach(el => {
    el.classList.remove('tg-card-pinned');
    el.style.outline = '';
    el.style.boxShadow = '';
    el.style.backgroundColor = '';
  });
  const bar = document.getElementById('tg-pin-bar');
  if (bar) bar.classList.add('tg-bar-hidden');
  scannedPosts = [];
}

// ==================== PIN STYLES ====================

function injectPinStyles() {
  if (document.getElementById('tg-pin-styles')) return;
  const style = document.createElement('style');
  style.id = 'tg-pin-styles';
  style.textContent = `
    .tg-pin-btn {
      position: absolute;
      top: 10px;
      right: 10px;
      background: none;
      border: none;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s, transform 0.15s;
      padding: 4px;
      border-radius: 6px;
      z-index: 9999;
      font-size: 18px;
      line-height: 1;
    }
    .tg-pin-btn:hover {
      transform: scale(1.15);
      background: rgba(127, 119, 221, 0.12);
    }
    .tg-pin-btn.tg-pinned-active {
      opacity: 1 !important;
    }
    [data-tg-hoverable]:hover .tg-pin-btn {
      opacity: 1;
    }
    .tg-card-pinned {
      outline: 2px solid #7F77DD !important;
      box-shadow: 0 0 0 4px rgba(127, 119, 221, 0.13) !important;
      background-color: rgba(127, 119, 221, 0.05) !important;
    }
    .tg-pinned-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      color: #534AB7;
      background: rgba(127, 119, 221, 0.13);
      border-radius: 20px;
      padding: 2px 8px;
      margin-bottom: 6px;
      letter-spacing: 0.02em;
    }

    #tg-pin-bar {
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: #1a1a1a;
      border-radius: 0 0 14px 14px;
      box-shadow: 0 4px 18px rgba(0,0,0,0.35);
      font-family: sans-serif;
      max-width: 80vw;
      overflow: hidden;
      transition: opacity 0.2s;
    }
    #tg-pin-bar.tg-bar-hidden {
      opacity: 0;
      pointer-events: none;
    }
    #tg-pin-bar-label {
      font-size: 11px;
      color: #7F77DD;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      white-space: nowrap;
      margin-right: 4px;
    }
    .tg-bar-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #2a2a2a;
      border: 1px solid #3a3a3a;
      border-radius: 999px;
      padding: 3px 10px 3px 7px;
      font-size: 12px;
      color: #ddd;
      cursor: pointer;
      white-space: nowrap;
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: background 0.15s, border-color 0.15s;
      flex-shrink: 0;
    }
    .tg-bar-chip:hover {
      background: #3a3060;
      border-color: #7F77DD;
      color: #fff;
    }
    .tg-bar-chip-icon {
      font-size: 13px;
      flex-shrink: 0;
    }
    .tg-bar-chip-unpin {
      font-size: 10px;
      color: #555;
      margin-left: 2px;
      cursor: pointer;
      padding: 0 2px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .tg-bar-chip-unpin:hover {
      color: #f87171;
      background: rgba(248,113,113,0.15);
    }
    #tg-pin-bar-empty {
      font-size: 12px;
      color: #444;
      font-style: italic;
    }
  `;
  document.head.appendChild(style);
}

// ==================== DARK MODE ====================

function injectDarkModeStyles() {
  if (document.getElementById('tg-dark-styles')) return;
  const style = document.createElement('style');
  style.id = 'tg-dark-styles';
  style.textContent = `
    body.tg-dark,
    body.tg-dark [data-is-archived="false"],
    body.tg-dark main,
    body.tg-dark header,
    body.tg-dark nav,
    body.tg-dark aside,
    body.tg-dark footer,
    body.tg-dark div,
    body.tg-dark section,
    body.tg-dark article,
    body.tg-dark li,
    body.tg-dark ul,
    body.tg-dark form {
      background-color: #0f0f0f !important;
      border-color: #222 !important;
    }
    body.tg-dark * {
      color: #e8e8e8 !important;
      box-shadow: none !important;
    }
    body.tg-dark a {
      color: #8ab4f8 !important;
    }
    body.tg-dark input,
    body.tg-dark textarea,
    body.tg-dark select {
      background-color: #1a1a1a !important;
      border-color: #333 !important;
      color: #e8e8e8 !important;
    }
    body.tg-dark img {
      opacity: 0.88;
    }
    body.tg-dark [data-material-css-shimmer],
    body.tg-dark .shimmer {
      background: #1a1a1a !important;
    }
    body.tg-dark #tg-pin-bar {
      background: #1a1a1a !important;
      border-bottom: 1px solid #2a2a2a !important;
    }
    body.tg-dark #tg-match-nav {
      background: #1a1a1a !important;
    }
    body.tg-dark .tg-pinned-badge {
      background: rgba(127,119,221,0.2) !important;
    }
  `;
  document.head.appendChild(style);
}

function injectStyleIntoRoot(root) {
  if (root.querySelector('#tg-dark-styles-shadow')) return;
  const style = document.createElement('style');
  style.id = 'tg-dark-styles-shadow';
  style.textContent = `
    * { color: #e8e8e8 !important; box-shadow: none !important; }
    div, section, article, li, ul, form, header, nav, aside, footer, main {
      background-color: #0f0f0f !important;
      border-color: #222 !important;
    }
  `;
  root.appendChild(style);
}

function patchShadowRoots(node = document.body) {
  const all = node.querySelectorAll('*');
  all.forEach(el => {
    if (el.shadowRoot) {
      injectStyleIntoRoot(el.shadowRoot);
      patchShadowRoots(el.shadowRoot);
    }
  });
}

function applyDarkMode(enabled) {
  if (enabled) {
    document.body.classList.add('tg-dark');
    patchShadowRoots();
  } else {
    document.body.classList.remove('tg-dark');
  }
}

function loadDarkMode() {
  chrome.storage.local.get('tgDarkMode', (data) => {
    injectDarkModeStyles();
    applyDarkMode(!!data.tgDarkMode);
  });
}

function toggleDarkMode() {
  chrome.storage.local.get('tgDarkMode', (data) => {
    const next = !data.tgDarkMode;
    chrome.storage.local.set({ tgDarkMode: next }, () => {
      applyDarkMode(next);
    });
  });
}

// ==================== PIN STORAGE ====================

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
    chrome.storage.local.set({ pinnedPosts: all }, () => {
      refreshPinBar(classId);
    });
  });
}

function makePinId(el) {
  const streamId = el.closest('[data-stream-item-id]')?.getAttribute('data-stream-item-id');
  if (streamId) return streamId;
  const text = el.innerText?.trim().slice(0, 80) || '';
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return 'tg_' + Math.abs(hash).toString(36);
}

// ==================== FLOATING PIN BAR ====================

function getOrCreatePinBar() {
  let bar = document.getElementById('tg-pin-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'tg-pin-bar';
    bar.innerHTML = `
      <span id="tg-pin-bar-label">📍 Pinned</span>
      <span id="tg-pin-bar-chips"></span>
    `;
    document.body.appendChild(bar);
  }
  return bar;
}

function refreshPinBar(classId) {
  if (!classId) return;
  getPinnedPosts(classId, (pins) => {
    const bar = getOrCreatePinBar();
    const chipsEl = document.getElementById('tg-pin-bar-chips');
    if (!chipsEl) return;
    chipsEl.innerHTML = '';

    if (!pins.length) {
      bar.classList.add('tg-bar-hidden');
      return;
    }

    bar.classList.remove('tg-bar-hidden');

    pins.forEach(pin => {
      const chip = document.createElement('span');
      chip.className = 'tg-bar-chip';
      chip.title = pin.snippet;

      const shortText = pin.snippet.slice(0, 40) + (pin.snippet.length > 40 ? '…' : '');

      chip.innerHTML = `
        <span class="tg-bar-chip-icon">📌</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(shortText)}</span>
        <span class="tg-bar-chip-unpin" data-pinid="${pin.id}" title="Unpin">✕</span>
      `;

      chip.addEventListener('click', (e) => {
        if (e.target.classList.contains('tg-bar-chip-unpin')) return;
        scanStreamPosts();
        const match = scannedPosts.find(({ el }) => makePinId(el) === pin.id);
        if (match) {
          scrollToMatch(match.el);
          match.el.style.transition = 'box-shadow 0.3s';
          match.el.style.boxShadow = '0 0 0 5px rgba(127,119,221,0.55)';
          setTimeout(() => { match.el.style.boxShadow = ''; }, 1600);
        }
      });

      chip.querySelector('.tg-bar-chip-unpin').addEventListener('click', (e) => {
        e.stopPropagation();
        const pinId = e.target.getAttribute('data-pinid');
        getPinnedPosts(classId, (pins) => {
          const updated = pins.filter(p => p.id !== pinId);
          savePinnedPosts(classId, updated);
          scanStreamPosts();
          const match = scannedPosts.find(({ el }) => makePinId(el) === pinId);
          if (match) {
            match.el.classList.remove('tg-card-pinned');
            removePinnedBadge(match.el);
            const btn = match.el.querySelector('.tg-pin-btn');
            if (btn) {
              btn.textContent = '📌';
              btn.title = 'Pin this post';
              btn.classList.remove('tg-pinned-active');
            }
          }
        });
      });

      chipsEl.appendChild(chip);
    });
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ==================== PIN BUTTON INJECTION ====================

function togglePin(classId, pinId, snippet, el, btn) {
  getPinnedPosts(classId, (pins) => {
    const exists = pins.find(p => p.id === pinId);
    if (exists) {
      const updated = pins.filter(p => p.id !== pinId);
      savePinnedPosts(classId, updated);
      btn.textContent = '📌';
      btn.title = 'Pin this post';
      btn.classList.remove('tg-pinned-active');
      el.classList.remove('tg-card-pinned');
      removePinnedBadge(el);
    } else {
      const newPin = { id: pinId, snippet: snippet.slice(0, 120), pinnedAt: Date.now() };
      savePinnedPosts(classId, [...pins, newPin]);
      btn.textContent = '📍';
      btn.title = 'Unpin this post';
      btn.classList.add('tg-pinned-active');
      el.classList.add('tg-card-pinned');
      addPinnedBadge(el);
    }
  });
}

function addPinnedBadge(el) {
  if (el.querySelector('.tg-pinned-badge')) return;
  const badge = document.createElement('div');
  badge.className = 'tg-pinned-badge';
  badge.innerHTML = '📍 pinned by you';
  el.insertBefore(badge, el.firstChild);
}

function removePinnedBadge(el) {
  el.querySelector('.tg-pinned-badge')?.remove();
}

function injectPinButton(el, classId) {
  if (el.querySelector('.tg-pin-btn')) return;
  el.setAttribute('data-tg-hoverable', '1');
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

  const pinId = makePinId(el);
  const snippet = el.innerText?.trim() || '';

  const btn = document.createElement('button');
  btn.className = 'tg-pin-btn';
  btn.textContent = '📌';
  btn.title = 'Pin this post';
  btn.setAttribute('aria-label', 'Pin this post');

  getPinnedPosts(classId, (pins) => {
    if (pins.find(p => p.id === pinId)) {
      btn.textContent = '📍';
      btn.title = 'Unpin this post';
      btn.classList.add('tg-pinned-active');
      el.classList.add('tg-card-pinned');
      addPinnedBadge(el);
    }
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    togglePin(classId, pinId, snippet, el, btn);
  });

  el.appendChild(btn);
}

function injectPinButtonsOnAllCards(classId) {
  scanStreamPosts();
  scannedPosts.forEach(({ el }) => injectPinButton(el, classId));
}

// ==================== EXISTING FUNCTIONS ====================

function getClassId() {
  const match = location.pathname.match(/\/(c|r)\/([^\/]+)/);
  return match ? match[2] : null;
}

function isPeoplePage() {
  return /\/r\/[^\/]+\/sort-last-name/.test(location.pathname);
}

function collectPeopleRows() {
  document.querySelectorAll('li.ycbm1d').forEach(row => {
    const nameEl = row.querySelector('.sCv5Q');
    if (!nameEl) return;
    const name = nameEl.innerText.trim();
    const label = row.querySelector('button[aria-label*="Options for"]')?.getAttribute('aria-label') || '';
    if (label.includes('teacher')) window.__tgTeachers.set(name, true);
    else if (label.includes('student')) window.__tgStudents.set(name, true);
  });
}

function saveAccumulatedPeople(classId) {
  const teachers = Array.from(window.__tgTeachers.keys());
  const students = Array.from(window.__tgStudents.keys());
  chrome.storage.local.get("classPeople", (data) => {
    const classPeople = data.classPeople || {};
    classPeople[classId] = { teachers, students, scrapedAt: Date.now() };
    chrome.storage.local.set({ classPeople });
  });
}

function startPeopleAccumulator(classId) {
  collectPeopleRows();
  saveAccumulatedPeople(classId);
  const onScroll = () => { collectPeopleRows(); saveAccumulatedPeople(classId); };
  window.addEventListener('scroll', onScroll, true);
  document.addEventListener('scroll', onScroll, true);
}

function findStreamCards() {
  const markers = document.querySelectorAll('[data-stream-item-id]');
  let container = null;
  if (markers.length > 0) container = markers[0].parentElement;
  if (!container) container = document.querySelector('main') || document.body;

  const cards = Array.from(container.children).filter(el => {
    return el.offsetHeight > 20 && el.offsetParent !== null;
  });

  if (cards.length < 2) {
    const main = document.querySelector('main') || document.body;
    return Array.from(main.querySelectorAll(':scope > *, :scope > * > *'))
      .filter(el => el.offsetHeight > 20 && el.offsetHeight < 2000 && el.offsetParent !== null);
  }
  return cards;
}

function scanStreamPosts() {
  const cards = findStreamCards();
  const newPosts = [];
  cards.forEach(el => {
    const text = el.innerText?.trim();
    if (!text) return;
    const headText = text.slice(0, 120);
    newPosts.push({ el, headText });
  });
  if (newPosts.length === 0 && scannedPosts.length > 0) return scannedPosts;
  scannedPosts = newPosts;
  console.log(`Stream cards found: ${scannedPosts.length}`);
  return scannedPosts;
}

function isNearPageBottom() {
  return (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 150);
}

function clearHighlights() {
  document.querySelectorAll('.tg-highlight').forEach(el => {
    el.classList.remove('tg-highlight');
    el.style.outline = '';
    el.style.boxShadow = '';
    el.style.backgroundColor = '';
  });
  removeMatchNav();
}

function scrollToMatch(el) {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function removeMatchNav() {
  document.getElementById('tg-match-nav')?.remove();
}

// CHANGED: takes knownTotal (real count from synced API data, via
// currentKnownTotal). When present, shows an honest "X shown / Y total"
// instead of guessing from scroll position.
function createMatchNav(matches, knownTotal) {
  const existing = document.getElementById('tg-match-nav');
  const nav = existing || document.createElement('div');
  nav.id = 'tg-match-nav';
  nav.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 999999;
    background: #1a1a1a; color: white; padding: 10px 14px;
    border-radius: 999px; display: flex; align-items: center; gap: 10px;
    font-family: sans-serif; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;

  function label() {
    if (knownTotal != null) {
      return matches.length >= knownTotal
        ? `${currentMatchIndex + 1} / ${knownTotal}`
        : `${matches.length} shown / ${knownTotal} total`;
    }
    return !isNearPageBottom()
      ? `${matches.length} found (scroll for more)`
      : `${currentMatchIndex + 1} / ${matches.length}`;
  }

  nav.innerHTML = `
    <button id="tg-prev" style="background:none;border:none;color:white;cursor:pointer;font-size:16px;">▲</button>
    <span id="tg-count">${label()}</span>
    <button id="tg-next" style="background:none;border:none;color:white;cursor:pointer;font-size:16px;">▼</button>
  `;
  if (!existing) document.body.appendChild(nav);

  nav.querySelector('#tg-prev').onclick = () => {
    currentMatchIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
    scrollToMatch(matches[currentMatchIndex]);
    nav.querySelector('#tg-count').textContent = label();
  };
  nav.querySelector('#tg-next').onclick = () => {
    currentMatchIndex = (currentMatchIndex + 1) % matches.length;
    scrollToMatch(matches[currentMatchIndex]);
    nav.querySelector('#tg-count').textContent = label();
  };
}

// CHANGED: accepts knownTotal, stores it in currentKnownTotal so watchFeed
// can reuse it as more posts lazy-load in.
function applyFilter(teacher, knownTotal) {
  currentKnownTotal = knownTotal ?? null;
  scanStreamPosts();
  clearHighlights();
  if (!teacher || teacher === 'all') return;

  const matches = [];
  scannedPosts.forEach(({ el, headText }) => {
    if (headText.includes(teacher)) {
      el.classList.add('tg-highlight');
      el.style.outline = '3px solid #d500f9';
      el.style.boxShadow = '0 0 0 4px rgba(213, 0, 249, 0.15)';
      el.style.backgroundColor = 'rgba(213, 0, 249, 0.06)';
      matches.push(el);
    }
  });

  console.log(`Highlighted ${matches.length} cards for "${teacher}"`);

  if (matches.length > 0) {
    currentMatchIndex = 0;
    scrollToMatch(matches[0]);
    createMatchNav(matches, currentKnownTotal);
  }
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
    if (teacher && teacher !== 'all') applyFilter(teacher, null); // no popup context here, so no known total yet
  });
}

// CHANGED: reuses currentKnownTotal instead of the old scroll-based guess.
function watchFeed(classId) {
  if (feedObserver) feedObserver.disconnect();
  const mainArea = document.querySelector('main') || document.body;
  feedObserver = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      injectPinButtonsOnAllCards(classId);
      refreshPinBar(classId);
      if (document.body.classList.contains('tg-dark')) {
        patchShadowRoots();
      }
      chrome.storage.local.get("activeFilters", (data) => {
        const teacher = (data.activeFilters || {})[classId];
        if (teacher && teacher !== 'all') {
          const cards = findStreamCards();
          cards.forEach(el => {
            const text = el.innerText?.trim();
            if (!text) return;
            const headText = text.slice(0, 120);
            if (headText.includes(teacher) && !el.classList.contains('tg-highlight')) {
              el.classList.add('tg-highlight');
              el.style.outline = '3px solid #d500f9';
              el.style.boxShadow = '0 0 0 4px rgba(213, 0, 249, 0.15)';
              el.style.backgroundColor = 'rgba(213, 0, 249, 0.06)';
            }
          });
          const matches = Array.from(document.querySelectorAll('.tg-highlight'));
          if (matches.length > 0) {
            createMatchNav(matches, currentKnownTotal);
          }
        }
      });
    }, 600);
  });
  feedObserver.observe(mainArea, { childList: true, subtree: true });
}

// ==================== INIT ====================

function handlePageContext() {
   cleanupPreviousState();
  const classId = getClassId();
  if (!classId) return;
  currentClassId = classId;

  if (isPeoplePage()) {
    window.__tgTeachers = new Map();
    window.__tgStudents = new Map();
    setTimeout(() => startPeopleAccumulator(classId), 800);
  }  else {
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

// ==================== MESSAGE LISTENER ====================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SET_FILTER') {
    applyFilter(msg.teacher, msg.knownTotal);
    if (currentClassId) saveActiveFilter(currentClassId, msg.teacher);
    sendResponse({ ok: true, postsFound: scannedPosts.length });
    return true;
  }
  if (msg.type === 'GET_DEBUG') {
    sendResponse({ classId: currentClassId, postsFound: scannedPosts.length });
    return true;
  }
  if (msg.type === 'GET_PINS') {
    getPinnedPosts(msg.classId || currentClassId, (pins) => {
      sendResponse({ pins });
    });
    return true;
  }
  if (msg.type === 'TOGGLE_DARK_MODE') {
    toggleDarkMode();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'GET_DARK_MODE') {
    chrome.storage.local.get('tgDarkMode', (data) => {
      sendResponse({ enabled: !!data.tgDarkMode });
    });
    return true;
  }
  if (msg.type === 'SCROLL_TO_PIN') {
    scanStreamPosts();
    const match = scannedPosts.find(({ el }) => makePinId(el) === msg.pinId);
    if (match) {
      scrollToMatch(match.el);
      match.el.style.transition = 'box-shadow 0.3s';
      match.el.style.boxShadow = '0 0 0 4px rgba(127, 119, 221, 0.5)';
      setTimeout(() => { match.el.style.boxShadow = ''; }, 1500);
    }
    sendResponse({ found: !!match });
    return true;
  }
  if (msg.type === 'UNPIN_FROM_POPUP') {
    getPinnedPosts(currentClassId, (pins) => {
      const updated = pins.filter(p => p.id !== msg.pinId);
      savePinnedPosts(currentClassId, updated);
      scanStreamPosts();
      const match = scannedPosts.find(({ el }) => makePinId(el) === msg.pinId);
      if (match) {
        match.el.classList.remove('tg-card-pinned');
        removePinnedBadge(match.el);
        const btn = match.el.querySelector('.tg-pin-btn');
        if (btn) {
          btn.textContent = '📌';
          btn.title = 'Pin this post';
          btn.classList.remove('tg-pinned-active');
        }
      }
    });
    sendResponse({ ok: true });
    return true;
  }
  return true;
});