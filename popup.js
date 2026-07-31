document.addEventListener("DOMContentLoaded", () => {
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

  // Repopulate from last known course list on popup reopen, so the
  // dropdown isn't empty every time until you rerun the auth test.
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
        authResult.textContent = `OK! Courses: ${names}`;
        populateCourseDropdown(resp.courses);
        chrome.storage.local.set({ knownCourses: resp.courses });
      } else {
        authResult.textContent = `Failed: ${resp.error}`;
      }
    });
  });

  syncBtn.addEventListener("click", () => {
    const courseId = courseSelect.value;
    if (!courseId) {
      syncResult.textContent = "Pick a course first.";
      return;
    }
    syncResult.textContent = "Syncing topics, coursework, materials, roster...";
    chrome.runtime.sendMessage({ type: "SYNC_COURSE_DATA", courseId }, (resp) => {
      if (chrome.runtime.lastError) {
        syncResult.textContent = `Error: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (resp.ok) {
        const names = resp.courses.map(c => c.name).join(", ") || "(none found)";
        authResult.textContent = `✅ Success! Courses: ${names}`;
        populateCourseDropdown(resp.courses);
        chrome.storage.local.set({ knownCourses: resp.courses });
      } else {
        syncResult.textContent = `Failed: ${resp.error}`;
      }
    });
  });

  syncBtn.addEventListener("click", () => {
    const courseId = courseSelect.value;
    if (!courseId) {
      syncResult.textContent = "Pick a course first.";
      return;
    }
    syncResult.textContent = "Syncing topics, coursework, materials, roster...";
    chrome.runtime.sendMessage({ type: "SYNC_COURSE_DATA", courseId }, (resp) => {
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