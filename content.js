console.log("✅ TouchGrass GCR content script loaded");

function getClassId() {
  const match = window.location.pathname.match(/\/(c|r)\/([^\/]+)/);
  return match ? match[2] : null;
}

function isPeoplePage() {
  return window.location.pathname.includes('/people') || window.location.href.includes('sort-last-name');
}

function waitForElements(selector, callback, attempts = 0) {
  const elements = document.querySelectorAll(selector);
  if (elements.length > 0 || attempts > 30) {
    callback(elements);
  } else {
    setTimeout(() => waitForElements(selector, callback, attempts + 1), 500);
  }
}

function scrapePeople() {
  console.log("🔍 Starting people scrape...");
  
  const teachers = [];
  const students = [];
  
  // Google Classroom people are in <li> elements
  // We'll find ALL list items and filter by text content
  const allItems = document.querySelectorAll('li[role="listitem"], li[class*="person"]');
  
  console.log(`Found ${allItems.length} potential person elements`);
  
  allItems.forEach((item, index) => {
    // Find the name - usually in a div or span with text
    const nameElement = item.querySelector('div[class*="name"], span[class*="name"], h2, h3, div[jsname]');
    const name = nameElement ? nameElement.innerText.trim() : item.innerText.trim();
    
    if (!name || name.length < 3) return;
    
    // Check if this is a teacher or student by looking for badges/labels
    const itemText = item.innerText.toLowerCase();
    const ariaLabel = item.getAttribute('aria-label') || '';
    
    if (ariaLabel.toLowerCase().includes('teacher') || itemText.includes('teacher')) {
      if (!teachers.includes(name)) {
        teachers.push(name);
        console.log(`✅ Found teacher: ${name}`);
      }
    } else if (ariaLabel.toLowerCase().includes('student') || itemText.includes('student')) {
      if (!students.includes(name)) {
        students.push(name);
        console.log(`✅ Found student: ${name}`);
      }
    }
  });
  
  // Fallback: If we found no one with explicit labels, try to detect by position
  // (First few people in the list are usually teachers)
  if (teachers.length === 0 && allItems.length > 0) {
    console.log("⚠️ No labeled teachers found, trying fallback method...");
    const allNames = [];
    
    allItems.forEach(item => {
      const nameElement = item.querySelector('div, span');
      const name = nameElement ? nameElement.innerText.trim() : item.innerText.trim();
      if (name && name.length > 3 && name.length < 50 && !name.includes('Options')) {
        allNames.push(name);
      }
    });
    
    // Assume first 1-3 people are teachers
    const potentialTeachers = allNames.slice(0, Math.min(3, allNames.length));
    potentialTeachers.forEach(name => {
      if (!teachers.includes(name)) {
        teachers.push(name);
        console.log(`🎯 Fallback teacher: ${name}`);
      }
    });
  }
  
  const classId = getClassId();
  if (!classId) {
    console.log("❌ No class ID found");
    return;
  }
  
  console.log(`📊 Final count - Teachers: ${teachers.length}, Students: ${students.length}`);
  
  // Save to storage
  chrome.storage.local.get("classPeople", (data) => {
    const classPeople = data.classPeople || {};
    classPeople[classId] = { 
      teachers, 
      students, 
      scrapedAt: Date.now(),
      scrapedFrom: window.location.href
    };
    
    chrome.storage.local.set({ classPeople }, () => {
      console.log("💾 Saved to storage:", classPeople[classId]);
      console.log("📦 Full storage key 'classPeople':", classPeople);
    });
  });
}

function scrapeAssignments() {
  const classId = getClassId();
  if (!classId) return;

  console.log("📝 Scraping assignments...");
  
  const items = document.querySelectorAll('[data-stream-item-id], div[class*="assignment"], div[role="article"]');
  const assignments = [];

  items.forEach(item => {
    const titleEl = item.querySelector('span[class*="title"], div[class*="title"], h2, h3');
    const title = titleEl ? titleEl.innerText.trim() : "Untitled";
    
    const authorEl = item.querySelector('[class*="author"], [class*="byline"], div[jsname*="author"]');
    const author = authorEl ? authorEl.innerText.trim() : "Unknown";
    
    if (title && title !== "Untitled") {
      assignments.push({ title, author, classId, scrapedAt: Date.now() });
      console.log(`✅ Found assignment: "${title}" by ${author}`);
    }
  });

  if (assignments.length === 0) {
    console.log("⚠️ No assignments found on this page");
    return;
  }

  chrome.storage.local.get("assignments", (data) => {
    const existing = data.assignments || [];
    const filtered = existing.filter(a => a.classId !== classId);
    const merged = [...filtered, ...assignments];
    
    chrome.storage.local.set({ assignments: merged }, () => {
      console.log(`💾 Saved ${assignments.length} assignments for class ${classId}`);
    });
  });
}

// Main execution
if (isPeoplePage()) {
  console.log("👥 Detected PEOPLE page");
  waitForElements('li[role="listitem"], li[class*="person"]', () => {
    scrapePeople();
  });
} else {
  console.log("📚 Detected CLASS/STREAM page");
  scrapeAssignments();
}