document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("openPlanner")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("planner.html") });
  });
  document.getElementById("openChecklist").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("checklist.html") });
  });
  document.getElementById('openFiles')?.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const match = (tabs[0]?.url || '').match(/\/(c|r)\/([^\/]+)/);
    const classId = match ? match[2] : '';
    chrome.tabs.create({ url: chrome.runtime.getURL(`files.html?classId=${classId}`) });
  });
});
  const teacherFilter = document.getElementById("teacherFilter");
  const applyBtn = document.getElementById("applyFilters");
  const debugBox = document.getElementById("debugBox");
  const testAuthBtn = document.getElementById("testAuth");
  const authResult = document.getElementById("authResult");
  const courseSelect = document.getElementById("courseSelect");
  const coursePicker = document.getElementById("coursePicker");
  const coursePickerTrigger = document.getElementById("coursePickerTrigger");
  const coursePickerPanel = document.getElementById("coursePickerPanel");
  const activeCourseList = document.getElementById("activeCourseList");
  const archivedHeader = document.getElementById("archivedHeader");
  const archivedCourseList = document.getElementById("archivedCourseList");
  const archivedCaret = document.getElementById("archivedCaret");
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
      renderCoursePicker([], []);
      return;
    }

    function addOption(parent, c) {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      opt.dataset.name = c.name;
      parent.appendChild(opt);
    }

    const active = courses.filter(c => c.courseState !== "ARCHIVED");
    const archived = courses.filter(c => c.courseState === "ARCHIVED");

    // Real select stays flat (no optgroup needed) - it's hidden now and
    // only exists so the rest of the code can keep reading
    // courseSelect.value / .selectedOptions[0] exactly as before.
    active.forEach(c => addOption(courseSelect, c));
    archived.forEach(c => addOption(courseSelect, c));

    renderCoursePicker(active, archived);
  }

  // ---- Custom picker: active classes always visible, archived classes
  // collapsed behind a header until clicked ----
  function selectCourseInPicker(course) {
    courseSelect.value = course.id;
    coursePickerTrigger.textContent = course.name;
    coursePickerPanel.classList.remove("open");
    coursePickerPanel.querySelectorAll(".course-option").forEach(el => {
      el.classList.toggle("selected", el.dataset.courseId === course.id);
    });
  }

  function renderCoursePicker(active, archived) {
    if (!coursePickerTrigger) return; // popup.html doesn't have this widget

    activeCourseList.innerHTML = "";
    active.forEach(c => {
      const row = document.createElement("div");
      row.className = "course-option";
      row.textContent = c.name;
      row.dataset.courseId = c.id;
      row.addEventListener("click", () => selectCourseInPicker(c));
      activeCourseList.appendChild(row);
    });

    archivedCourseList.innerHTML = "";
    archived.forEach(c => {
      const row = document.createElement("div");
      row.className = "course-option";
      row.textContent = c.name;
      row.dataset.courseId = c.id;
      row.addEventListener("click", () => selectCourseInPicker(c));
      archivedCourseList.appendChild(row);
    });

    if (archivedHeader) archivedHeader.style.display = archived.length ? "" : "none";

    if (active.length === 0 && archived.length === 0) {
      coursePickerTrigger.textContent = "No courses found";
    } else {
      coursePickerTrigger.textContent = "Select a course…";
    }
  }

  coursePickerTrigger?.addEventListener("click", () => {
    coursePickerPanel.classList.toggle("open");
  });

  archivedHeader?.addEventListener("click", () => {
    const isCollapsed = archivedCourseList.style.display === "none";
    archivedCourseList.style.display = isCollapsed ? "block" : "none";
    archivedCaret?.classList.toggle("open", isCollapsed);
  });

  // Click outside the picker closes the open panel
  document.addEventListener("click", (e) => {
    if (coursePicker && !coursePicker.contains(e.target)) {
      coursePickerPanel?.classList.remove("open");
    }
  });

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

  // ---- Pin feature: everything happens here in the popup now ----
  loadStreamPosts(); // "posts on this page" list, each with a pin toggle
  loadPins();        // "pinned" list

}); // end DOMContentLoaded

// ==================== PIN FEATURE (popup-only, no on-page UI) ====================

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

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getPinnedIdSet(classId, callback) {
  chrome.storage.local.get("pinnedPosts", (data) => {
    const pins = (data.pinnedPosts || {})[classId] || [];
    callback(new Set(pins.map(p => p.id)), pins);
  });
}

function setPinned(classId, post, shouldBePinned, callback) {
  chrome.storage.local.get("pinnedPosts", (data) => {
    const all = data.pinnedPosts || {};
    let pins = all[classId] || [];
    if (shouldBePinned) {
      if (!pins.some(p => p.id === post.id)) {
        pins = [...pins, { id: post.id, snippet: post.snippet, url: post.url, pinnedAt: Date.now() }];
      }
    } else {
      pins = pins.filter(p => p.id !== post.id);
    }
    all[classId] = pins;
    chrome.storage.local.set({ pinnedPosts: all }, callback);
  });
}

// ---- "Posts on this page" list, with a pin toggle for each ----

function loadStreamPosts() {
  const list = document.getElementById('stream-list');
  if (!list) return; // popup.html doesn't have this section — nothing to do

  getActiveClassId((classId, tabId) => {
    if (!classId || !tabId) {
      renderStreamPosts([], classId, tabId, new Set());
      return;
    }
    chrome.tabs.sendMessage(tabId, { type: 'GET_STREAM_POSTS' }, (res) => {
      if (chrome.runtime.lastError || !res) {
        list.innerHTML = `<div class="empty-state">Couldn't read this page — reload the Classroom tab.</div>`;
        return;
      }
      getPinnedIdSet(classId, (pinnedIds) => {
        renderStreamPosts(res.posts || [], classId, tabId, pinnedIds);
      });
    });
  });
}

function renderStreamPosts(posts, classId, tabId, pinnedIds) {
  const list = document.getElementById('stream-list');
  const countEl = document.getElementById('stream-count');
  if (countEl) countEl.textContent = posts.length ? `(${posts.length})` : '';
  if (!list) return;

  if (!posts.length) {
    list.innerHTML = `<div class="empty-state">No posts found on this page yet.</div>`;
    return;
  }

  list.innerHTML = '';
  posts.forEach(post => {
    const isPinned = pinnedIds.has(post.id);
    const item = document.createElement('div');
    item.className = 'pinned-item';
    item.innerHTML = `
      <button class="pin-toggle-btn" title="${isPinned ? 'Unpin' : 'Pin'}">${isPinned ? '📍' : '📌'}</button>
      <div style="flex:1; min-width:0;">
        <div class="pin-snippet">${escapeHtml(post.snippet || '(no preview)')}</div>
      </div>
    `;

    item.querySelector('.pin-toggle-btn').addEventListener('click', () => {
      setPinned(classId, post, !isPinned, () => {
        loadStreamPosts();
        loadPins();
      });
    });

    list.appendChild(item);
  });
}

// ---- "Pinned" list ----

function loadPins() {
  const list = document.getElementById('pinned-list');
  if (!list) return; // popup.html doesn't have this section — nothing to do

  getActiveClassId((classId, tabId) => {
    if (!classId) {
      renderPins([], classId, tabId);
      return;
    }
    chrome.storage.local.get("pinnedPosts", (data) => {
      renderPins((data.pinnedPosts || {})[classId] || [], classId, tabId);
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
        No pinned posts yet.<br>Pin one from the list above.
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
      // navigate straight there.
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
          loadPins();
          loadStreamPosts();
        });
      });
    });

    list.appendChild(item);
  });
}