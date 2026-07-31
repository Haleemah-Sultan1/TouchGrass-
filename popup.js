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

    function sendFilterMessage(tabId, teacher, knownTotal, isRetry = false) {
      chrome.tabs.sendMessage(tabId, { type: 'SET_FILTER', teacher, knownTotal }, (resp) => {
        if (chrome.runtime.lastError) {
          if (isRetry) {
            debugBox.textContent = `Error: couldn't reach the page even after injecting. Try reloading the Classroom tab.`;
            return;
          }
          chrome.scripting.executeScript(
            { target: { tabId }, files: ["content.js"] },
            () => {
              if (chrome.runtime.lastError) {
                debugBox.textContent = `Error: ${chrome.runtime.lastError.message}`;
                return;
              }
              sendFilterMessage(tabId, teacher, knownTotal, true);
            }
          );
          return;
        }
        const totalNote = knownTotal != null ? ` | ${knownTotal} total announcements from this teacher` : "";
        debugBox.textContent = `Filter applied: ${teacher} | ${resp.postsFound} posts scanned${totalNote}`;
      });
    }

    // NEW: fetches the real announcement count from synced API data (no
    // DOM scanning) and passes it along with the filter so content.js can
    // show an accurate total instead of guessing from scroll position.
    function applyFilterWithRealCount() {
      const teacher = teacherFilter.value;
      if (!tab?.id) return;
<<<<<<< HEAD
      chrome.tabs.sendMessage(tab.id, { type: 'SET_FILTER', teacher }, (resp) => {
        if (chrome.runtime.lastError) {
          debugBox.textContent = `Error: content script not loaded. Reload the Classroom tab.`;
          return;document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("openPlanner")?.addEventListener("click", () => {
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

  analyzeTopicsBtn?.addEventListener("click", runTopicAnalysis);

  useManualTopicsBtn?.addEventListener("click", () => {
    manualTopicsBox.style.display = "block";
    topicStatus.textContent = "Enter your own subject topics below — this will override Classroom's own topic categories for this course.";
  });

  saveManualTopicsBtn?.addEventListener("click", () => {
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

    // Sends the filter to content.js. If the content script isn't reachable
    // (e.g. the tab was open before the extension was last reloaded), this
    // retries once by injecting content.js directly before giving up.
    function sendFilterMessage(tabId, teacher, knownTotal, isRetry = false) {
      chrome.tabs.sendMessage(tabId, { type: 'SET_FILTER', teacher, knownTotal }, (resp) => {
        if (chrome.runtime.lastError) {
          if (isRetry) {
            debugBox.textContent = `Error: couldn't reach the page even after injecting. Try reloading the Classroom tab.`;
            return;
          }
          chrome.scripting.executeScript(
            { target: { tabId }, files: ["content.js"] },
            () => {
              if (chrome.runtime.lastError) {
                debugBox.textContent = `Error: ${chrome.runtime.lastError.message}`;
                return;
              }
              sendFilterMessage(tabId, teacher, knownTotal, true);
            }
          );
          return;
        }
        const totalNote = knownTotal != null ? ` | ${knownTotal} total announcements from this teacher` : "";
        debugBox.textContent = `Filter applied: ${teacher} | ${resp.postsFound} posts scanned${totalNote}`;
      });
    }

    // Fetches the real announcement count from synced API data (no DOM
    // scanning) and passes it along with the filter so content.js can show
    // an accurate total instead of guessing from scroll position.
    function applyFilterWithRealCount() {
      const teacher = teacherFilter.value;
      if (!tab?.id) return;
      if (!classId) {
        sendFilterMessage(tab.id, teacher, null);
        return;
      }
      chrome.runtime.sendMessage(
        { type: "GET_TEACHER_ANNOUNCEMENT_COUNT", courseId: classId, teacher },
        (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) {
            if (resp?.needsSync) {
              debugBox.textContent = "This course hasn't been synced yet — sync it (above) for an accurate total.";
            }
            sendFilterMessage(tab.id, teacher, null);
            return;
          }
          sendFilterMessage(tab.id, teacher, resp.total);
        }
      );
    }

    applyBtn.addEventListener("click", applyFilterWithRealCount);
  });

  // ---- Dark mode toggle ----
  const darkToggle = document.getElementById('dark-toggle');
  if (darkToggle) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;

      chrome.tabs.sendMessage(tabId, { type: 'GET_DARK_MODE' }, (res) => {
        if (chrome.runtime.lastError) return;
        darkToggle.checked = !!res?.enabled;
      });

      darkToggle.addEventListener('change', () => {
        chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_DARK_MODE' }, () => {
          if (chrome.runtime.lastError) {
            console.log('Dark mode toggle failed:', chrome.runtime.lastError.message);
          }
        });
      });
    });
  }

  // ---- Pin feature: load + render the pinned list on popup open ----
  loadPins();

}); // end DOMContentLoaded

// ==================== PIN FEATURE (popup side) ====================

// Shared helper: current class ID + active tab ID.
function getActiveClassId(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || '';
    const match = url.match(/\/(c|r)\/([^\/]+)/);
    const classId = match ? match[2] : null;
    callback(classId, tabs[0]?.id);
  });
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function loadPins() {
  const list = document.getElementById('pinned-list');
  if (!list) return; // this popup.html has no pinned-list container — nothing to render into

  getActiveClassId((classId, tabId) => {
    if (!classId || !tabId) {
      renderPins([], classId, tabId);
      return;
    }
    chrome.tabs.sendMessage(tabId, { type: 'GET_PINS', classId }, (res) => {
      if (chrome.runtime.lastError || !res) {
        renderPins([], classId, tabId);
        return;
      }
      renderPins(res.pins || [], classId, tabId);
    });
  });
}

function renderPins(pins, classId, tabId) {
  const list = document.getElementById('pinned-list');
  const countEl = document.getElementById('pin-count');
  if (countEl) countEl.textContent = pins.length ? `(${pins.length})` : '';

  if (!list) return;

  if (!pins.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📌</div>
        No pinned posts yet.<br>Hover a post and click 📌 to pin it.
      </div>`;
    return;
  }

  list.innerHTML = '';
  pins.slice().reverse().forEach(pin => {
    const item = document.createElement('div');
    item.className = 'pinned-item';
    item.title = pin.url ? 'Click to open this announcement' : 'Click to scroll to this post';
    item.innerHTML = `
      <div class="pin-dot"></div>
      <div style="flex:1; min-width:0;">
        <div class="pin-snippet">${escapeHtml(pin.snippet)}</div>
        <div class="pin-time">${timeAgo(pin.pinnedAt)}</div>
      </div>
      <button class="unpin-btn" title="Unpin" data-id="${pin.id}">x</button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('unpin-btn')) return;

      // If a real permalink was captured when this post was pinned,
      // navigate straight there — this is the actual "go to the task" jump.
      if (pin.url) {
        chrome.tabs.update(tabId, { url: pin.url });
        return;
      }

      // No permalink was found for this post — fall back to scrolling,
      // which only works if you're already on that class's stream.
      if (!tabId) return;
      chrome.tabs.sendMessage(tabId, { type: 'SCROLL_TO_PIN', pinId: pin.id }, (res) => {
        if (chrome.runtime.lastError || !res?.found) {
          alert("Couldn't jump directly to this post — open the class stream and scroll to find it manually.");
        }
      });
    });

    item.querySelector('.unpin-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.storage.local.get("pinnedPosts", (data) => {
        const all = data.pinnedPosts || {};
        all[classId] = (all[classId] || []).filter(p => p.id !== pin.id);
        chrome.storage.local.set({ pinnedPosts: all }, () => {
          if (tabId) {
            chrome.tabs.sendMessage(tabId, { type: 'UNPIN_FROM_POPUP', pinId: pin.id }, () => {
              if (chrome.runtime.lastError) {
                console.log('Unpin sync to page failed:', chrome.runtime.lastError.message);
              }
            });
          }
          loadPins();
        });
      });
    });

    list.appendChild(item);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
        }
        debugBox.textContent = `Filter applied: ${teacher} | ${resp.postsFound} posts scanned`;
      });
    });
  });

  // Dark mode toggle — runs after DOM is ready, queries tab directly
  const darkToggle = document.getElementById('dark-toggle');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;

    // Load current dark mode state and reflect it in the toggle
    chrome.tabs.sendMessage(tabId, { type: 'GET_DARK_MODE' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (darkToggle) darkToggle.checked = !!res?.enabled;
    });

    if (darkToggle) {
      darkToggle.addEventListener('change', () => {
        chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_DARK_MODE' });
      });
    }
  });

  // ---- Pin feature: load + render the pinned list on every popup open ----
  // (Nothing else was calling loadPins() in this popup, since there are no
  // .tab elements here — without this line the pinned list never populates.)
  loadPins();

}); // end DOMContentLoaded

// ---- Tab switching (safe no-op here since this popup.html has no .tab elements) ----
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab)?.classList.add('active');
    if (tab.dataset.tab === 'pinned') loadPins();
  });
});

// ---- Get active tab's class ID ----
function getActiveClassId(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || '';
    const match = url.match(/\/(c|r)\/([^\/]+)/);
    const classId = match ? match[2] : null;
    const display = document.getElementById('class-id-display');
    if (display) display.textContent = classId ? `#${classId.slice(0, 8)}` : 'no class';
    callback(classId, tabs[0]?.id);
  });
}

// ---- Load teachers into select (no-op here — this popup.html has no #teacher-select) ----
getActiveClassId((classId, tabId) => {
  if (!classId) {
    setStatus('Not on a GCR class page', 'err');
    return;
  }
  chrome.storage.local.get("classPeople", (data) => {
    const people = (data.classPeople || {})[classId];
    const select = document.getElementById('teacher-select');
    if (!select) return;
    if (people?.teachers?.length) {
      people.teachers.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      });
    }
    chrome.storage.local.get("activeFilters", (fdata) => {
      const saved = (fdata.activeFilters || {})[classId];
      if (saved) select.value = saved;
    });
  });
});

// ---- Apply filter (new UI) ----
const applyBtnNew = document.getElementById('apply-btn');
if (applyBtnNew) {
  applyBtnNew.addEventListener('click', () => {
    const teacher = document.getElementById('teacher-select')?.value;
    getActiveClassId((classId, tabId) => {
      if (!tabId) return;
      chrome.tabs.sendMessage(tabId, { type: 'SET_FILTER', teacher }, (res) => {
        if (chrome.runtime.lastError) {
          setStatus('Could not reach page — refresh GCR', 'err');
          if (isRetry) {
            debugBox.textContent = `Error: couldn't reach the page even after injecting. Try reloading the Classroom tab.`;
            return;
          }
          chrome.scripting.executeScript(
            { target: { tabId }, files: ["content.js"] },
            () => {
              if (chrome.runtime.lastError) {
                debugBox.textContent = `Error: ${chrome.runtime.lastError.message}`;
                return;
              }
              sendFilterMessage(tabId, teacher, knownTotal, true);
            }
          );
          return;
        }
        const label = teacher === 'all' ? 'Showing all' : `Filtered: ${teacher}`;
        setStatus(`${label} · ${res?.postsFound ?? 0} posts found`, 'ok');
      });
    });
  });
}

// ---- Clear filter ----
const clearBtn = document.getElementById('clear-btn');
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    const select = document.getElementById('teacher-select');
    if (select) select.value = 'all';
    getActiveClassId((classId, tabId) => {
      if (!tabId) return;
      chrome.tabs.sendMessage(tabId, { type: 'SET_FILTER', teacher: 'all' }, () => {
        setStatus('Filter cleared', 'ok');
      });
    });
  });
}

// ---- Load pinned posts ----
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function loadPins() {
  const list = document.getElementById('pinned-list');
  if (!list) return; // this popup.html has no pinned-list container — nothing to render into

  getActiveClassId((classId, tabId) => {
    if (!classId || !tabId) {
      renderPins([], classId, tabId);
      return;
    }
    chrome.tabs.sendMessage(tabId, { type: 'GET_PINS', classId }, (res) => {
      if (chrome.runtime.lastError || !res) {
        renderPins([], classId, tabId);
=======
      if (!classId) {
        sendFilterMessage(tab.id, teacher, null);
>>>>>>> c507f2defd1de419f5311f687ba3dfe225a24fa8
        return;
      }
      chrome.runtime.sendMessage(
        { type: "GET_TEACHER_ANNOUNCEMENT_COUNT", courseId: classId, teacher },
        (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) {
            if (resp?.needsSync) {
              debugBox.textContent = "This course hasn't been synced yet — sync it (above) for an accurate total.";
            }
            sendFilterMessage(tab.id, teacher, null);
            return;
          }
          sendFilterMessage(tab.id, teacher, resp.total);
        }
      );
    }

    applyBtn.addEventListener("click", applyFilterWithRealCount);
  });
<<<<<<< HEAD
}

function renderPins(pins, classId, tabId) {
  const list = document.getElementById('pinned-list');
  const countEl = document.getElementById('pin-count');
  if (countEl) countEl.textContent = pins.length ? `(${pins.length})` : '';

  if (!list) return;

  if (!pins.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📌</div>
        No pinned posts yet.<br>Hover a post and click 📌 to pin it.
      </div>`;
    return;
  }

  list.innerHTML = '';
  pins.slice().reverse().forEach(pin => {
    const item = document.createElement('div');
    item.className = 'pinned-item';
    item.title = pin.url ? 'Click to open this announcement' : 'Click to scroll to this post';
    item.innerHTML = `
      <div class="pin-dot"></div>
      <div style="flex:1; min-width:0;">
        <div class="pin-snippet">${escapeHtml(pin.snippet)}</div>
        <div class="pin-time">${timeAgo(pin.pinnedAt)}</div>
      </div>
      <button class="unpin-btn" title="Unpin" data-id="${pin.id}">x</button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('unpin-btn')) return;

      // This is the actual "go to the task" behavior: if a real permalink
      // was captured when the post was pinned, navigate straight there.
      if (pin.url) {
        chrome.tabs.update(tabId, { url: pin.url });
        return;
      }

      // No permalink was found for this post — fall back to scrolling,
      // which only works if you're already on that class's stream.
      if (!tabId) return;
      chrome.tabs.sendMessage(tabId, { type: 'SCROLL_TO_PIN', pinId: pin.id }, (res) => {
        if (chrome.runtime.lastError || !res?.found) {
          alert("Couldn't jump directly to this post — open the class stream and scroll to find it manually.");
        }
      });
    });

    item.querySelector('.unpin-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.storage.local.get("pinnedPosts", (data) => {
        const all = data.pinnedPosts || {};
        all[classId] = (all[classId] || []).filter(p => p.id !== pin.id);
        chrome.storage.local.set({ pinnedPosts: all }, () => {
          if (tabId) {
            chrome.tabs.sendMessage(tabId, { type: 'UNPIN_FROM_POPUP', pinId: pin.id }, () => {
              if (chrome.runtime.lastError) {
                console.log('Unpin sync to page failed:', chrome.runtime.lastError.message);
              }
            });
          }
          loadPins();
        });
      });
    });

    list.appendChild(item);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setStatus(msg, type = '') {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.className = type;
}
=======
});
>>>>>>> c507f2defd1de419f5311f687ba3dfe225a24fa8
