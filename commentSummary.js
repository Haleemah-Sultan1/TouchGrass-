// commentSummary.js
// Feature: summarize class-comment threads into clean query/reply pairs.
// Comments arrive as a flat chronological list (Classroom's class comments
// aren't visually threaded), so the LLM infers which teacher reply answers
// which student query from content + order, not from DOM nesting.

const BACKEND_URL = "https://touchgrass-backend.touchgrass.workers.dev";

function buildPrompt(comments) {
  const listText = comments
    .map((c, i) => `${i + 1}. [${c.role.toUpperCase()}] ${c.author}: ${c.text}`)
    .join("\n");

  return `Below is a chronological list of class comments on a Google Classroom assignment. Each line is tagged [TEACHER], [STUDENT], or [UNKNOWN] based on the commenter's role, followed by their name and comment text.

${listText}

Instructions:
1. Identify each distinct student question or query. If the same question is asked by multiple students (even worded slightly differently), treat it as ONE query — don't repeat it.
2. For each query, find the teacher's reply that answers it, using the surrounding context and order (comments are not threaded, so infer the connection from content and timing).
3. If a teacher's comment refers back to an earlier answer (e.g. "your query is already answered"), use that earlier teacher answer as the reply for the duplicate query too.
4. If NO teacher reply exists anywhere for a query, set teacherReply to exactly the string "Not answered yet" (this exact phrase, nothing else) and teacherName to null.
5. Do NOT include the student's name anywhere in your output — only the query text itself.
6. Always include the teacher's name for any query that WAS answered.
7. Ignore comments that are not genuine questions (e.g. general remarks, acknowledgments) unless they contain an actual question.

Respond with ONLY a JSON object, no markdown formatting, no code fences, no extra text.
Format exactly like this:
{"queries": [{"query": "<the student's question, no names>", "teacherReply": "<the teacher's answer, or exactly 'Not answered yet'>", "teacherName": "<teacher's name, or null if unanswered>"}]}`;
}

function parseResponse(rawText) {
  const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Could not parse LLM response as JSON: ${rawText}`);
  }

  const queries = (parsed.queries || []).map((q) => ({
    query: q.query || "",
    teacherReply: q.teacherReply || "Not answered yet",
    teacherName: q.teacherReply && !/not answered yet/i.test(q.teacherReply) ? (q.teacherName || null) : null,
  }));

  return queries;
}

export async function summarizeComments(comments) {
  if (!comments || comments.length === 0) {
    return [];
  }

  const prompt = buildPrompt(comments);

  const res = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Backend error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || "Backend returned an error");
  }

  return parseResponse(data.result);
}