import { fetchCourses, fetchAllCoursesAnyState, isAuthorizedSilently, syncCourseData, getCachedCourseData, getAllCachedCourses } from "./classroomapi.js";
import { estimateDifficulty } from "./difficulty.js";
import { analyzeTopicRelevance, NoTopicsError, saveManualTopics, getManualTopics } from "./topicRelevancy.js";
import { buildSchedule, buildSubjectStudySchedule } from "./studyPlanner.js";
import { summarizeComments } from "./commentSummary.js";
import { extractChecklist, verifyChecklistAgainstFiles } from "./submissionChecker.js";

chrome.runtime.onInstalled.addListener(() => {
  console.log("TouchGrass GCR installed");
  autoSyncAllCourses();
});

chrome.runtime.onStartup.addListener(() => {
  autoSyncAllCourses();
});

async function resolveActiveCourseNames() {
  const knownCourses = await new Promise((resolve) => {
    chrome.storage.local.get("knownCourses", (data) => resolve(data.knownCourses || []));
  });
  const nameById = Object.fromEntries(knownCourses.map((c) => [c.id, c.name]));

  try {
    const liveCourses = await fetchCourses();
    liveCourses.forEach((c) => { nameById[c.id] = c.name; });
  } catch (err) {
    console.warn("Couldn't refresh live active course names:", err.message);
  }

  return nameById;
}

function isExcludedCourseName(name) {
  return /buddy/i.test(name || "");
}

function detectTaskType(item, topicName) {
  if (item.workType === "SHORT_ANSWER_QUESTION" || item.workType === "MULTIPLE_CHOICE_QUESTION") {
    return "Quizzes";
  }
  const text = `${topicName || ""} ${item.title || ""}`;
  if (/lab/i.test(text)) return "Lab Tasks";
  if (/project/i.test(text)) return "Projects";
  if (/quiz/i.test(text)) return "Quizzes";
  return "Assignments";
}

// ---------- Automatic background sync ----------
// Silently checks if the student is already authorized (never prompts a
// login window on its own) and, if so, re-syncs every active non-Buddy
// course. Safe to call frequently — syncCourseData respects the existing
// 15-minute cache internally (force: false), so this is cheap when
// nothing's actually stale. Triggered on extension startup/install, and
// on every message from content.js (page load) or popup.js (popup open).
let autoSyncInFlight = false;
async function autoSyncAllCourses() {
  if (autoSyncInFlight) return { ok: true, skipped: true };
  autoSyncInFlight = true;

  try {
    const authorized = await isAuthorizedSilently();
    if (!authorized) {
      return { ok: false, reason: "not_authorized" };
    }

    const courses = await fetchCourses();
    await new Promise((resolve) => {
      chrome.storage.local.set(
        { knownCourses: courses.map((c) => ({ id: c.id, name: c.name })) },
        resolve
      );
    });

    const targets = courses.filter((c) => !isExcludedCourseName(c.name));
    let syncedCount = 0;

    for (const c of targets) {
      try {
        await syncCourseData(c.id, c.name, { force: false });
        syncedCount++;
      } catch (err) {
        console.warn(`Auto-sync failed for "${c.name}":`, err.message);
      }
    }

    console.log(`🔁 Auto-sync complete: ${syncedCount}/${targets.length} course(s) up to date.`);
    return { ok: true, syncedCount, totalCount: targets.length };
  } catch (err) {
    console.warn("Auto-sync failed:", err.message);
    return { ok: false, error: err.message };
  } finally {
    autoSyncInFlight = false;
  }
}

// ---------- Messages from popup / planner / content script ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "AUTO_SYNC_ALL") {
    autoSyncAllCourses().then((result) => sendResponse(result));
    return true;
  }

  if (msg.type === "TEST_AUTH") {
    fetchAllCoursesAnyState()
      .then((courses) => sendResponse({
        ok: true,
        courses: courses.map(c => ({ id: c.id, name: c.name, courseState: c.courseState })),
      }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "SYNC_COURSE_DATA") {
    syncCourseData(msg.courseId, msg.courseName, { force: true })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "ESTIMATE_DIFFICULTY") {
    (async () => {
      try {
        const cached = await getCachedCourseData(msg.courseId);
        if (!cached) throw new Error("No synced data for this course — sync it first.");

        const item = cached.courseWork.find((cw) => cw.id === msg.itemId);
        if (!item) throw new Error("Assignment not found in synced data.");

        const topicName = item.topicId
          ? (cached.topics.find((t) => t.topicId === item.topicId)?.name || null)
          : null;

        const result = await estimateDifficulty(item, topicName);
        sendResponse({ ok: true, result, itemTitle: item.title });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === "ANALYZE_TOPIC_RELEVANCE") {
    (async () => {
      try {
        const cached = await getCachedCourseData(msg.courseId);
        if (!cached) throw new Error("No synced data for this course — sync it first.");

        const item = cached.courseWork.find((cw) => cw.id === msg.itemId);
        if (!item) throw new Error("Assignment not found in synced data.");

        let topics = await getManualTopics(msg.courseId);
        if (!topics || topics.length === 0) {
          topics = cached.topics;
        }

        const result = await analyzeTopicRelevance(item, topics);
        sendResponse({ ok: true, result, itemTitle: item.title });
      } catch (err) {
        if (err instanceof NoTopicsError) {
          sendResponse({ ok: false, needsManualTopics: true, error: err.message });
        } else {
          sendResponse({ ok: false, error: err.message });
        }
      }
    })();
    return true;
  }

  if (msg.type === "SAVE_MANUAL_TOPICS") {
    saveManualTopics(msg.courseId, msg.topicsCsv)
      .then((topics) => sendResponse({ ok: true, topics }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "GET_ACTIVE_COURSES") {
    fetchCourses()
      .then((courses) => {
        const filtered = courses.filter((c) => !isExcludedCourseName(c.name));
        sendResponse({ ok: true, courses: filtered.map((c) => ({ id: c.id, name: c.name })) });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "GET_ALL_SYNCED_TASKS") {
    (async () => {
      try {
        const courses = await getAllCachedCourses();
        const nameById = await resolveActiveCourseNames();

        const tasks = [];
        for (const course of courses) {
          const courseName = nameById[course.courseId];
          if (!courseName) continue;
          if (isExcludedCourseName(courseName)) continue;

          (course.courseWork || []).forEach((cw) => {
            if (!cw.dueDate) return;
            const isDone = cw.submissionState === "TURNED_IN" || cw.submissionState === "RETURNED";
            if (isDone) return;
            tasks.push({ title: cw.title, courseName, itemId: cw.id, courseId: course.courseId });
          });
        }
        sendResponse({ ok: true, tasks });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === "GENERATE_STUDY_PLAN") {
    (async () => {
      try {
        const courses = await getAllCachedCourses();
        const nameById = await resolveActiveCourseNames();

        const startDate = new Date(msg.startDate);
        const endDate = new Date(msg.endDate);

        const candidateTasks = [];
        for (const course of courses) {
          const courseName = nameById[course.courseId];
          if (!courseName) continue;
          if (isExcludedCourseName(courseName)) continue;

          (course.courseWork || []).forEach((cw) => {
            if (!cw.dueDate) return;
            const isDone = cw.submissionState === "TURNED_IN" || cw.submissionState === "RETURNED";
            if (isDone) return;

            const due = new Date(cw.dueDate.year, cw.dueDate.month - 1, cw.dueDate.day,
              cw.dueTime?.hours ?? 23, cw.dueTime?.minutes ?? 59);
            if (due < startDate || due > endDate) return;

            const topicName = cw.topicId
              ? (course.topics.find((t) => t.topicId === cw.topicId)?.name || null)
              : null;

            candidateTasks.push({ item: cw, courseName, dueDate: due, topicName });
          });
        }

        if (candidateTasks.length === 0) {
          sendResponse({ ok: true, taskCount: 0, scheduleResult: { schedule: [], overflow: [] } });
          return;
        }

        const enriched = [];
        for (const t of candidateTasks) {
          try {
            const est = await estimateDifficulty(t.item, t.topicName);
            enriched.push({
              title: t.item.title,
              courseName: t.courseName,
              dueDate: t.dueDate,
              estimatedMinutes: est.estimatedMinutes,
              difficultyScore: est.difficultyScore,
              typeLabel: detectTaskType(t.item, t.topicName),
            });
          } catch (err) {
            console.warn("Skipping a task, difficulty estimation failed:", err.message);
          }
        }

        const scheduleResult = buildSchedule(enriched, {
          startDate,
          endDate,
          hoursPerDay: msg.hoursPerDay,
          priorityCourseName: msg.priorityCourseName,
          preferenceTypes: msg.preferenceTypes || [],
        });

        sendResponse({ ok: true, taskCount: enriched.length, scheduleResult });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === "GENERATE_SUBJECT_STUDY_PLAN") {
    try {
      const startDate = new Date(msg.startDate);
      const endDate = new Date(msg.endDate);
      const scheduleResult = buildSubjectStudySchedule(msg.subjects, {
        startDate,
        endDate,
        hoursPerDay: msg.hoursPerDay,
      });
      sendResponse({ ok: true, scheduleResult });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
    return true;
  }

  if (msg.type === "SUMMARIZE_COMMENTS") {
    summarizeComments(msg.comments)
      .then((queries) => sendResponse({ ok: true, queries }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "EXTRACT_CHECKLIST") {
    extractChecklist(msg.instructionsText)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "VERIFY_CHECKLIST") {
    verifyChecklistAgainstFiles(msg.checklistItems, msg.textFileBlocks, msg.binaryFileParts)
      .then((results) => sendResponse({ ok: true, results }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});