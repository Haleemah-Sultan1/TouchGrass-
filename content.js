// console.log("TouchGrass GCR content script loaded");

// function scrapeAssignments() {
//   // GCR assignment titles usually sit in elements with role="link" or specific classes
//   // this selector WILL need tweaking once you inspect the actual page
//   const items = document.querySelectorAll('[data-stream-item-id]');
//   const assignments = [];

//   items.forEach(item => {
//     const title = item.querySelector('span')?.innerText || "Untitled";
//     assignments.push({ title, scrapedAt: Date.now() });
//   });

//   chrome.storage.local.set({ assignments });
//   console.log("Scraped:", assignments);
// }

// scrapeAssignments();

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
  let currentSection = null;

  // NEEDS VERIFYING: walk all headers/rows, bucket by section header text
  const allEls = document.querySelectorAll("h2, h3, div, span");
  allEls.forEach(el => {
    const text = el.innerText?.trim();
    if (!text) return;

    if (text === "Teachers") { currentSection = "teachers"; return; }
    if (text === "Classmates" || text === "Students") { currentSection = "students"; return; }

    // NEEDS VERIFYING: real selector for a "name row" in the people list
    if (currentSection && el.matches('span[dir="auto"]') && text.split(" ").length <= 4) {
      if (currentSection === "teachers" && !teachers.includes(text)) teachers.push(text);
      if (currentSection === "students" && !students.includes(text)) students.push(text);
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
    // NEEDS VERIFYING: real selector for "posted by" text on a stream item
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

// Run the right scraper for whichever page we're on
if (isPeoplePage()) {
  scrapePeople();
} else {
  scrapeAssignments();
}
