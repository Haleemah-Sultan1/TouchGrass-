document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("openPlanner").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("planner.html") });
  });

  const teacherFilter = document.getElementById("teacherFilter");
  const applyBtn = document.getElementById("applyFilters");
  const debugBox = document.getElementById("debugBox");
  const testAuthBtn = document.getElementById("testAuth");
  const authResult = document.getElementById("authResult");
  const courseSelect = document.getElementById("courseSelect");
  const syncBtn = document.getElementById("syncCourse");
  const syncResult = document.getElementById("syncResult");
  const assignmentSelect = document.getElementById("assignmentSelect");
  const estimateBtn = document.getElementById("estimateBtn");
  const difficultyResult = document.getElementById("difficultyResult");
  const analyzeTopicsBtn = document.getElementById("analyzeTopicsBtn");
  const useManualTopicsBtn = document.getElementById("useManualTopicsBtn");
  const manualTopicsBox = document.getElementById("manualTopicsBox");
  const manualTopicsInput = document.getElementById("manualTopicsInput");
  const saveManualTopicsBtn = document.getElementById("saveManualTopicsBtn");
  const topicStatus = document.getElementById("topicStatus");
  const topicResult = document.getElementById("topicResult");

  function populateCourseDropdown(courses) {
    courseSelect.innerHTML = "";
    if (!courses || courses.length === 0) {
      courseSelect.innerHTML = '<option value="">No courses found</option>';
      return;
    }
    courses.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      opt.dataset.name = c.name;
      courseSelect.appendChild(opt);
    });
  }

  function populateAssignmentDropdown(courseWork) {
    assignmentSelect.innerHTML = "";
    if (!courseWork || courseWork.length === 0) {
      assignmentSelect.innerHTML = '<option value="">No assignments found</option>';
      return;
    }
    courseWork.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.title;
      assignmentSelect.appendChild(opt);
    });
  }

  function renderQuestionBreakdown(questions) {
    topicResult.innerHTML = "";
    if (!questions || questions.length === 0) {
      topicResult.textContent = "No questions identified in this assignment's text.";
      return;
    }
    questions.forEach((q) => {
      const card = document.createElement("div");
      card.className = "questionCard";
      card.innerHTML = `
        <div class="qLabel">${q.questionLabel}${q.questionSummary ? " — " + q.questionSummary : ""}</div>
        <div class="qTopics">Topics: ${q.relevantTopics.length ? q.relevantTopics.join(", ") : "(none matched)"}</div>
        <div class="qConcepts">Concepts: ${q.concepts.length ? q.concepts.join(", ") : "(none listed)"}</div>
        <div class="qDifficulty">Difficulty: ${q.difficultyScore}/10</div>
        <div class="qReasoning">${q.reasoning}</div>
      `;
      topicResult.appendChild(card);
    });
  }

  function runTopicAnalysis() {
    const courseId = courseSelect.value;
    const itemId = assignmentSelect.value;
    if (!courseId || !itemId) {
      topicStatus.textContent = "Sync a course and pick an assignment first.";
      return;
    }
    topicStatus.textContent = "Reading attached files and breaking down each question... (this may take longer)";
    topicResult.innerHTML = "";
    manualTopicsBox.style.display = "none";
    chrome.runtime.sendMessage({ type: "ANALYZE_TOPIC_RELEVANCE", courseId, itemId }, (resp) => {
      if (chrome.runtime.lastError) {
        topicStatus.textContent = `Error: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (resp.ok) {
        topicStatus.textContent = `"${resp.itemTitle}" — ${resp.result.questions.length} question(s) found:`;
        renderQuestionBreakdown(resp.result.questions);
      } else if (resp.needsManualTopics) {
        topicStatus.textContent = "This course has no synced topics.";
        manualTopicsBox.style.display = "block";
      } else {
        topicStatus.textContent = `❌ Failed: ${resp.error}`;
      }
    });
  }

  chrome.storage.local.get("knownCourses", (data) => {
    if (data.knownCourses) populateCourseDropdown(data.knownCourses);
  });

  testAuthBtn.addEventListener("click", () => {
    authResult.textContent = "Requesting token + fetching courses...";
    chrome.runtime.sendMessage({ type: "TEST_AUTH" }, (resp) => {
      if (chrome.runtime.lastError) {
        authResult.textContent = `Error: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (resp.ok) {
        const names = resp.courses.map(c => c.name).join(", ") || "(none found)";
        authResult.textContent = `✅ Success! Courses: ${names}`;
        populateCourseDropdown(resp.courses);
        chrome.storage.local.set({ knownCourses: resp.courses });
      } else {
        authResult.textContent = `❌ Failed: ${resp.error}`;
      }
    });
  });

  syncBtn.addEventListener("click", () => {
    const courseId = courseSelect.value;
    const courseName = courseSelect.selectedOptions[0]?.dataset.name || courseSelect.selectedOptions[0]?.textContent;
    if (!courseId) {
      syncResult.textContent = "Pick a course first.";
      return;
    }
    syncResult.textContent = "Syncing topics, coursework, materials, roster, submissions...";
    chrome.runtime.sendMessage({ type: "SYNC_COURSE_DATA", courseId, courseName }, (resp) => {
      if (chrome.runtime.lastError) {
        syncResult.textContent = `Error: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (resp.ok) {
        const groups = resp.data.groups;
        const totalItems = resp.data.courseWork.length + resp.data.courseWorkMaterials.length;
        const breakdown = Object.entries(groups)
          .map(([name, items]) => `${name}: ${items.length}`)
          .join(" | ");
        syncResult.textContent = `✅ Total: ${totalItems} items — ${breakdown}`;
        populateAssignmentDropdown(resp.data.courseWork);
      } else {
        syncResult.textContent = `❌ Failed: ${resp.error}`;
      }
    });
  });

  estimateBtn.addEventListener("click", () => {
    const courseId = courseSelect.value;
    const itemId = assignmentSelect.value;
    if (!courseId || !itemId) {
      difficultyResult.textContent = "Sync a course and pick an assignment first.";
      return;
    }
    difficultyResult.textContent = "Asking Gemini to size this up...";
    chrome.runtime.sendMessage({ type: "ESTIMATE_DIFFICULTY", courseId, itemId }, (resp) => {
      if (chrome.runtime.lastError) {
        difficultyResult.textContent = `Error: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (resp.ok) {
        const r = resp.result;
        difficultyResult.textContent =
          `"${resp.itemTitle}" — ${r.difficultyLabel} (${r.difficultyScore}/10) — ` +
          `~${r.estimatedMinutes} min. ${r.reasoning}`;
      } else {
        difficultyResult.textContent = `❌ Failed: ${resp.error}`;
      }
    });
  });

  analyzeTopicsBtn.addEventListener("click", runTopicAnalysis);

  useManualTopicsBtn.addEventListener("click", () => {
    manualTopicsBox.style.display = "block";
    topicStatus.textContent = "Enter your own subject topics below — this will override Classroom's own topic categories for this course.";
  });

  saveManualTopicsBtn.addEventListener("click", () => {
    const courseId = courseSelect.value;
    const topicsCsv = manualTopicsInput.value.trim();
    if (!courseId || !topicsCsv) {
      topicStatus.textContent = "Type at least one topic first.";
      return;
    }
    chrome.runtime.sendMessage({ type: "SAVE_MANUAL_TOPICS", courseId, topicsCsv }, (resp) => {
      if (resp.ok) {
        manualTopicsBox.style.display = "none";
        runTopicAnalysis();
      } else {
        topicStatus.textContent = `❌ Failed to save topics: ${resp.error}`;
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
    function sendFilterMessage(tabId, teacher, isRetry = false) {
  chrome.tabs.sendMessage(tabId, { type: 'SET_FILTER', teacher }, (resp) => {
    if (chrome.runtime.lastError) {
      if (isRetry) {
        debugBox.textContent = `Error: couldn't reach the page even after injecting. Try reloading the Classroom tab.`;
        return;
      }
      // Content script wasn't alive on this tab — inject it now, then retry once.
      chrome.scripting.executeScript(
        { target: { tabId }, files: ["content.js"] },
        () => {
          if (chrome.runtime.lastError) {
            debugBox.textContent = `Error: ${chrome.runtime.lastError.message}`;
            return;
          }
          sendFilterMessage(tabId, teacher, true);
        }
      );
      return;
    }
    debugBox.textContent = `Filter applied: ${teacher} | ${resp.postsFound} posts scanned`;
  });
}

applyBtn.addEventListener("click", () => {
  const teacher = teacherFilter.value;
  if (!tab?.id) return;
  sendFilterMessage(tab.id, teacher);
});
  });
});