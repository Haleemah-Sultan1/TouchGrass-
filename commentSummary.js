

const BACKEND_URL = "https://touchgrass-backend.touchgrass.workers.dev";

function buildPrompt(comments) {
  const listText = comments
    .map((c, i) => `${i + 1}. [${c.role.toUpperCase()}] ${c.author}: ${c.text}`)
    .join("\n");

  return `Below is a chronological list of class comments on a Google Classroom assignment. Each line is tagged [TEACHER], [STUDENT], or [UNKNOWN] based on the commenter's role, followed by their name and comment text.

${listText}

Your job is to produce SHORT, GENUINELY CONDENSED summaries — not copies or close paraphrases of the original text. A student reading your output should understand the discussion WITHOUT needing to read the original comments at all. This is the entire point of the feature.


Instructions:
1. Identify each distinct student question or query. If the same question is asked by multiple students (even worded slightly differently), treat it as ONE query — don't repeat it.
2. For each query, write a SHORT summary (max ~12 words) of what was being asked, in your own words. Do NOT copy the student's wording verbatim or near-verbatim. Strip out filler, pleasantries, and restate only the core question.
3. Find the teacher's reply that answers each query, using the surrounding context and order (comments are not threaded, so infer the connection from content and timing).
4. For each reply, write a SHORT summary (max ~15 words) of the teacher's answer, in your own words. Do NOT copy the teacher's wording verbatim or near-verbatim — extract the actual instruction/decision/answer and state it plainly and briefly.
5. If a teacher's comment refers back to an earlier answer (e.g. "your query is already answered"), use a summary of that earlier teacher answer as the reply for the duplicate query too — never just repeat "already answered" with no actual content.
6. If NO teacher reply exists anywhere for a query, set teacherReply to exactly the string "Not answered yet" (this exact phrase, nothing else) and teacherName to null.
7. Do NOT include the student's name anywhere in your output — only the summarized query text itself.
8. Always include the teacher's name for any query that WAS answered.
9. Ignore comments that are not genuine questions (e.g. general remarks, acknowledgments) unless they contain an actual question.

Before finalizing each item, check: is my query text and reply text SHORTER than the original and phrased differently? If either one is basically the original sentence copied over, rewrite it to be a true summary instead.

Respond with ONLY a JSON object, no markdown formatting, no code fences, no extra text.
Format exactly like this:
{"queries": [{"query": "<short summary of the question, your own words, no names>", "teacherReply": "<short summary of the answer, your own words, or exactly 'Not answered yet'>", "teacherName": "<teacher's name, or null if unanswered>"}]}`;
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
