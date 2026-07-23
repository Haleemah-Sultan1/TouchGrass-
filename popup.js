document.addEventListener("DOMContentLoaded", () => {
  const debugBox = document.getElementById("debugBox");
  const list = document.getElementById("list");
  const teacherFilter = document.getElementById("teacherFilter");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || "";
    const match = url.match(/\/(c|r)\/([^\/]+)/);
    const classId = match ? match[2] : null;

    chrome.storage.local.get(["classPeople", "assignments"], (data) => {
      const classPeople = data.classPeople || {};
      const allAssignments = data.assignments || [];
      
      let teachers = [];
      
      if (classId && classPeople[classId]) {
        const rawData = classPeople[classId].teachers || [];
        
        // FILTER: Only keep actual teacher names
        // Remove emails, students, and garbage
        teachers = rawData.filter(name => {
          // Must NOT contain these words
          if (name.includes('@') ||           // No emails
              name.includes('Classmates') ||  // No section headers
              name.includes('students') ||    // No student counts
              name.includes('Sort by') ||     // No sort options
              name.includes('Email') ||       // No email labels
              name.includes('Invite') ||      // No buttons
              name.includes('24K') ||         // No student IDs
              name.includes('25F-') ||        // No student IDs
              name.includes('25I-') ||        // No student IDs
              name.length < 5 ||              // Too short
              name.length > 50) {             // Too long
            return false;
          }
          return true;
        });
        
        // Remove duplicates
        teachers = [...new Set(teachers)];
      }
      
      // Show in debug box
      if (debugBox) {
        debugBox.innerText = `✅ Found ${teachers.length} teachers:\n${teachers.join(', ')}`;
      }
      
      // Populate dropdown
      teacherFilter.innerHTML = '<option value="all">All teachers</option>';
      teachers.forEach(teacher => {
        const option = document.createElement("option");
        option.value = teacher;
        option.textContent = teacher;
        teacherFilter.appendChild(option);
      });
      
      // Show assignments
      const scoped = classId 
        ? allAssignments.filter(a => a.classId === classId)
        : allAssignments;
      
      if (scoped.length === 0) {
        list.innerHTML = '<div style="color:#888;text-align:center;padding:20px;">No assignments found.<br>Open the Stream page to scrape them.</div>';
      } else {
        list.innerHTML = scoped
          .map(a => `<div style="padding:8px 0;border-bottom:1px solid #222;"><strong>${a.title}</strong><div style="color:#888;font-size:11px;margin-top:4px;">By: ${a.author || "Unknown"}</div></div>`)
          .join("");
      }
    });
  });
});