document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('files-tbody');
  const selectAll = document.getElementById('select-all');
  const openSelectedBtn = document.getElementById('open-selected');
  const downloadSelectedBtn = document.getElementById('download-selected');
  const countEl = document.getElementById('file-count');

  let currentFiles = [];

  function getClassIdFromQuery() {
    return new URLSearchParams(location.search).get('classId');
  }

  function loadFiles() {
    const classId = getClassIdFromQuery();
    if (classId) { fetchAndRender(classId); return; }

    // Fallback if opened without a classId in the URL: use whatever
    // Classroom tab is currently open.
    chrome.tabs.query({ url: "https://classroom.google.com/*" }, (tabs) => {
      const match = (tabs[0]?.url || '').match(/\/(c|r)\/([^\/]+)/);
      fetchAndRender(match ? match[2] : null);
    });
  }

  function fetchAndRender(classId) {
    if (!classId) { renderEmpty("Couldn't determine which class to show files for."); return; }
    chrome.storage.local.get("classFiles", (data) => {
      currentFiles = (data.classFiles || {})[classId] || [];
      render();
    });
  }

  function renderEmpty(msg) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty">${msg}</td></tr>`;
    countEl.textContent = '';
  }

  function render() {
    countEl.textContent = currentFiles.length ? `${currentFiles.length} file(s)` : '';
    if (!currentFiles.length) {
      renderEmpty('No PDF attachments found yet. Open the class stream, let it finish loading, then reopen this page.');
      return;
    }
    tbody.innerHTML = '';
    currentFiles.forEach(file => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" class="file-check" data-id="${file.id}"></td>
        <td class="file-title">${escapeHtml(file.title)}</td>
        <td class="file-context">${escapeHtml(file.announcementSnippet || '')}</td>
        <td class="file-actions">
          <button class="open-btn">Open</button>
          ${file.announcementUrl ? `<button class="ann-btn">Open in Announcement</button>` : ''}
        </td>
      `;
      tr.querySelector('.file-title').addEventListener('click', () => window.open(file.url, '_blank'));
      tr.querySelector('.open-btn').addEventListener('click', () => window.open(file.url, '_blank'));
      const annBtn = tr.querySelector('.ann-btn');
      if (annBtn) annBtn.addEventListener('click', () => window.open(file.announcementUrl, '_blank'));
      tbody.appendChild(tr);
    });
  }

  function getSelectedFiles() {
    const ids = Array.from(document.querySelectorAll('.file-check:checked')).map(cb => cb.dataset.id);
    return currentFiles.filter(f => ids.includes(f.id));
  }

  selectAll.addEventListener('change', () => {
    document.querySelectorAll('.file-check').forEach(cb => cb.checked = selectAll.checked);
  });

  openSelectedBtn.addEventListener('click', () => {
    const selected = getSelectedFiles();
    if (!selected.length) { alert('Select at least one file first.'); return; }
    selected.forEach(f => window.open(f.url, '_blank'));
  });

  downloadSelectedBtn.addEventListener('click', () => {
    const selected = getSelectedFiles();
    if (!selected.length) { alert('Select at least one file first.'); return; }
    selected.forEach(f => {
      chrome.downloads.download({
        url: toDriveDownloadUrl(f.url),
        filename: sanitizeFilename(f.title),
      });
    });
  });

  // A Drive "view" link opens the viewer, not a raw download — this
  // converts it to Drive's direct-download endpoint instead.
  function toDriveDownloadUrl(url) {
    const match = url.match(/\/file\/d\/([^\/]+)/) || url.match(/[?&]id=([^&]+)/);
    const fileId = match ? match[1] : null;
    return fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : url;
  }

  function sanitizeFilename(name) {
    return (name || 'file.pdf').replace(/[\\/:*?"<>|]/g, '_');
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  loadFiles();
});