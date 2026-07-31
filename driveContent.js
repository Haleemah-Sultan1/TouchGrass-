// driveContent.js
// Fetches the ACTUAL content of Classroom attachments (Google Docs/Slides
// text, or raw PDF/image bytes) so the AI reads real assignment content
// instead of relying on Classroom's often-empty description field.

import { getAuthToken, clearCachedToken } from "./classroomapi.js";

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const GOOGLE_SLIDES_MIME = "application/vnd.google-apps.presentation";
const MAX_FILES = 3; // cap to keep requests/costs reasonable

async function driveFetch(url) {
  let token = await getAuthToken(true);
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 401) {
    await clearCachedToken(token);
    token = await getAuthToken(true);
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }

  if (!res.ok) throw new Error(`Drive API error ${res.status}: ${await res.text()}`);
  return res;
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Returns { type: "text", name, text } for Docs/Slides,
// or { type: "file", name, mimeType, base64 } for PDFs/images/etc.
async function fetchOneFile(fileId) {
  const metaRes = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`);
  const meta = await metaRes.json();

  if (meta.mimeType === GOOGLE_DOC_MIME || meta.mimeType === GOOGLE_SLIDES_MIME) {
    const exportRes = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`);
    const text = await exportRes.text();
    return { type: "text", name: meta.name, text };
  }

  const fileRes = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  const buffer = await fileRes.arrayBuffer();
  return { type: "file", name: meta.name, mimeType: meta.mimeType, base64: arrayBufferToBase64(buffer) };
}

// Fetches content for Drive-backed materials on a courseWork item.
// Skips non-Drive materials (plain links, YouTube embeds) for now.
export async function fetchMaterialsContent(item) {
  const driveMaterials = (item.materials || [])
    .filter((m) => m.driveFile?.driveFile?.id)
    .slice(0, MAX_FILES);

  const results = [];
  for (const m of driveMaterials) {
    try {
      results.push(await fetchOneFile(m.driveFile.driveFile.id));
    } catch (err) {
      console.warn("Skipping a material, couldn't fetch it:", err.message);
    }
  }
  return results;
}