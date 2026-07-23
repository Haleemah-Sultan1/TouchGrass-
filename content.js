console.log("TouchGrass GCR content script loaded");

function getClassId() {
  const match = window.location.pathname.match(/\/(c|r)\/([^\/]+)/);
  return match ? match[2] : null;
}

function isPeoplePage() {
  return /\/r\/[^\/]+\/sort-last-name/.test(window.location.pathname);
}

function waitForPeopleRows(callback, attempts = 0) {
  const rows = document.querySelectorAll('li.ycbm1d');
  if (rows.length > 0 || attempts > 20) {
    callback();
  } else {
    setTimeout(() => waitForPeopleRows(callback, attempts + 1), 300);
  }
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

    if (label.toLowerCase().includes('teacher')) {
      if (!teachers.includes(name)) teachers.push(name);
    } else if (label.toLowerCase().includes('student')) {
      if (!students.includes(name)) students.push(name);
    }
  });

  const classId = getClassId();
  if (!classId) {
    console.log("No classId found, skipping people scrape.");
    return;
  }

  chrome.storage.local.get("classPeople", (data) => {
    const classPeople = data.classPeople || {};
    classPeople[classId] = { teachers, students, scrapedAt: Date.now() };
    
    chrome.storage.local.set({ classPeople }, () => {
      console.log("✅ Scraped and saved people for", classId, { teachers, students });
    });
  });
}

function scrapeAssignments() {
  const classId = getClassId();
  if (!classId) return;

  const items = document.querySelectorAll('[data-stream-item-id]');
  const assignments = [];

  items.forEach(item => {
    const title = item.querySelector('span')?.innerText || "Untitled";
    // Try to find author/teacher name in the assignment card
    const author = item.querySelector('[class*="author"], [class*="byline"], div[aria-label*="posted"]')?.innerText || "Unknown";
    assignments.push({ title, author, classId, scrapedAt: Date.now() });
  });

  if (assignments.length === 0) return;

  chrome.storage.local.get("assignments", (data) => {
    const existing = data.assignments || [];
    // Remove old assignments for this classId, then add new ones
    const filteredExisting = existing.filter(a => a.classId !== classId);
    const merged = [...filteredExisting, ...assignments];
    
    chrome.storage.local.set({ assignments: merged }, () => {
      console.log("✅ Scraped and saved assignments for", classId, assignments);
    });
  });
}

// Execute based on page type
if (isPeoplePage()) {
  console.log("Detected People page, waiting for rows...");
  waitForPeopleRows(scrapePeople);
} else {
  console.log("Detected Stream/Class page, scraping assignments...");
  scrapeAssignments();
}