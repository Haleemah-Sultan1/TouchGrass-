import { fetchCourses, syncCourseData, getCachedCourseData, getAllCachedCourses } from "./classroomapi.js";
import { estimateDifficulty } from "./difficulty.js";
import { analyzeTopicRelevance, NoTopicsError, saveManualTopics, getManualTopics } from "./topicRelevancy.js";
import { buildSchedule, buildSubjectStudySchedule } from "./studyPlanner.js";

chrome.runtime.onInstalled.addListener(() => {
  console.log("TouchGrass GCR installed");
});

// Resolves course IDs to display names using only ACTIVE (non-archived)
// courses. Returns a map of id -> name; any course ID not found here is
// archived (or otherwise inaccessible) and should be skipped by callers,
// never shown as a raw ID.
async function resolveActiveCourseNames() {
  const knownCourses = await new Promise((resolve) => {
    chrome.storage.local.get("knownCourses", (data) => resolve(data.knownCourses || []));
  });
  const nameById = Object.fromEntries(knownCourses.map((c) => [c.id, c.name]));

  try {
    const liveCourses = await fetchCourses(); // ACTIVE only
    liveCourses.forEach((c) => { nameById[c.id] = c.name; });
  } catch (err) {
    console.warn("Couldn't refresh live active course names:", err.message);
  }

  return nameById;
}

// Buddy Program is a mentorship/social class, not an academic subject with
// assignments to schedule around — always excluded from the planner.
function isExcludedCourseName(name) {
  return /buddy/i.test(name || "");
}

// Classifies a piece of coursework into a rough "type of work" bucket, used
// for the Timetable mode's ranked work-type preference.
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

// ---------- Messages from popup / planner ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "TEST_AUTH") {
    fetchCourses()
      .then((courses) => sendResponse({
        ok: true,
        courses: courses.map(c => ({ id: c.id, name: c.name })),
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

  // Every active (non-archived, non-Buddy) course — used to populate the
  // Study Plan mode's subject checklist, since any current course is fair game.
  if (msg.type === "GET_ACTIVE_COURSES") {
    fetchCourses()
      .then((courses) => {
        const filtered = courses.filter((c) => !isExcludedCourseName(c.name));
        sendResponse({ ok: true, courses: filtered.map((c) => ({ id: c.id, name: c.name })) });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // Courses that currently have pending (not-yet-submitted) assignments —
  // used to populate the Timetable mode's priority-subject dropdown.
  // Archived courses are silently skipped, never shown as a raw ID.
  if (msg.type === "GET_ALL_SYNCED_TASKS") {
    (async () => {
      try {
        const courses = await getAllCachedCourses();
        const nameById = await resolveActiveCourseNames();

        const tasks = [];
        for (const course of courses) {
          const courseName = nameById[course.courseId];
          if (!courseName) continue; // archived / no longer active — skip entirely
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

  // Timetable mode: deadline-driven schedule across ALL synced courses'
  // pending assignments, weighted by priority subject + ranked work-type preferences.
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
          if (!courseName) continue; // archived — skip entirely
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

  // Study Plan mode: subject/topic study, no deadlines involved.
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
});