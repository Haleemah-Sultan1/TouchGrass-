// difficulty.js
// Feature: assignment difficulty + time estimation.
// Sends assignment text to our Cloudflare Worker backend, which calls
// Gemini and returns a raw score/time/reasoning. We map the score to a
// Gen Z-flavored label ourselves, so the humor is consistent and doesn't
// depend on the model staying "in character."

const BACKEND_URL = "https://touchgrass-backend.touchgrass.workers.dev";

// ---------- Score -> slang label (edit this list anytime, no AI involved) ----------
const DIFFICULTY_LABELS = [
  { max: 2, label: "free real estate 🍰", vibe: "easy" },
  { max: 4, label: "easy money 💰", vibe: "easy" },
  { max: 6, label: "mid, we ball 😐", vibe: "medium" },
  { max: 8, label: "kinda cooked 🔥", vibe: "hard" },
  { max: 10, label: "absolutely cooked 💀", vibe: "hard" },
];

export function difficultyLabelForScore(score) {
  const match = DIFFICULTY_LABELS.find((d) => score <= d.max);
  return match ? match.label : "unrated";
}

// ---------- Prompt building ----------
function buildDifficultyPrompt(item, topicName) {
  const title = item.title || "(untitled)";
  const description = item.description || "(no description provided)";

  return `You are helping a student estimate how hard an assignment is and how long it will take.

Assignment title: "${title}"
Topic: "${topicName || "unknown"}"
Description: "${description}"

Respond with ONLY a JSON object, no markdown formatting, no code fences, no extra text.
Format exactly like this:
{"difficultyScore": <integer 1-10, where 1 is trivial and 10 is extremely hard>, "estimatedMinutes": <integer, realistic time for an average student>, "reasoning": "<one short sentence explaining why>"}`;
}

// ---------- Parsing the LLM's raw text into a safe object ----------
function parseDifficultyResponse(rawText) {
  // Gemini sometimes wraps JSON in ```json ... ``` even when told not to.
  // Strip that defensively before parsing.
  const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Could not parse LLM response as JSON: ${rawText}`);
  }

  const score = Math.max(1, Math.min(10, Math.round(parsed.difficultyScore)));
  const minutes = Math.max(1, Math.round(parsed.estimatedMinutes));

  return {
    difficultyScore: score,
    difficultyLabel: difficultyLabelForScore(score),
    estimatedMinutes: minutes,
    reasoning: parsed.reasoning || "",
  };
}

// ---------- Main entry point ----------
export async function estimateDifficulty(item, topicName) {
  const prompt = buildDifficultyPrompt(item, topicName);

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

  return parseDifficultyResponse(data.result);
}