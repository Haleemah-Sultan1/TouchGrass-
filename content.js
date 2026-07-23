console.log("TouchGrass GCR content script loaded");

function getClassId() {
  const match = window.location.pathname.match(/\/(c|r)\/([^\/]+)/);
  return match ? match[2] : null;
}

function isPeoplePage() {
  return /\/r\/[^\/]+\/sort-last-name/.test(window.location.pathname);
}

function scrapePeople() {
  const teachers = [];
  const students = [];

  document.querySelectorAll('li.ycbm1d').forEach(row => {
    const nameEl = row.querySelector('.sCv5Q');
    if (!nameEl) return;
    const name = nameEl.innerText.trim();

    const optionsBtn = row.querySelector('button[aria-label*="Options for"]');
    const label = optionsBtn?.getAttribute('aria-label') || '';

    if (label.includes('teacher')) {
      if (!teachers.includes(name)) teachers.push(name);
    } else if (label.includes('student')) {
      if (!students.includes(name)) students.push(name);
    }
  });

  const classId = getClassId();
  if (!classId) return;

  chrome.storage.local.get("classPeople", (data) => {
    const classPeople = data.classPeople || {};
    classPeople[classId] = { teachers, students, scrapedAt: Date.now() };
    chrome.storage.local.set({ classPeople });
    console.log("Scraped people for", classId, { teachers, students });
  });
}

function scrapeAssignments() {
  const classId = getClassId();
  if (!classId) return;

  const items = document.querySelectorAll('[data-stream-item-id]');
  const assignments = [];

  items.forEach(item => {
    const title = item.querySelector('span')?.innerText || "Untitled";
    const author = item.querySelector('[class*="author"], [class*="byline"]')?.innerText || "Unknown";
    assignments.push({ title, author, classId, scrapedAt: Date.now() });
  });

  chrome.storage.local.get("assignments", (data) => {
    const existing = data.assignments || [];
    const merged = [...existing.filter(a => a.classId !== classId), ...assignments];
    chrome.storage.local.set({ assignments: merged });
    console.log("Scraped assignments for", classId, assignments);
  });
}

if (isPeoplePage()) {
  scrapePeople();
} else {
  scrapeAssignments();
}