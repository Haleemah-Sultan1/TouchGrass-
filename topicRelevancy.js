// topicRelevancy.js
// Feature: for each QUESTION inside an assignment, identify which course
// topics it relates to, which specific concepts/skills are needed to
// solve it, and a difficulty rating — reading the ACTUAL attached PDF/Doc
// content, not just Classroom's (often empty) description field.

import { fetchMaterialsContent } from "./driveContent.js";

const BACKEND_URL = "https://touchgrass-backend.touchgrass.workers.dev";

export class NoTopicsError extends Error {
  constructor() {
    super("This course has no synced topics — provide a manual topic list.");
    this.name = "NoTopicsError";
  }
}

function buildInstructionText(item, topicNames, materials) {
  const title = item.title || "(untitled)";
  const description = item.description || "(no description text — see attached files)";
  const topicList = topicNames.map((t, i) => `${i + 1}. ${t}`).join("\n");

  const textMaterials = materials.filter((m) => m.type === "text");
  const attachedTextBlock = textMaterials.length
    ? textMaterials.map((m) => `--- Attached file: "${m.name}" ---\n${m.text}`).join("\n\n")
    : "";

  const fileNote = materials.some((m) => m.type === "file")
    ? `\n(Additional attached files are included below as raw documents — read them directly for the actual question content.)`
    : "";

  return `You are helping a student break down an assignment question by question, using the FULL real content — including any attached documents — not just the short description.

Assignment title: "${title}"
Classroom description field: "${description}"
${attachedTextBlock}${fileNote}

Available course topics (use EXACT text from this list when tagging a topic):
${topicList}

Instructions:
1. Read through the ENTIRE assignment content, including attached documents. Identify each distinct question or part (Q1, Q2, part a/b, separate numbered/bulleted problems, etc). Only treat it as one single question if there is genuinely no way to split it into parts.
2. For EACH question separately, list which of the available course topics it relates to (zero, one, or several).
3. For EACH question separately, list the specific CONCEPTS or skills needed to solve it (not limited to the topic list — be specific, e.g. "binary search", "base case recursion", "SQL JOIN").
4. For EACH question separately, give a difficulty score from 1 to 10 (1 = trivial, 10 = extremely hard).
5. Give a one-sentence reasoning per question.

Respond with ONLY a JSON object, no markdown formatting, no code fences, no extra text.
Format exactly like this:
{"questions": [{"questionLabel": "<e.g. Q1>", "questionSummary": "<short phrase>", "relevantTopics": ["<exact topic name>"], "concepts": ["<concept 1>", "<concept 2>"], "difficultyScore": <integer 1-10>, "reasoning": "<one sentence>"}]}`;
}

function parseTopicResponse(rawText, validTopicNames) {
  const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Could not parse LLM response as JSON: ${rawText}`);
  }

  const validSet = new Set(validTopicNames);
  const questions = (parsed.questions || []).map((q) => ({
    questionLabel: q.questionLabel || "Question",
    questionSummary: q.questionSummary || "",
    relevantTopics: (q.relevantTopics || []).filter((t) => validSet.has(t)),
    concepts: q.concepts || [],
    difficultyScore: Math.max(1, Math.min(10, Math.round(q.difficultyScore || 5))),
    reasoning: q.reasoning || "",
  }));

  return { questions };
}

export async function analyzeTopicRelevance(item, topics) {
  if (!topics || topics.length === 0) throw new NoTopicsError();

  const topicNames = topics.map((t) => t.name);
  const materials = await fetchMaterialsContent(item);

  const instructionText = buildInstructionText(item, topicNames, materials);

  // Build multi-part payload: instruction text + any raw files (PDFs/images)
  // for Gemini to read natively.
  const parts = [{ text: instructionText }];
  materials
    .filter((m) => m.type === "file")
    .forEach((m) => parts.push({ inlineData: { mimeType: m.mimeType, data: m.base64 } }));

  const res = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parts }),
  });

  if (!res.ok) throw new Error(`Backend error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Backend returned an error");

  return parseTopicResponse(data.result, topicNames);
}

export function saveManualTopics(courseId, topicsCsv) {
  const names = topicsCsv.split(",").map((t) => t.trim()).filter(Boolean);
  const fakeTopics = names.map((name, i) => ({ topicId: `manual-${i}`, name }));
  return new Promise((resolve) => {
    chrome.storage.local.set({ [`manualTopics_${courseId}`]: fakeTopics }, () => resolve(fakeTopics));
  });
}

export function getManualTopics(courseId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(`manualTopics_${courseId}`, (data) => {
      resolve(data[`manualTopics_${courseId}`] || null);
    });
  });
}