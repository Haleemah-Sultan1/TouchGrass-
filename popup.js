document.addEventListener("DOMContentLoaded", () => {
  const teacherFilter = document.getElementById("teacherFilter");
  const applyBtn = document.getElementById("applyFilters");
  const debugBox = document.getElementById("debugBox");
  const testAuthBtn = document.getElementById("testAuth");
  const authResult = document.getElementById("authResult");

  testAuthBtn.addEventListener("click", () => {
    authResult.textContent = "Requesting token + fetching courses...";
    chrome.runtime.sendMessage({ type: "TEST_AUTH" }, (resp) => {
      if (chrome.runtime.lastError) {
        authResult.textContent = `Error: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (resp.ok) {
        authResult.textContent = `✅ Success! Courses: ${resp.courseNames.join(", ") || "(none found)"}`;
      } else {
        authResult.textContent = `❌ Failed: ${resp.error}`;
      }
    });
  });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const url = tab?.url || "";
    const match = url.match(/\/(c|r)\/([^\/]+)/);
    const classId = match ? match[2] : null;

    chrome.storage.local.get(["classPeople", "activeFilters"], (data) => {
      const classPeople = data.classPeople || {};
      const activeFilters = data.activeFilters || {};
      const teachers = classId && classPeople[classId] ? classPeople[classId].teachers || [] : [];

      teacherFilter.innerHTML = '<option value="all">All teachers</option>';
      teachers.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        teacherFilter.appendChild(opt);
      });

      if (classId && activeFilters[classId]) {
        teacherFilter.value = activeFilters[classId];
      }

      debugBox.textContent = `classId: ${classId || 'none'} | teachers cached: ${teachers.length}`;

      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'GET_DEBUG' }, (resp) => {
          if (chrome.runtime.lastError) {
            debugBox.textContent += ` | content script not responding (reload the Classroom tab)`;
            return;
          }
          if (resp) debugBox.textContent += ` | posts found on page: ${resp.postsFound}`;
        });
      }
    });

    applyBtn.addEventListener("click", () => {
      const teacher = teacherFilter.value;
      if (!tab?.id) return;
      chrome.tabs.sendMessage(tab.id, { type: 'SET_FILTER', teacher }, (resp) => {
        if (chrome.runtime.lastError) {
          debugBox.textContent = `Error: content script not loaded. Reload the Classroom tab.`;
          return;
        }
        debugBox.textContent = `Filter applied: ${teacher} | ${resp.postsFound} posts scanned`;
      });
    });
  });
});