// studyPlanner.js
// Deterministic scheduling logic for both modes. No LLM involved here —
// schedule math should be exact and predictable, not "creatively" generated.

const MAX_SESSION_MINUTES = 45;

function dateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function enumerateDays(startDate, endDate) {
  const days = [];
  let cur = dateOnly(startDate);
  const end = dateOnly(endDate);
  while (cur <= end) {
    days.push(new Date(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return days;
}

function formatDate(d) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function splitIntoChunks(task) {
  const chunks = [];
  let remaining = task.estimatedMinutes;
  let index = 1;
  const totalChunks = Math.ceil(remaining / MAX_SESSION_MINUTES);
  while (remaining > 0) {
    const minutes = Math.min(MAX_SESSION_MINUTES, remaining);
    chunks.push({
      title: task.title,
      courseName: task.courseName,
      difficultyScore: task.difficultyScore,
      dueDate: task.dueDate,
      chunkLabel: totalChunks > 1 ? `Part ${index}/${totalChunks}` : null,
      minutes,
    });
    remaining -= minutes;
    index++;
  }
  return chunks;
}

// ---------- Timetable mode: deadline-driven assignment completion ----------
// tasks: [{ title, courseName, dueDate (Date), estimatedMinutes, difficultyScore, typeLabel }]
// options: { startDate, endDate, hoursPerDay, priorityCourseName, preferenceTypes: [string,...] ordered }
export function buildSchedule(tasks, options) {
  const { startDate, endDate, hoursPerDay, priorityCourseName, preferenceTypes } = options;
  const minutesPerDay = Math.round(hoursPerDay * 60);
  const days = enumerateDays(startDate, endDate);
  const typeRank = (label) => {
    if (!preferenceTypes || preferenceTypes.length === 0) return 999;
    const idx = preferenceTypes.indexOf(label);
    return idx === -1 ? 999 : idx;
  };

  const sorted = [...tasks].sort((a, b) => {
    const aIsPrioritySubject = priorityCourseName && a.courseName === priorityCourseName;
    const bIsPrioritySubject = priorityCourseName && b.courseName === priorityCourseName;
    if (aIsPrioritySubject !== bIsPrioritySubject) return aIsPrioritySubject ? -1 : 1;

    const typeDiff = typeRank(a.typeLabel) - typeRank(b.typeLabel);
    if (typeDiff !== 0) return typeDiff;

    const dueDiff = a.dueDate - b.dueDate;
    if (dueDiff !== 0) return dueDiff;

    return (b.difficultyScore || 5) - (a.difficultyScore || 5);
  });

  const allChunks = sorted.flatMap(splitIntoChunks);

  const schedule = days.map((d) => ({ date: d, label: formatDate(d), minutesUsed: 0, sessions: [] }));
  const overflow = [];

  for (const chunk of allChunks) {
    const dueDateOnly = dateOnly(chunk.dueDate);
    let placed = false;

    for (const day of schedule) {
      if (day.date > dueDateOnly) break; // never schedule past the deadline
      if (day.minutesUsed + chunk.minutes <= minutesPerDay) {
        day.sessions.push(chunk);
        day.minutesUsed += chunk.minutes;
        placed = true;
        break;
      }
    }

    if (!placed) overflow.push(chunk);
  }

  return { schedule, overflow };
}

// ---------- Study Plan mode: subject/topic study (no deadlines) ----------
// subjects: [{ name, priority (1 = highest), topics: [string,...], weakTopics: [string,...] }]
// options: { startDate, endDate, hoursPerDay }
export function buildSubjectStudySchedule(subjects, options) {
  const { startDate, endDate, hoursPerDay } = options;
  const minutesPerDay = Math.round(hoursPerDay * 60);
  const days = enumerateDays(startDate, endDate);

  const maxPriority = Math.max(...subjects.map((s) => s.priority));
  const weighted = subjects.map((s) => ({ ...s, weight: maxPriority - s.priority + 2 }));
  const totalWeight = weighted.reduce((sum, s) => sum + s.weight, 0);
  const totalMinutesAvailable = days.length * minutesPerDay;

  const remainingChunks = {};
  weighted.forEach((s) => {
    // Weak topics appear twice in the rotation so they naturally get
    // roughly double the study time relative to topics the student already knows.
    const weakSet = new Set((s.weakTopics || []).map((t) => t.toLowerCase()));
    const topicPool = [];
    s.topics.forEach((t) => {
      topicPool.push(t);
      if (weakSet.has(t.toLowerCase())) topicPool.push(t);
    });

    const allocatedMinutes = Math.round(totalMinutesAvailable * (s.weight / totalWeight));
    const chunks = [];
    let remaining = allocatedMinutes;
    let topicIndex = 0;
    while (remaining > 0 && topicPool.length > 0) {
      const minutes = Math.min(MAX_SESSION_MINUTES, remaining);
      const topic = topicPool[topicIndex % topicPool.length];
      const isWeak = weakSet.has(topic.toLowerCase());
      chunks.push({
        title: isWeak ? `${topic} (weak spot)` : topic,
        courseName: s.name,
        minutes,
        difficultyScore: null,
        chunkLabel: null,
        dueDate: null,
      });
      remaining -= minutes;
      topicIndex++;
    }
    remainingChunks[s.name] = chunks;
  });

  // Interleave subjects by weight so higher-priority subjects appear more
  // often throughout the plan, rather than being front-loaded/back-loaded.
  const consumed = {};
  weighted.forEach((s) => { consumed[s.name] = 0; });
  const masterQueue = [];
  let anyLeft = true;
  while (anyLeft) {
    anyLeft = false;
    let best = null;
    for (const s of weighted) {
      if (remainingChunks[s.name].length === 0) continue;
      anyLeft = true;
      const ratio = consumed[s.name] / s.weight;
      if (!best || ratio < best.ratio) best = { name: s.name, ratio };
    }
    if (!best) break;
    const chunk = remainingChunks[best.name].shift();
    consumed[best.name] += chunk.minutes;
    masterQueue.push(chunk);
  }

  const schedule = days.map((d) => ({ date: d, label: formatDate(d), minutesUsed: 0, sessions: [] }));
  const overflow = [];

  for (const chunk of masterQueue) {
    let placed = false;
    for (const day of schedule) {
      if (day.minutesUsed + chunk.minutes <= minutesPerDay) {
        day.sessions.push(chunk);
        day.minutesUsed += chunk.minutes;
        placed = true;
        break;
      }
    }
    if (!placed) overflow.push(chunk);
  }


  return { schedule, overflow };
}