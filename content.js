console.log("TouchGrass GCR loaded");

let currentClassId = null;
let currentPath = location.pathname;
let scannedPosts = [];
let feedObserver = null;
let debounceTimer = null;
let currentMatchIndex = -1;

window.__tgTeachers = window.__tgTeachers || new Map();
window.__tgStudents = window.__tgStudents || new Map();

function cleanupPreviousState() {
  scannedPosts = [];
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
    body.tg-dark #tg-match-nav {
      background: #1a1a1a !important;
    }
  `;
  document.head.appendChild(style);
}

// ---- Shadow DOM patch: injected <style> tags can't cross into shadow roots,
// so GCR's Material Web Components (which render inside shadow DOM) never
// pick up the dark theme unless we push the styles directly into each root. ----

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
      patchShadowRoots(el.shadowRoot); // handle nested shadow roots
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

// ==================== PIN SUPPORT ====================
// Two things live here:
//  1. An on-page hover pin button, injected onto each stream card, so you
//     can pin/unpin directly from the Classroom feed (restored).
//  2. The same GET_STREAM_POSTS / SCROLL_TO_PIN messages the popup uses for
//     its own "Posts on this page" / "Pinned" lists. Both UIs read and write
//     the exact same chrome.storage.local "pinnedPosts" schema, so pinning
//     from the page or from the popup always stay in sync.

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

// Classroom stream cards usually have a timestamp link like
// /c/<classId>/p or a/<postId>/details buried inside them — a real,
// navigable permalink to that individual post.
function extractPinLink(el) {
  const anchors = Array.from(el.querySelectorAll('a[href*="/c/"]'));
  for (const a of anchors) {
    const href = a.getAttribute('href') || '';
    if (/\/c\/[^\/]+\/(p|a)\/[^\/]+/.test(href)) {
      return href.startsWith('http') ? href : (location.origin + href);
    }
  }
  return null;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---- On-page hover pin button ----

function injectPinButtonStyles() {
  if (document.getElementById('tg-pin-btn-styles')) return;
  const style = document.createElement('style');
  style.id = 'tg-pin-btn-styles';
  style.textContent = `
    .tg-pin-host {
      position: relative !important;
      transition: outline 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
    }
    .tg-pin-host:hover {
      .tg-pin-host:hover {
      outline: 2px solid #7F77DD !important;
       box-shadow: 0 0 0 4px rgba(127, 119, 221, 0.13) !important;
}
    }
    .tg-pin-host.tg-card-pinned {
      outline: 2px solid #7F77DD !important;
      box-shadow: 0 0 0 4px rgba(127, 119, 221, 0.13) !important;
      background-color: rgba(127, 119, 221, 0.05) !important;
    }
    .tg-pin-btn {
      position: absolute !important;
      top: 20px !important;
      right: 35px !important;
      /* Was 999998 — high enough to render on top of Classroom's own
         sticky header when a card scrolls near the top. Kept modest so it
         stays above the post's own content but never escapes above GCR's
         chrome. */
      z-index: 5 !important;
      opacity: 0;
      transition: opacity 0.15s, transform 0.15s;
      background: rgba(24, 24, 24, 0.85) !important;
      border: none !important;
      border-radius: 999px !important;
      width: 30px !important;
      height: 30px !important;
      min-width: 30px !important;
      padding: 0 !important;
      font-size: 15px !important;
      line-height: 1 !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25) !important;
    }
    .tg-pin-host:hover .tg-pin-btn,
    .tg-pin-btn.tg-pinned {
      opacity: 1;
    }
    .tg-pin-btn:hover {
      transform: scale(1.08);
    }
  `;
  document.head.appendChild(style);
}

// Same storage read used by popup.js's pin list — kept in lockstep so a pin
// toggled on the page shows up instantly in the popup, and vice versa.
function getPinnedIdSet(classId, callback) {
  chrome.storage.local.get("pinnedPosts", (data) => {
    const pins = (data.pinnedPosts || {})[classId] || [];
    callback(new Set(pins.map(p => p.id)), pins);
  });
}

// Same storage write used by popup.js's setPinned — identical shape
// ({ id, snippet, url, pinnedAt }) so both UIs stay compatible.
function setPinned(classId, post, shouldBePinned, callback) {
  chrome.storage.local.get("pinnedPosts", (data) => {
    const all = data.pinnedPosts || {};
    let pins = all[classId] || [];
    if (shouldBePinned) {
      if (!pins.some(p => p.id === post.id)) {
        pins = [...pins, { id: post.id, snippet: post.snippet, url: post.url, pinnedAt: Date.now() }];
      }
    } else {
      pins = pins.filter(p => p.id !== post.id);
    }
    all[classId] = pins;
    chrome.storage.local.set({ pinnedPosts: all }, callback);
  });
}

// Adds (or refreshes) a hover pin button on every currently-scanned stream
// card. Safe to call repeatedly — it reuses an existing button per card
// instead of stacking duplicates, and only touches its own tiny corner of
// each card (position: absolute), so nothing else on the card shifts.
function injectPinButtons(classId) {
  if (!classId) return;
  injectPinButtonStyles();

  getPinnedIdSet(classId, (pinnedIds) => {
    scannedPosts.forEach(({ el }) => {
      const id = makePinId(el);
      const isPinned = pinnedIds.has(id);
      let btn = el.querySelector(':scope > .tg-pin-btn');

      if (!btn) {
        el.classList.add('tg-pin-host');
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tg-pin-btn';
        el.appendChild(btn);

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const post = {
            id: makePinId(el),
            snippet: el.innerText?.trim().replace(/\s+/g, ' ').slice(0, 150) || '',
            url: extractPinLink(el),
          };
          const nowPinned = !btn.classList.contains('tg-pinned');
          setPinned(classId, post, nowPinned, () => {
            btn.classList.toggle('tg-pinned', nowPinned);
            btn.textContent = nowPinned ? '📍' : '📌';
            btn.title = nowPinned ? 'Unpin this post' : 'Pin this post';
            el.classList.toggle('tg-card-pinned', nowPinned);
          });
        });
      }

      btn.classList.toggle('tg-pinned', isPinned);
      btn.textContent = isPinned ? '📍' : '📌';
      btn.title = isPinned ? 'Unpin this post' : 'Pin this post';
      el.classList.toggle('tg-card-pinned', isPinned);
    });
  });
}

// If a pin is added/removed from the popup while this tab is open, refresh
// the on-page buttons so the two UIs never fall out of sync.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.pinnedPosts && currentClassId) {
    injectPinButtons(currentClassId);
  }
});

// ==================== FILE COLLECTION (PDF attachments) ====================

function hashStringForFiles(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

// Classroom attachment chips are usually <a> links to Drive. This filters
// to ones that look like PDFs — heuristic based on the visible label or
// the href, since Classroom doesn't expose file type as a clean attribute.
function scanAttachmentsInPost(postEl) {
  const anchors = Array.from(postEl.querySelectorAll('a[href]'));
  const files = [];

  anchors.forEach(a => {
    const href = a.getAttribute('href') || '';
    const label = (a.innerText || a.getAttribute('aria-label') || '').trim();

    const isDriveFile = /drive\.google\.com\/(file\/d\/|open\?id=)/.test(href);
    const looksLikePdf = /\.pdf(\?|$)/i.test(href) || /\.pdf\b/i.test(label);

    if (isDriveFile && looksLikePdf) {
      files.push({ title: label || 'Untitled PDF', url: href });
    }
  });

  return files;
}

function collectFilesForClass(classId) {
  const cards = findStreamCards();
  const collected = [];

  cards.forEach(postEl => {
    const files = scanAttachmentsInPost(postEl);
    if (files.length === 0) return;

    const announcementUrl = extractPinLink(postEl); // reuses your existing helper
    const snippet = postEl.innerText?.trim().replace(/\s+/g, ' ').slice(0, 120) || '';

    files.forEach(f => {
      collected.push({
        id: 'tg_file_' + hashStringForFiles(f.url),
        title: f.title,
        url: f.url,
        announcementUrl,
        announcementSnippet: snippet,
      });
    });
  });

  return collected;
}

// Merges by id so re-scanning (e.g. on every watchFeed cycle) doesn't
// duplicate files already known from a previous scan.
function saveCollectedFiles(classId, files) {
  chrome.storage.local.get("classFiles", (data) => {
    const all = data.classFiles || {};
    const existing = all[classId] || [];
    const byId = new Map(existing.map(f => [f.id, f]));
    files.forEach(f => byId.set(f.id, f));
    all[classId] = Array.from(byId.values());
    chrome.storage.local.set({ classFiles: all });
  });
}
// ==================== EXISTING FUNCTIONS (UNCHANGED) ====================

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

function createMatchNav(matches) {
  removeMatchNav();
  const nav = document.createElement('div');
  nav.id = 'tg-match-nav';
  nav.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 999999;
    background: #1a1a1a; color: white; padding: 10px 14px;
    border-radius: 999px; display: flex; align-items: center; gap: 10px;
    font-family: sans-serif; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  nav.innerHTML = `
    <button id="tg-prev" style="background:none;border:none;color:white;cursor:pointer;font-size:16px;">▲</button>
    <span id="tg-count">1 / ${matches.length}</span>
    <button id="tg-next" style="background:none;border:none;color:white;cursor:pointer;font-size:16px;">▼</button>
  `;
  document.body.appendChild(nav);

  nav.querySelector('#tg-prev').onclick = () => {
    currentMatchIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
    scrollToMatch(matches[currentMatchIndex]);
    nav.querySelector('#tg-count').textContent = `${currentMatchIndex + 1} / ${matches.length}`;
  };
  nav.querySelector('#tg-next').onclick = () => {
    currentMatchIndex = (currentMatchIndex + 1) % matches.length;
    scrollToMatch(matches[currentMatchIndex]);
    nav.querySelector('#tg-count').textContent = `${currentMatchIndex + 1} / ${matches.length}`;
  };
}

function applyFilter(teacher) {
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
    createMatchNav(matches);
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
    if (teacher && teacher !== 'all') applyFilter(teacher);
  });
}

function watchFeed(classId) {
  if (feedObserver) feedObserver.disconnect();
  const mainArea = document.querySelector('main') || document.body;
  feedObserver = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      scanStreamPosts(); // keep the list fresh for GET_STREAM_POSTS
      saveCollectedFiles(classId, collectFilesForClass(classId));  
      injectPinButtons(classId);
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
            removeMatchNav();
            createMatchNav(matches);
          }
        }
      });
    }, 600);
  });
  feedObserver.observe(mainArea, { childList: true, subtree: true });
}

// ==================== MILESTONE 7: COMMENT SUMMARIZATION ====================
// Everything in this section is new and additive. It only activates on a
// specific coursework detail page (/c/<classId>/a/<courseworkId>/details)
// and does not touch any of the stream/dark-mode/people logic above.

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
  } else if (isCourseworkDetailPage()) {
    const courseworkId = getCourseworkIdFromUrl();
    setTimeout(() => injectCommentSummaryButton(classId, courseworkId), 800);
  } else {
    loadDarkMode();
    let attempts = 0;
    const tryInit = () => {
      attempts++;
      const cards = findStreamCards();
      if (cards.length > 0 || attempts > 10) {
        scanStreamPosts();
        saveCollectedFiles(classId, collectFilesForClass(classId));  
        loadAndApplySavedFilter(classId);
        injectPinButtons(classId);
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
    applyFilter(msg.teacher);
    if (currentClassId) saveActiveFilter(currentClassId, msg.teacher);
    sendResponse({ ok: true, postsFound: scannedPosts.length });
    return true;
  }
  if (msg.type === 'GET_DEBUG') {
    sendResponse({ classId: currentClassId, postsFound: scannedPosts.length });
    return true;
  }
  // Popup asks for everything currently visible on the page, so it can
  // offer a pin toggle for each one — no button is ever injected here.
  if (msg.type === 'GET_STREAM_POSTS') {
    scanStreamPosts();
    const posts = scannedPosts.map(({ el }) => ({
      id: makePinId(el),
      snippet: el.innerText?.trim().replace(/\s+/g, ' ').slice(0, 150) || '',
      url: extractPinLink(el),
    }));
    sendResponse({ posts });
    return true;
  }
  // Fallback for pins that never captured a real permalink (rare) — only
  // used when the popup can't just navigate straight to pin.url.
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
  if (msg.type === 'GET_CLASS_FILES') {
  chrome.storage.local.get("classFiles", (data) => {
    sendResponse({ files: (data.classFiles || {})[msg.classId || currentClassId] || [] });
  });
  return true;
  }
  return true;
});