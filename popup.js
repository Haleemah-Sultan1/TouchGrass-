document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("list");
  const teacherFilter = document.getElementById("teacherFilter");
  const applyBtn = document.getElementById("applyFilters");

  function currentClassId(tabUrl) {
    const match = tabUrl.match(/\/c\/([^\/]+)/);
    return match ? match[1] : null;
  }

  function render(assignments, people) {
    // 1. Populate Teacher Dropdown dynamically if we have people data
    if (people && people.teachers && people.teachers.length > 0) {
      const currentSelection = teacherFilter.value; // Save current selection
      
      teacherFilter.innerHTML = `<option value="all">All teachers</option>` +
        people.teachers.map(t => `<option value="${t}">${t}</option>`).join("");
      
      // Restore selection if it still exists in the new list
      if (people.teachers.includes(currentSelection)) {
        teacherFilter.value = currentSelection;
      }
    }

    // 2. Render Assignments List
    if (!assignments || assignments.length === 0) {
      list.innerHTML = '<div class="empty-msg">No assignments found.<br>Open Google Classroom to scrape.</div>';
      return;
    }

    list.innerHTML = assignments
      .map(a => `<div class="item"><strong>${a.title}</strong><small>By: ${a.author || "Unknown"}</small></div>`)
      .join("");
  }

  // Initial Load
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const classId = currentClassId(tabs[0]?.url || "");

    chrome.storage.local.get(["assignments", "classPeople"], (data) => {
      const allAssignments = data.assignments || [];
      const classPeople = data.classPeople || {};
      
      const people = classId ? classPeople[classId] : null;
      const scopedAssignments = classId 
        ? allAssignments.filter(a => a.classId === classId) 
        : allAssignments;

      render(scopedAssignments, people);

      // Attach filter listener ONCE
      applyBtn.addEventListener("click", () => {
        const teacher = teacherFilter.value;
        const filtered = teacher === "all" 
          ? scopedAssignments 
          : scopedAssignments.filter(a => a.author && a.author.includes(teacher)); // Safer matching
        
        render(filtered, people);
      });
    });
  });
});