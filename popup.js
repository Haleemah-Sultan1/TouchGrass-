document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("list");
  const teacherFilter = document.getElementById("teacherFilter");
  const applyBtn = document.getElementById("applyFilters");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || "";
    const match = url.match(/\/(c|r)\/([^\/]+)/);
    const classId = match ? match[2] : null;

    chrome.storage.local.get(["classPeople", "assignments"], (data) => {
      const classPeople = data.classPeople || {};
      const allAssignments = data.assignments || [];
      
      let teachers = [];
      if (classId && classPeople[classId]) {
        teachers = classPeople[classId].teachers || [];
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

      // Filter button
      if (applyBtn) {
        applyBtn.addEventListener("click", () => {
          const teacher = teacherFilter.value;
          const filtered = teacher === "all" 
            ? scoped 
            : scoped.filter(a => a.author && a.author.includes(teacher));
          
          list.innerHTML = filtered.length === 0 
            ? '<div style="color:#888;text-align:center;padding:20px;">No assignments for this teacher.</div>'
            : filtered.map(a => `<div style="padding:8px 0;border-bottom:1px solid #222;"><strong>${a.title}</strong><div style="color:#888;font-size:11px;margin-top:4px;">By: ${a.author}</div></div>`).join("");
        });
      }
    });
  });
});