
const CACHE_MAX_AGE_MS = 15 * 60 * 1000; 

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
      if (item.id && seenIds.has(item.id)) {
        console.warn(` Duplicate item skipped in ${listKey}:`, item.id, item.title || "");
        continue;
      }
      if (item.id) seenIds.add(item.id);
      items.push(item);
    }

    pageToken = data.nextPageToken || null;
  } while (pageToken);

  console.log(` ${listKey}: fetched ${pageCount} page(s), ${items.length} unique item(s)`);
  return items;
}

export async function fetchCourses() {
  return apiFetchAllPages(
    "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE",
    "courses"
  );
}

export async function fetchAllCoursesAnyState() {
  return apiFetchAllPages(
    "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&courseStates=ARCHIVED",
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

export async function fetchAnnouncements(courseId) {
  return apiFetchAllPages(
    `https://classroom.googleapis.com/v1/courses/${courseId}/announcements?`,
    "announcements"
  );
}

export async function fetchRoster(courseId) {
  const [teachers, students] = await Promise.all([
    apiFetchAllPages(`https://classroom.googleapis.com/v1/courses/${courseId}/teachers?`, "teachers"),
    apiFetchAllPages(`https://classroom.googleapis.com/v1/courses/${courseId}/students?`, "students"),
  ]);
  return { teachers, students };
}

export async function fetchSubmissions(courseId, courseWorkId) {
  return apiFetchAllPages(
    `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions?`,
    "studentSubmissions"
  );
}

export function groupContentByTopic(courseWork, courseWorkMaterials, topics) {
  const topicNameById = {};
  (topics || []).forEach((t) => { topicNameById[t.topicId] = t.name || "(unnamed topic)"; });

  const groups = {};
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

function attachTeacherNames(announcements, teachers) {
  const nameById = {};
  (teachers || []).forEach((t) => {
    nameById[t.userId] = t.profile?.name?.fullName || "(unknown teacher)";
  });
  return (announcements || []).map((a) => ({
    ...a,
    creatorName: nameById[a.creatorUserId] || "(unknown teacher)",
  }));
}

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

export function getAllCachedCourses() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (allData) => {
      const courses = Object.entries(allData)
        .filter(([key]) => key.startsWith("classroomData_"))
        .map(([, value]) => value);
      resolve(courses);
    });
  });
}

function detectFileType(title, alternateLink) {
  if (/docs\.google\.com\/document\//.test(alternateLink || '')) return 'DOC';
  if (/docs\.google\.com\/presentation\//.test(alternateLink || '')) return 'PPTX';
  if (/docs\.google\.com\/spreadsheets\//.test(alternateLink || '')) return 'XLSX';
  if (/docs\.google\.com\/forms\//.test(alternateLink || '')) return 'FORM';

  const match = (title || '').match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toUpperCase() : 'FILE';
}

function extractFilesFromItem(item) {
  const files = [];
  (item.materials || []).forEach((m) => {
    const driveFile = m.driveFile && m.driveFile.driveFile;
    if (!driveFile || !driveFile.alternateLink) return;
    const fileType = detectFileType(driveFile.title, driveFile.alternateLink);
    files.push({
      id: `tg_file_${driveFile.id}`,
      title: driveFile.title || `Untitled ${fileType}`,
      url: driveFile.alternateLink,
      fileType,
      announcementUrl: item.alternateLink || null,
      announcementSnippet: item.title || (item.text ? item.text.slice(0, 120) : ''),
    });
  });
  return files;
}

async function syncFilesIntoClassFilesStore(courseId, courseWork, courseWorkMaterials, announcements) {
  const allItems = [...(courseWork || []), ...(courseWorkMaterials || []), ...(announcements || [])];
  const files = allItems.flatMap(extractFilesFromItem);
  const classId = btoa(courseId);

  await new Promise((resolve) => {
    chrome.storage.local.get("classFiles", (data) => {
      const classFiles = data.classFiles || {};
      classFiles[classId] = files;
      chrome.storage.local.set({ classFiles }, resolve);
    });
  });

  console.log(` Synced ${files.length} file attachment(s) into classFiles[${classId}] for course ${courseId}`);
  return files;
}

export async function syncCourseData(courseId, courseName, { force = false } = {}) {
  if (!force) {
    const cached = await getCachedCourseData(courseId);
    if (cached) {
      console.log(` Using cached data for course ${courseId} (age ${Math.round((Date.now() - cached.fetchedAt) / 1000)}s)`);
      return cached;
    }
  }

  console.log(` Fetching fresh data for course ${courseId}...`);
  const [topics, courseWork, courseWorkMaterials, roster, announcementsRaw] = await Promise.all([
    fetchTopics(courseId),
    fetchCourseWork(courseId),
    fetchCourseWorkMaterials(courseId),
    fetchRoster(courseId),
    fetchAnnouncements(courseId),
  ]);

  const submissionResults = await Promise.all(
    courseWork.map((cw) => fetchSubmissions(courseId, cw.id).catch(() => []))
  );
  courseWork.forEach((cw, i) => {
    const sub = submissionResults[i]?.[0]; 
    cw.submissionState = sub?.state || "UNKNOWN"; 
  });

  const announcements = attachTeacherNames(announcementsRaw, roster.teachers);

  const groups = groupContentByTopic(courseWork, courseWorkMaterials, topics);
  debugPrintGroups(groups);

  const payload = { courseId, courseName, topics, courseWork, courseWorkMaterials, roster, groups, announcements };
  const saved = await setCachedCourseData(courseId, payload);

  await syncFilesIntoClassFilesStore(courseId, courseWork, courseWorkMaterials, announcements);

  const totalItems = courseWork.length + courseWorkMaterials.length;
  console.log(` Synced course ${courseId} (${courseName}): ${totalItems} total items across ${Object.keys(groups).length} topic groups, ${announcements.length} announcements`);
  Object.entries(groups).forEach(([name, items]) => console.log(`   ${name}: ${items.length}`));

  return saved;
}