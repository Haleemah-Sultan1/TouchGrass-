import { fetchCourses, syncCourseData } from "./classroomapi.js";

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
});