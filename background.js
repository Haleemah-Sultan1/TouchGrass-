import { fetchCourses, syncCourseData, getCachedCourseData } from "./classroomapi.js";
import { estimateDifficulty } from "./difficulty.js";

chrome.runtime.onInstalled.addListener(() => {
  console.log("TouchGrass GCR installed");
});

// ---------- Messages from popup ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "TEST_AUTH") {
    fetchCourses()
      .then((courses) => sendResponse({
        ok: true,
        courses: courses.map(c => ({ id: c.id, name: c.name })),
      }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep message channel open for async response
  }

  if (msg.type === "SYNC_COURSE_DATA") {
    syncCourseData(msg.courseId, { force: true })
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
});