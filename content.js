console.log("✅ TouchGrass GCR loaded");

function getClassId() {
  const match = window.location.pathname.match(/\/(c|r)\/([^\/]+)/);
  return match ? match[2] : null;
}

// Wait for page to load, then scrape
setTimeout(() => {
  const classId = getClassId();
  if (!classId) {
    console.log("❌ No class ID");
    return;
  }
  
  console.log("🔍 Scraping class:", classId);
  console.log("Current URL:", window.location.href);
  
  const teachers = [];
  
  // Find the Teachers section
  const allDivs = document.querySelectorAll('div');
  let inTeachersSection = false;
  
  allDivs.forEach(div => {
    const text = div.innerText?.trim();
    
    // Check if this is the Teachers heading
    if (text === 'Teachers') {
      inTeachersSection = true;
      console.log("✅ Found Teachers heading");
    }
    
    // If we're in teachers section, look for names
    if (inTeachersSection && text) {
      // Stop when we hit Classmates
      if (text === 'Classmates') {
        inTeachersSection = false;
      }
      
      // Check if this looks like a teacher name
      // Your teachers: "Syed Muhammad Saad Sa...", "Abdullah Aamir", "Haider Ramzan"
      if (text.includes('Syed') || text.includes('Abdullah') || text.includes('Haider') ||
          (text.split(' ').length >= 2 && text.length > 5 && text.length < 50 && 
           !text.includes('Classmates') && !text.includes('students'))) {
        
        if (!teachers.includes(text) && text !== 'Teachers' && text !== 'View all') {
          teachers.push(text);
          console.log("✅ Found:", text);
        }
      }
    }
  });
  
  console.log(`📊 Found ${teachers.length} teachers:`, teachers);
  
  // Save to storage
  if (teachers.length > 0) {
    chrome.storage.local.get("classPeople", (data) => {
      const classPeople = data.classPeople || {};
      classPeople[classId] = { teachers, students: [], scrapedAt: Date.now() };
      
      chrome.storage.local.set({ classPeople }, () => {
        console.log("💾 Saved!", classPeople[classId]);
      });
    });
  }
  
}, 3000); // Wait 3 seconds for page to load