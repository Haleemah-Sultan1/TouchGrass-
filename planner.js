document.addEventListener("DOMContentLoaded", () => {
  const modeSelect = document.getElementById("modeSelect");
  const startDateInput = document.getElementById("startDate");
  const endDateInput = document.getElementById("endDate");
  const hoursPerDayInput = document.getElementById("hoursPerDay");
  const timetableFields = document.getElementById("timetableFields");
  const studyPlanFields = document.getElementById("studyPlanFields");
  const prioritySubjectSelect = document.getElementById("prioritySubject");
  const workTypeChecklist = document.getElementById("workTypeChecklist");
  const subjectChecklist = document.getElementById("subjectChecklist");
  const generateBtn = document.getElementById("generateBtn");
  const statusEl = document.getElementById("status");
  const resultArea = document.getElementById("resultArea");

  const today = new Date();
  const weekAhead = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  startDateInput.value = today.toISOString().slice(0, 10);
  endDateInput.value = weekAhead.toISOString().slice(0, 10);

  function updateModeVisibility() {
    const isTimetable = modeSelect.value === "timetable";
    timetableFields.style.display = isTimetable ? "block" : "none";
    studyPlanFields.style.display = isTimetable ? "none" : "block";
  }
  modeSelect.addEventListener("change", updateModeVisibility);
  updateModeVisibility();

  // Timetable mode: only subjects with pending assignments (archived courses
  // are already excluded server-side, never shown here).
  chrome.runtime.sendMessage({ type: "GET_ALL_SYNCED_TASKS" }, (resp) => {
    if (!resp?.ok) return;
    const courseNames = [...new Set(resp.tasks.map((t) => t.courseName))];
    courseNames.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      prioritySubjectSelect.appendChild(opt);
    });
  });

  // Study Plan mode: every active, non-archived, non-Buddy course.
  chrome.runtime.sendMessage({ type: "GET_ACTIVE_COURSES" }, (resp) => {
    if (!resp?.ok) return;
    subjectChecklist.innerHTML = "";
    resp.courses.forEach((course, i) => {
      const row = document.createElement("div");
      row.className = "subjectRow";
      row.innerHTML = `
        <div class="subjectHeader">
          <input type="checkbox" class="subjChk" data-name="${course.name}" data-id="${course.id}">
          <strong>${course.name}</strong>
        </div>
        <div class="subjectDetails">
          <label>Priority rank (1 = highest)</label>
          <input type="number" class="subjPriority" min="1" value="${i + 1}">

          <label>Topics you need to study (comma-separated)</label>
          <input type="text" class="subjTopics" placeholder="e.g. Graphs, Trees, Recursion">

          <label>Which of those topics are your weakest? (comma-separated, optional)</label>
          <input type="text" class="subjWeakTopics" placeholder="e.g. Recursion">
        </div>
      `;
      const chk = row.querySelector(".subjChk");
      chk.addEventListener("change", () => row.classList.toggle("checked", chk.checked));
      subjectChecklist.appendChild(row);
    });
  });

  function renderSchedule(scheduleResult) {
    resultArea.innerHTML = "";
    const { schedule, overflow } = scheduleResult;

    schedule.forEach((day) => {
      const card = document.createElement("div");
      card.className = "dayCard";
      if (day.sessions.length === 0) {
        card.innerHTML = `<h3>${day.label}</h3><div class="session" style="border-left-color:#555;">Free day — nothing scheduled</div>`;
      } else {
        const sessionsHtml = day.sessions.map((s) => `
          <div class="session">
            <div class="title">${s.title}${s.chunkLabel ? " — " + s.chunkLabel : ""}</div>
            <div class="meta">${s.courseName} · ${s.minutes} min${s.difficultyScore ? ` · <span class="difficulty">Difficulty ${s.difficultyScore}/10</span>` : ""}</div>
          </div>
        `).join("");
        card.innerHTML = `<h3>${day.label} — ${day.minutesUsed} min planned</h3>${sessionsHtml}`;
      }
      resultArea.appendChild(card);
    });

    if (overflow.length > 0) {
      const box = document.createElement("div");
      box.id = "overflowBox";
      box.innerHTML = `<strong>⚠️ Couldn't fit within your available hours:</strong><br>` +
        overflow.map((c) => `${c.title}${c.chunkLabel ? " (" + c.chunkLabel + ")" : ""}${c.dueDate ? " — due " + c.dueDate.toLocaleDateString() : ""}`).join("<br>");
      resultArea.appendChild(box);
    }
  }

  generateBtn.addEventListener("click", () => {
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const hoursPerDay = parseFloat(hoursPerDayInput.value);

    if (!startDate || !endDate || !hoursPerDay) {
      statusEl.textContent = "Please fill in the date range and available hours.";
      return;
    }

    statusEl.textContent = "Building your plan...";
    resultArea.innerHTML = "";

    if (modeSelect.value === "timetable") {
      const prefRows = [...workTypeChecklist.querySelectorAll(".prefRow")];
      const checkedPrefs = prefRows.filter((r) => r.querySelector(".prefChk").checked);
      if (checkedPrefs.length > 3) {
        statusEl.textContent = "Please select at most 3 work-type preferences.";
        return;
      }
      const preferenceTypes = checkedPrefs
        .map((r) => ({
          type: r.querySelector(".prefChk").dataset.type,
          rank: parseInt(r.querySelector(".prefRank").value, 10) || 999,
        }))
        .sort((a, b) => a.rank - b.rank)
        .map((p) => p.type);

      chrome.runtime.sendMessage({
        type: "GENERATE_STUDY_PLAN",
        startDate, endDate, hoursPerDay,
        priorityCourseName: prioritySubjectSelect.value || null,
        preferenceTypes,
      }, (resp) => {
        if (chrome.runtime.lastError) { statusEl.textContent = `Error: ${chrome.runtime.lastError.message}`; return; }
        if (resp.ok) {
          statusEl.textContent = `✅ Plan generated — ${resp.taskCount} task(s) considered.`;
          renderSchedule(resp.scheduleResult);
        } else {
          statusEl.textContent = `❌ Failed: ${resp.error}`;
        }
      });
    } else {
      const rows = [...subjectChecklist.querySelectorAll(".subjectRow")];
      const checkedRows = rows.filter((r) => r.querySelector(".subjChk").checked);

      if (checkedRows.length === 0 || checkedRows.length > 5) {
        statusEl.textContent = "Please select between 1 and 5 subjects.";
        return;
      }

      const subjects = checkedRows
        .map((r) => ({
          name: r.querySelector(".subjChk").dataset.name,
          priority: parseInt(r.querySelector(".subjPriority").value, 10) || 999,
          topics: r.querySelector(".subjTopics").value.split(",").map((t) => t.trim()).filter(Boolean),
          weakTopics: r.querySelector(".subjWeakTopics").value.split(",").map((t) => t.trim()).filter(Boolean),
        }))
        .filter((s) => s.topics.length > 0);

      if (subjects.length === 0) {
        statusEl.textContent = "Enter at least one topic for each selected subject.";
        return;
      }

      chrome.runtime.sendMessage({
        type: "GENERATE_SUBJECT_STUDY_PLAN",
        startDate, endDate, hoursPerDay, subjects,
      }, (resp) => {
        if (chrome.runtime.lastError) { statusEl.textContent = `Error: ${chrome.runtime.lastError.message}`; return; }
        if (resp.ok) {
          statusEl.textContent = `✅ Plan generated for ${subjects.length} subject(s).`;
          renderSchedule(resp.scheduleResult);
        } else {
          statusEl.textContent = `❌ Failed: ${resp.error}`;
        }
      });
    }
  });
});