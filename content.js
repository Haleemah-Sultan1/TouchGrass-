console.log("✅ TouchGrass GCR loaded");

function getClassId() {
  const match = window.location.pathname.match(/\/(c|r)\/([^\/]+)/);
  return match ? match[2] : null;
}

setTimeout(() => {
  const classId = getClassId();
  if (!classId) return;

  // 1. ONLY look inside the main content area (ignores sidebar and top nav)
  const mainArea = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
  const fullText = mainArea.innerText;
  const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let teachers = [];
  let inTeachersSection = false;

  for (let line of lines) {
    // Start capturing ONLY after seeing "Teachers"
    if (line === 'Teachers') {
      inTeachersSection = true;
      continue;
    }

    // STOP capturing immediately when we hit "Classmates"
    if (inTeachersSection && (line === 'Classmates' || line.startsWith('Classmates '))) {
      break;
    }

    if (inTeachersSection) {
      const words = line.split(/\s+/);

      // STRICT FILTER: Must be 2 to 4 words
      if (words.length >= 2 && words.length <= 4) {
        let isValidName = true;

        for (let word of words) {
          // Reject if it has numbers, @, underscores, or hyphens
          if (/\d/.test(word) || word.includes('@') || word.includes('_') || word.includes('-')) {
            isValidName = false;
            break;
          }
          // Reject if it doesn't start with a Capital letter
          if (word[0] !== word[0].toUpperCase()) {
            isValidName = false;
            break;
          }
        }

        // Reject UI text
        const uiText = ['View all', 'Invite', 'Email', 'Sort by', 'Options', 'Help'];
        if (uiText.some(ui => line.includes(ui))) {
          isValidName = false;
        }

        if (isValidName && !teachers.includes(line)) {
          teachers.push(line);
        }
      }
    }
  }

  console.log(`📊 FINAL TEACHERS FOUND: ${teachers.length}`, teachers);

  if (teachers.length > 0) {
    chrome.storage.local.get("classPeople", (data) => {
      const classPeople = data.classPeople || {};
      classPeople[classId] = { teachers, students: [], scrapedAt: Date.now() };

      chrome.storage.local.set({ classPeople }, () => {
        console.log(" Saved successfully!");
      });
    });
  }
}, 2000);