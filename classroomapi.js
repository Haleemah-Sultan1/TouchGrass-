// classroomapi.js
// Shared data layer: auth, all Google Classroom API calls, topic grouping, and caching.
// Every feature module (study plans, difficulty estimation, topic relevancy,
// comments) should read from the cache this file writes — never call
// fetch() against the Classroom API directly from feature code.

const CACHE_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

// ---------- Auth ----------
export function getAuthToken(interactive = true) {
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

export function clearCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

// ---------- Low-level fetch helper with automatic 401 retry ----------
async function apiFetch(url) {
  let token = await getAuthToken(true);
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 401) {
    await clearCachedToken(token);
    token = await getAuthToken(true);
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Classroom API error ${res.status}: ${errBody}`);
  }

  return res.json();
}

// Google's API paginates results (nextPageToken). This walks all pages
// and deduplicates by item id, so callers always get the complete,
// non-duplicated list in one call.
async function apiFetchAllPages(baseUrl, listKey) {
  const seenIds = new Set();
  const items = [];
  let pageToken = null;
  let pageCount = 0;

  do {
    const url = pageToken ? `${baseUrl}&pageToken=${pageToken}` : baseUrl;
    const data = await apiFetch(url);
    const pageItems = data[listKey] || [];
    pageCount++;

    for (const item of pageItems) {
      // Guard against duplicates across pages (defensive — shouldn't happen,
      // but silently doubling counts is exactly the kind of bug that's hard
      // to spot without this).
      if (item.id && seenIds.has(item.id)) {
        console.warn(`⚠️ Duplicate item skipped in ${listKey}:`, item.id, item.title || "");
        continue;
      }
      if (item.id) seenIds.add(item.id);
      items.push(item);
    }

    pageToken = data.nextPageToken || null;
  } while (pageToken);

  console.log(`📄 ${listKey}: fetched ${pageCount} page(s), ${items.length} unique item(s)`);
  return items;
}

// ---------- Individual endpoint fetchers ----------
export async function fetchCourses() {
  return apiFetchAllPages(
    "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE",
    "courses"
  );
}

export async function fetchTopics(courseId) {
  return apiFetchAllPages(
    `https://classroom.googleapis.com/v1/courses/${courseId}/topics?`,
    "topic"
  );
}

export async function fetchCourseWork(courseId) {
  return apiFetchAllPages(
    `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork?`,
    "courseWork"
  );
}

export async function fetchCourseWorkMaterials(courseId) {
  return apiFetchAllPages(
    `https://classroom.googleapis.com/v1/courses/${courseId}/courseWorkMaterials?`,
    "courseWorkMaterial"
  );
}

export async function fetchRoster(courseId) {
  const [teachers, students] = await Promise.all([
    apiFetchAllPages(`https://classroom.googleapis.com/v1/courses/${courseId}/teachers?`, "teachers"),
    apiFetchAllPages(`https://classroom.googleapis.com/v1/courses/${courseId}/students?`, "students"),
  ]);
  return { teachers, students };
}

// ---------- Content grouping ----------
// Groups courseWork + courseWorkMaterials by their REAL Classroom topic —
// the exact same grouping Classroom shows on the Classwork page (Project,
// Solutions, Class Activities, Assignments, Quiz, Lectures, Books and
// outline, etc). We don't guess categories; we mirror Classroom's own
// structure, so the counts are guaranteed to match what's on the page.
export function groupContentByTopic(courseWork, courseWorkMaterials, topics) {
  const topicNameById = {};
  (topics || []).forEach((t) => { topicNameById[t.topicId] = t.name || "(unnamed topic)"; });

  const groups = {}; // topicName -> array of items
  const NO_TOPIC = "No topic";

  function addItem(item) {
    const topicName = item.topicId ? (topicNameById[item.topicId] || "(unknown topic)") : NO_TOPIC;
    if (!groups[topicName]) groups[topicName] = [];
    groups[topicName].push(item);
  }

  (courseWork || []).forEach(addItem);
  (courseWorkMaterials || []).forEach(addItem);

  return groups;
}

// ---------- Debug: print exact titles per topic group ----------
// Use this to compare against the real Classwork page item-by-item when
// counts look wrong. Open the service worker console (chrome://extensions
// → Inspect views: service worker) to see this output.
export function debugPrintGroups(groups) {
  console.log("──── TOPIC GROUPING DEBUG ────");
  Object.entries(groups).forEach(([topicName, items]) => {
    console.log(`\n${topicName} (${items.length}):`);
    items.forEach((item, i) => {
      console.log(`  ${i + 1}. "${item.title}" [workType: ${item.workType || "MATERIAL"}]`);
    });
  });
  console.log("───────────────────────────────");
}

// ---------- Cache read/write ----------
function getCacheKey(courseId) {
  return `classroomData_${courseId}`;
}

export function getCachedCourseData(courseId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(getCacheKey(courseId), (data) => {
      const entry = data[getCacheKey(courseId)];
      if (!entry) { resolve(null); return; }
      const age = Date.now() - entry.fetchedAt;
      resolve(age < CACHE_MAX_AGE_MS ? entry : null);
    });
  });
}

function setCachedCourseData(courseId, payload) {
  return new Promise((resolve) => {
    const entry = { ...payload, fetchedAt: Date.now() };
    chrome.storage.local.set({ [getCacheKey(courseId)]: entry }, () => resolve(entry));
  });
}

// ---------- Main entry point: sync everything for one course ----------
export async function syncCourseData(courseId, { force = false } = {}) {
  if (!force) {
    const cached = await getCachedCourseData(courseId);
    if (cached) {
      console.log(`📦 Using cached data for course ${courseId} (age ${Math.round((Date.now() - cached.fetchedAt) / 1000)}s)`);
      return cached;
    }
  }

  console.log(`🔄 Fetching fresh data for course ${courseId}...`);
  const [topics, courseWork, courseWorkMaterials, roster] = await Promise.all([
    fetchTopics(courseId),
    fetchCourseWork(courseId),
    fetchCourseWorkMaterials(courseId),
    fetchRoster(courseId),
  ]);

  const groups = groupContentByTopic(courseWork, courseWorkMaterials, topics);
  debugPrintGroups(groups);

  const payload = { courseId, topics, courseWork, courseWorkMaterials, roster, groups };
  const saved = await setCachedCourseData(courseId, payload);

  const totalItems = courseWork.length + courseWorkMaterials.length;
  console.log(`✅ Synced course ${courseId}: ${totalItems} total items across ${Object.keys(groups).length} topic groups`);
  Object.entries(groups).forEach(([name, items]) => console.log(`   ${name}: ${items.length}`));

  return saved;
}