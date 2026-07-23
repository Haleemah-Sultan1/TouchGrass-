chrome.storage.local.get("assignments", (data) => {
  const list = document.getElementById("list");
  const assignments = data.assignments || [];

  if (assignments.length === 0) {
    list.innerText = "No assignments found. Open Google Classroom first.";
    return;
  }

  list.innerHTML = assignments
    .map(a => `<div class="item">${a.title}</div>`)
    .join("");
});

function currentClassId(tabUrl) {
  const match = tabUrl.match(/\/c\/([^\/]+)/);
  return match ? match[1] : null;
}

function render(assignments, people) {
  const list = document.getElementById("list");
  const teacherFilter = document.getElementById("teacherFilter");

  if (people?.teachers?.length) {
    teacherFilter.innerHTML =
      `<option value="all">All teachers</option>` +
      people.teachers.map(t => `<option value="${t}">${t}</option>`).join("");
  }

  if (!assignments.length) {
    list.innerText = "No assignments found. Open Google Classroom first.";
    return;
  }

  list.innerHTML = assignments
    .map(a => `<div class="item">${a.title} <small>${a.author || ""}</small></div>`)
    .join("");
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const classId = currentClassId(tabs[0]?.url || "");

  chrome.storage.local.get(["assignments", "classPeople"], (data) => {
    const allAssignments = data.assignments || [];
    const classPeople = data.classPeople || {};
    const people = classId ? classPeople[classId] : null;
    const scoped = classId ? allAssignments.filter(a => a.classId === classId) : allAssignments;

    render(scoped, people);

    document.getElementById("applyFilters")?.addEventListener("click", () => {
      const teacher = document.getElementById("teacherFilter").value;
      const filtered = teacher === "all" ? scoped : scoped.filter(a => a.author === teacher);
      render(filtered, people);
    });
  });
});
