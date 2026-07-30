// studyPlanner.js
// Deterministic scheduling logic. Takes a task list + student availability
// and produces a day-by-day plan. No LLM involved here — schedule math
// should be exact and predictable, not "creatively" generated.

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

// Splits one task's total estimated minutes into <=45-min chunks.
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

// tasks: [{ title, courseName, dueDate (Date), estimatedMinutes, difficultyScore }]
// options: { startDate, endDate, hoursPerDay, priorityCourseName, priorityTaskTitle }
export function buildSchedule(tasks, options) {
  const { startDate, endDate, hoursPerDay, priorityCourseName, priorityTaskTitle } = options;
  const minutesPerDay = Math.round(hoursPerDay * 60);
  const days = enumerateDays(startDate, endDate);

  const sorted = [...tasks].sort((a, b) => {
    const aIsPriorityTask = priorityTaskTitle && a.title === priorityTaskTitle;
    const bIsPriorityTask = priorityTaskTitle && b.title === priorityTaskTitle;
    if (aIsPriorityTask !== bIsPriorityTask) return aIsPriorityTask ? -1 : 1;

    const aIsPrioritySubject = priorityCourseName && a.courseName === priorityCourseName;
    const bIsPrioritySubject = priorityCourseName && b.courseName === priorityCourseName;
    if (aIsPrioritySubject !== bIsPrioritySubject) return aIsPrioritySubject ? -1 : 1;

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
      if (day.date > dueDateOnly) break; // don't schedule past the deadline
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

// ---------- Mode B: subject/topic study plan (exam prep, no deadlines) ----------
// subjects: [{ name, priority (1 = highest), topics: [string, ...] }]
// options: { startDate, endDate, hoursPerDay }
export function buildSubjectStudySchedule(subjects, options) {
  const { startDate, endDate, hoursPerDay } = options;
  const minutesPerDay = Math.round(hoursPerDay * 60);
  const days = enumerateDays(startDate, endDate);

  // Lower priority number = more weight. +2 avoids a weight of 0 for the lowest-ranked subject.
  const maxPriority = Math.max(...subjects.map((s) => s.priority));
  const weighted = subjects.map((s) => ({ ...s, weight: maxPriority - s.priority + 2 }));
  const totalWeight = weighted.reduce((sum, s) => sum + s.weight, 0);
  const totalMinutesAvailable = days.length * minutesPerDay;

  // Build each subject's chunk queue, cycling through its topics until its
  // proportional share of total time is used up.
  const remainingChunks = {};
  weighted.forEach((s) => {
    const allocatedMinutes = Math.round(totalMinutesAvailable * (s.weight / totalWeight));
    const chunks = [];
    let remaining = allocatedMinutes;
    let topicIndex = 0;
    while (remaining > 0 && s.topics.length > 0) {
      const minutes = Math.min(MAX_SESSION_MINUTES, remaining);
      chunks.push({ title: s.topics[topicIndex % s.topics.length], courseName: s.name, minutes, difficultyScore: null, chunkLabel: null, dueDate: null });
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