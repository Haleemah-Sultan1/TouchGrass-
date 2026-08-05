// submissionChecker.js
// Feature: student pastes an assignment's instructions text. AI extracts
// (1) a general pre-submission checklist and (2) a file-naming convention
// as both a plain description AND a regex pattern, so we can validate
// actual uploaded file names locally without another AI call per file.

const BACKEND_URL = "https://touchgrass-backend.touchgrass.workers.dev";

function buildChecklistPrompt(instructionsText) {
  return `You are helping a student make sure they've followed an assignment's instructions exactly before submitting.

Assignment instructions (pasted by the student):
"""
${instructionsText}
"""

Instructions:
1. Read through the text and extract a checklist of concrete, checkable requirements (formatting, sections required, word/page count, submission format, deadlines mentioned, anything explicit the student must do). Skip vague/non-checkable statements.
2. Separately, look for any FILE NAMING requirement (e.g. "name your file as FirstName_LastName_Assignment1.pdf"). If one exists:
   - Write a short human description of it.
   - Give ONE concrete example filename that would be valid (use placeholder values like "John_Doe" if the real name is unknown).
   - Give a JavaScript-compatible regex pattern (as a plain string, no slashes, no flags) that would match a correctly-named file. Escape underscores and dots properly for regex.
   If there is NO explicit naming convention mentioned, set namingConvention to null.

Respond with ONLY a JSON object, no markdown formatting, no code fences, no extra text.
Format exactly like this:
{"checklistItems": ["<requirement 1>", "<requirement 2>"], "namingConvention": {"description": "<plain description>", "example": "<example filename>", "regexPattern": "<regex string, no slashes>"} }
(namingConvention must be null, not an object, if nothing was found)`;
}

function parseChecklistResponse(rawText) {
  const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Could not parse LLM response as JSON: ${rawText}`);
  }

  const checklistItems = Array.isArray(parsed.checklistItems)
    ? parsed.checklistItems.filter((x) => typeof x === "string" && x.trim())
    : [];

  let namingConvention = null;
  if (parsed.namingConvention && parsed.namingConvention.regexPattern) {
    // Sanity-check the regex compiles before we ever hand it to the UI —
    // a broken pattern from the model should fail loudly here, not later
    // when the student tries to check a file.
    try {
      new RegExp(parsed.namingConvention.regexPattern);
      namingConvention = {
        description: parsed.namingConvention.description || "",
        example: parsed.namingConvention.example || "",
        regexPattern: parsed.namingConvention.regexPattern,
      };
    } catch (err) {
      console.warn("Model returned an invalid regex, dropping naming convention:", err.message);
    }
  }

  return { checklistItems, namingConvention };
}

export async function extractChecklist(instructionsText) {
  if (!instructionsText || !instructionsText.trim()) {
    throw new Error("Paste the assignment instructions first.");
  }

  const prompt = buildChecklistPrompt(instructionsText);

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

  return parseChecklistResponse(data.result);
}

// Pure local check — no network call. Runs against the File objects the
// student picks in the <input type="file"> on the checklist page.
export function checkFileNames(files, namingConvention) {
  if (!namingConvention) return [];
  let regex;
  try {
    regex = new RegExp(`^${namingConvention.regexPattern}$`);
  } catch (err) {
    return files.map((f) => ({ name: f.name, valid: false, error: "Invalid pattern" }));
  }
  return files.map((f) => ({ name: f.name, valid: regex.test(f.name) }));
}