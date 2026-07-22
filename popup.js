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
