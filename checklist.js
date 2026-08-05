import { checkFileNames } from "./submissionChecker.js";

const instructionsInput = document.getElementById("instructionsInput");
const extractBtn = document.getElementById("extractBtn");
const extractStatus = document.getElementById("extractStatus");
const checklistBox = document.getElementById("checklistBox");
const fileInput = document.getElementById("fileInput");
const fileCheckResult = document.getElementById("fileCheckResult");

let currentNamingConvention = null;

function renderChecklist(checklistItems, namingConvention) {
  checklistBox.innerHTML = "";

  checklistItems.forEach((item, i) => {
    const row = document.createElement("label");
    row.style.display = "block";
    row.innerHTML = `<input type="checkbox" id="chk${i}" /> ${item}`;
    checklistBox.appendChild(row);
  });

  if (namingConvention) {
    const box = document.createElement("div");
    box.innerHTML = `
      <p><strong>File naming convention detected:</strong> ${namingConvention.description}</p>
      <p><em>Example:</em> ${namingConvention.example}</p>
    `;
    checklistBox.appendChild(box);
  } else {
    const box = document.createElement("p");
    box.textContent = "No specific file naming convention was mentioned in the instructions.";
    checklistBox.appendChild(box);
  }
}

extractBtn.addEventListener("click", () => {
  const text = instructionsInput.value.trim();
  if (!text) {
    extractStatus.textContent = "Paste the instructions first.";
    return;
  }
  extractStatus.textContent = "Reading instructions and building your checklist...";
  checklistBox.innerHTML = "";

  chrome.runtime.sendMessage({ type: "EXTRACT_CHECKLIST", instructionsText: text }, (resp) => {
    if (chrome.runtime.lastError) {
      extractStatus.textContent = `Error: ${chrome.runtime.lastError.message}`;
      return;
    }
    if (resp.ok) {
      extractStatus.textContent = `✅ ${resp.result.checklistItems.length} checklist item(s) found`;
      currentNamingConvention = resp.result.namingConvention;
      renderChecklist(resp.result.checklistItems, resp.result.namingConvention);
    } else {
      extractStatus.textContent = `❌ Failed: ${resp.error}`;
    }
  });
});

fileInput.addEventListener("change", () => {
  fileCheckResult.innerHTML = "";
  const files = Array.from(fileInput.files);
  if (files.length === 0) return;

  if (!currentNamingConvention) {
    fileCheckResult.textContent = "Extract a checklist with a naming convention first.";
    return;
  }

  const results = checkFileNames(files, currentNamingConvention);
  results.forEach((r) => {
    const row = document.createElement("div");
    row.textContent = r.valid ? `✅ ${r.name}` : `❌ ${r.name} — doesn't match the convention`;
    fileCheckResult.appendChild(row);
  });
});