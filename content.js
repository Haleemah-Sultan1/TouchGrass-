console.log("✅ TouchGrass GCR loaded");

function getClassId() {
  const match = window.location.pathname.match(/\/(c|r)\/([^\/]+)/);
  return match ? match[2] : null;
}

// Wait for page to fully load
setTimeout(() => {
  const classId = getClassId();
  if (!classId) return;
  
  console.log("🔍 Scraping teachers for:", classId);
  
  const teachers = [];
  
  // STEP 1: Find the "Teachers" heading
  const allHeadings = Array.from(document.querySelectorAll('h2, h3, div'));
  let teachersHeading = null;
  
  for (let heading of allHeadings) {
    if (heading.innerText?.trim() === 'Teachers') {
      teachersHeading = heading;
      break;
    }
  }
  
  if (!teachersHeading) {
    console.log("❌ No Teachers heading found");
    return;
  }
  
  console.log("✅ Found Teachers heading");
  
  // STEP 2: Find the container that holds the teachers list
  let container = teachersHeading.parentElement;
  let depth = 0;
  while (container && depth < 6) {
    // Look for the next heading (should be "Classmates")
    const nextSibling = container.nextElementSibling;
    if (nextSibling && nextSibling.innerText?.trim() === 'Classmates') {
      break;
    }
    container = container.parentElement;
    depth++;
  }
  
  // STEP 3: Extract ONLY teacher names from this container
  // Look for elements with profile pictures or names
  const candidates = container.querySelectorAll('div, span');
  
  candidates.forEach(el => {
    const text = el.innerText?.trim();
    if (!text) return;
    
    // STRICT FILTERS - only real names pass
    const isLikelyName = 
      text.split(' ').length >= 2 &&        // At least 2 words
      text.split(' ').length <= 4 &&        // Max 4 words
      text.length > 8 &&                     // Not too short
      text.length < 40 &&                    // Not too long
      !text.includes('@') &&                 // No emails
      !text.includes('Email') &&             // No email labels
      !text.includes('Classmates') &&        // No headings
      !text.includes('students') &&          // No counts
      !text.includes('Sort by') &&           // No UI text
      !text.includes('View all') &&          // No links
      !text.includes('Invite') &&            // No buttons
      !text.match(/\d/) &&                   // No numbers (student IDs)
      !text.includes('_') &&                 // No underscores
      /^[A-Z][a-z]+ [A-Z]/ .test(text);      // Starts with Capital letter
    
    if (isLikelyName && !teachers.includes(text)) {
      teachers.push(text);
      console.log("✅ Teacher:", text);
    }
  });
  
  console.log(`📊 FINAL: Found ${teachers.length} teachers`);
  
  // Save to storage
  if (teachers.length > 0) {
    chrome.storage.local.get("classPeople", (data) => {
      const classPeople = data.classPeople || {};
      classPeople[classId] = { 
        teachers, 
        students: [], 
        scrapedAt: Date.now() 
      };
      
      chrome.storage.local.set({ classPeople }, () => {
        console.log("💾 Saved:", teachers);
      });
    });
  }
  
}, 2000);