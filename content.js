chrome.runtime.onInstalled.addListener(() => {
  console.log("TouchGrass GCR installed");
});

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
function findPostContainers() {
  const candidateSelectors = [
    'main [role="listitem"]',
    'main ol > li',
    'main article',
  ];

  let best = [];
  for (const sel of candidateSelectors) {
    const els = Array.from(document.querySelectorAll(sel));
    const plausible = els.filter(el =>
      el.innerText &&
      el.innerText.trim().split('\n').length >= 2 &&
      el.offsetHeight > 40
    );
    if (plausible.length > best.length) best = plausible;
  }
  return best;
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

// ---------- Watch feed for lazy-loaded posts ----------
function watchFeed(classId) {
  if (feedObserver) feedObserver.disconnect();
  const mainArea = document.querySelector('main') || document.body;
  feedObserver = new MutationObserver(() => {
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
  return true;
});
