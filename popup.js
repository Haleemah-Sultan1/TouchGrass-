document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Popup loaded");
  
  const list = document.getElementById("list");
  const teacherFilter = document.getElementById("teacherFilter");
  const applyBtn = document.getElementById("applyFilters");

  function currentClassId(tabUrl) {
    if (!tabUrl) return null;
    const match = tabUrl.match(/\/c\/([^\/]+)/);
    return match ? match[1] : null;
  }

  function render(assignments, people, classId) {
    console.log("📊 Rendering with:", { 
      assignmentsCount: assignments?.length || 0, 
      teachersCount: people?.teachers?.length || 0,
      classId 
    });
    
    // Populate Teacher Dropdown
    teacherFilter.innerHTML = '<option value="all">All teachers</option>';
    
    if (people && people.teachers && people.teachers.length > 0) {
      console.log("✅ Adding teachers to dropdown:", people.teachers);
      people.teachers.forEach(teacher => {
        const option = document.createElement("option");
        option.value = teacher;
        option.textContent = teacher;
        teacherFilter.appendChild(option);
      });
    } else {
      console.log("⚠️ No teachers found in people data:", people);
    }

    // Render Assignments
    if (!assignments || assignments.length === 0) {
      list.innerHTML = '<div style="color:#888;text-align:center;padding:20px;">No assignments found.<br>Open Google Classroom and visit the Stream page.</div>';
      return;
    }

    list.innerHTML = assignments
      .map(a => `<div style="padding:8px 0;border-bottom:1px solid #222;"><strong>${a.title}</strong><div style="color:#888;font-size:11px;margin-top:4px;">By: ${a.author || "Unknown"}</div></div>`)
      .join("");
  }

  // Load data
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const classId = currentClassId(tab?.url);
    
    console.log("📍 Current tab:", tab?.url);
    console.log("🔑 Extracted classId:", classId);
    
    chrome.storage.local.get(["assignments", "classPeople"], (data) => {
      console.log(" Storage data:", data);
      
      const allAssignments = data.assignments || [];
      const classPeople = data.classPeople || {};
      
      console.log("📦 ClassPeople object:", classPeople);
      
      const people = classId ? classPeople[classId] : null;
      console.log("👥 People for this class:", people);
      
      const scoped = classId 
        ? allAssignments.filter(a => a.classId === classId)
        : allAssignments;
      
      console.log("📋 Scoped assignments:", scoped.length);
      
      render(scoped, people, classId);

      // Filter button
      if (applyBtn) {
        applyBtn.addEventListener("click", () => {
          const teacher = teacherFilter.value;
          console.log("🔍 Filtering by teacher:", teacher);
          
          const filtered = teacher === "all" 
            ? scoped 
            : scoped.filter(a => {
                const match = a.author && a.author.toLowerCase().includes(teacher.toLowerCase());
                console.log(`Checking "${a.author}" against "${teacher}": ${match}`);
                return match;
              });
          
          console.log(" Filtered results:", filtered.length);
          render(filtered, people, classId);
        });
      }
    });
  });
});