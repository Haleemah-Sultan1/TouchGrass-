console.log("✅ TouchGrass GCR content script loaded");

function getClassId() {
  const match = window.location.pathname.match(/\/(c|r)\/([^\/]+)/);
  return match ? match[2] : null;
}

function isPeoplePage() {
  try {
    const h2 = document.querySelector('h2');
    const hasTeachersHeading = h2 && h2.innerText && h2.innerText.includes('Teachers');
    
    return window.location.href.includes('/people') || 
           window.location.href.includes('sort-last-name') ||
           hasTeachersHeading;
  } catch (e) {
    console.error("Error checking page type:", e);
    return false;
  }
}

function scrapePeople() {
  console.log("🔍 Starting people scrape on:", window.location.href);
  
  try {
    const teachers = [];
    const students = [];
    
    // METHOD 1: Find the "Teachers" section and extract names
    const allHeadings = document.querySelectorAll('h2, h3, div');
    
    allHeadings.forEach(heading => {
      if (heading.innerText && heading.innerText.trim() === 'Teachers') {
        console.log("✅ Found Teachers section heading");
        
        // Get the parent container (go up to 5 levels)
        let container = heading.parentElement;
        let depth = 0;
        while (container && depth < 5) {
          if (container.tagName === 'MAIN' || container.tagName === 'BODY' || (container.id && container.id.includes('people'))) {
            break;
          }
          container = container.parentElement;
          depth++;
        }
        
        if (container) {
          // Find all name-like elements in this section
          const nameElements = container.querySelectorAll('div, span');
          
          nameElements.forEach(el => {
            if (!el.innerText) return;
            const name = el.innerText.trim();
            
            // Filter for valid names (2+ words, reasonable length, no UI text)
            if (name && 
                name.split(' ').length >= 2 && 
                name.length > 5 && 
                name.length < 50 &&
                !name.includes('Options') &&
                !name.includes('Class code') &&
                !name.includes('Remove')) {
              if (!teachers.includes(name)) {
                teachers.push(name);
                console.log("✅ Found teacher:", name);
              }
            }
          });
        }
      }
    });
    
    // METHOD 2: Fallback - scrape all visible list items
    if (teachers.length === 0) {
      console.log("⚠️ Method 1 found 0 teachers, trying Method 2...");
      
      const allItems = document.querySelectorAll('li, div[role="listitem"]');
      
      allItems.forEach(item => {
        if (!item.innerText) return;
        const text = item.innerText.trim();
        const words = text.split(' ');
        
        if (words.length >= 2 && 
            words.length <= 5 && 
            text.length > 5 && 
            text.length < 50 &&
            !text.toLowerCase().includes('student') &&
            !text.includes('Options') &&
            !text.includes('Remove') &&
            !text.includes('Class code')) {
          
          // Check if we're near the "Teachers" heading
          let isTeacher = false;
          let prev = item.previousElementSibling;
          let checkDepth = 0;
          while (prev && checkDepth < 10) {
            if (prev.innerText && prev.innerText.trim() === 'Teachers') {
              isTeacher = true;
              break;
            }
            if (prev.innerText && (prev.innerText.trim() === 'Classmates' || prev.innerText.trim() === 'Students')) {
              break;
            }
            prev = prev.previousElementSibling;
            checkDepth++;
          }
          
          if (isTeacher && !teachers.includes(text)) {
            teachers.push(text);
            console.log("✅ Found teacher (method 2):", text);
          }
        }
      });
    }
    
    const classId = getClassId();
    if (!classId) {
      console.log("❌ No class ID found in URL");
      return;
    }
    
    console.log(`📊 FINAL RESULT - Teachers found: ${teachers.length}`);
    console.log("Teacher list:", teachers);
    
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
        console.log("💾 Successfully saved to storage!");
      });
    });
    
  } catch (error) {
    console.error("❌ CRITICAL ERROR in scrapePeople:", error);
  }
}

function scrapeAssignments() {
  try {
    const classId = getClassId();
    if (!classId) return;

    console.log("📝 Scraping assignments...");
    
    const items = document.querySelectorAll('[data-stream-item-id], div[role="article"]');
    const assignments = [];

    items.forEach(item => {
      const titleEl = item.querySelector('span, div, h2, h3');
      const title = titleEl ? titleEl.innerText.trim() : "";
      
      const authorEl = item.querySelector('div, span'); 
      const author = authorEl ? authorEl.innerText.trim() : "Unknown";
      
      if (title && title.length > 3 && title.length < 100) {
        assignments.push({ title, author, classId, scrapedAt: Date.now() });
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
        console.log(`💾 Saved ${assignments.length} assignments`);
      });
    });
  } catch (error) {
    console.error("❌ CRITICAL ERROR in scrapeAssignments:", error);
  }
}

// Auto-run based on page
if (isPeoplePage()) {
  console.log("👥 Detected PEOPLE page");
  setTimeout(scrapePeople, 2000); // Wait 2 seconds for page to render
} else {
  console.log("📚 Detected CLASS/STREAM page");
  scrapeAssignments();
}