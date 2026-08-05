import { checkFileNames, verifyChecklistAgainstFiles } from "./submissionChecker.js";

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
        currentChecklistItems = resp.result.checklistItems; // add this line
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

const verifyBtn = document.getElementById("verifyBtn");
const verifyStatus = document.getElementById("verifyStatus");
const verifyResults = document.getElementById("verifyResults");

let currentChecklistItems = [];

const TEXT_EXTENSIONS = [".cpp", ".c", ".h", ".hpp", ".py", ".js", ".java", ".cs", ".txt", ".md"];

function isTextFile(file) {
  return TEXT_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]); // strip data: prefix
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function renderVerifyResults(results) {
  verifyResults.innerHTML = "";
  results.forEach((r, i) => {
    const icon = r.status === "met" ? "✅" : r.status === "not_met" ? "❌" : "❓";
    const row = document.createElement("div");
    row.style.marginBottom = "6px";
    row.innerHTML = `
      <label>
        <input type="checkbox" id="verify-chk-${i}" ${r.status === "met" ? "checked" : ""} />
        ${icon} ${r.item}
      </label>
      <div style="font-size:12px; color:#666; margin-left:24px;">${r.reason}</div>
    `;
    verifyResults.appendChild(row);
  });
}

verifyBtn.addEventListener("click", async () => {
  if (currentChecklistItems.length === 0) {
    verifyStatus.textContent = "Extract a checklist first.";
    return;
  }
  const files = Array.from(fileInput.files);
  if (files.length === 0) {
    verifyStatus.textContent = "Choose your submission files first (above).";
    return;
  }

  verifyStatus.textContent = "Reading your files and checking them against the checklist...";
  verifyResults.innerHTML = "";

  try {
    const textFileBlocks = [];
    const binaryFileParts = [];

    for (const file of files) {
      if (isTextFile(file)) {
        const text = await readAsText(file);
        textFileBlocks.push({ name: file.name, text });
      } else {
        const base64 = await readAsBase64(file);
        binaryFileParts.push({ mimeType: file.type || "application/octet-stream", base64 });
      }
    }

    chrome.runtime.sendMessage(
      { type: "VERIFY_CHECKLIST", checklistItems: currentChecklistItems, textFileBlocks, binaryFileParts },
      (resp) => {
        if (chrome.runtime.lastError) {
          verifyStatus.textContent = `Error: ${chrome.runtime.lastError.message}`;
          return;
        }
        if (resp.ok) {
          verifyStatus.textContent = `Done — review the suggestions below, override anything that looks wrong.`;
          renderVerifyResults(resp.results);
        } else {
          verifyStatus.textContent = `❌ Failed: ${resp.error}`;
        }
      }
    );
  } catch (err) {
    verifyStatus.textContent = `Error reading files: ${err.message}`;
  }
});
