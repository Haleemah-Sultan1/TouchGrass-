chrome.runtime.onInstalled.addListener(() => {
  console.log("TouchGrass GCR installed");
});

// ---------- Auth ----------
function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError || new Error("No token returned"));
        return;
      }
      resolve(token);
    });
  });
}

function clearCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

// ---------- Test call: courses.list ----------
async function testFetchCourses() {
  try {
    const token = await getAuthToken(true);
    console.log("✅ Got auth token (first 12 chars):", token.slice(0, 12) + "...");

    const res = await fetch("https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.status === 401) {
      await clearCachedToken(token);
      throw new Error("Token expired/invalid (401). Cleared cache — try again.");
    }

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Classroom API error ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    console.log("📚 Courses fetched:", data.courses?.length || 0);
    console.log(data.courses);
    return data.courses || [];
  } catch (err) {
    console.error("❌ testFetchCourses failed:", err);
    throw err;
  }
}

// ---------- Messages from popup ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "TEST_AUTH") {
    testFetchCourses()
      .then((courses) => sendResponse({ ok: true, courseNames: courses.map(c => c.name) }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});