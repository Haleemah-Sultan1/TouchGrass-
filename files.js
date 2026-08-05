document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('files-tbody');
  const selectAll = document.getElementById('select-all');
  const openSelectedBtn = document.getElementById('open-selected');
  const downloadSelectedBtn = document.getElementById('download-selected');
  const countEl = document.getElementById('file-count');
  const searchBox = document.getElementById('search-box');
  const typeFiltersEl = document.getElementById('type-filters');

  let currentFiles = [];
  let activeType = 'all';   // 'all' or a specific fileType like 'PDF'
  let searchQuery = '';

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
      activeType = 'all';
      searchQuery = '';
      if (searchBox) searchBox.value = '';
      renderTypeFilters();
      render();
    });
  }

  // Builds the "All / PDF / PPTX / PNG / ..." pill row from whatever
  // types are actually present in this class's files - no fixed list to
  // maintain, it just reflects whatever got synced.
  function renderTypeFilters() {
    if (!typeFiltersEl) return;
    if (!currentFiles.length) { typeFiltersEl.innerHTML = ''; return; }

    const counts = {};
    currentFiles.forEach(f => {
      const t = f.fileType || 'FILE';
      counts[t] = (counts[t] || 0) + 1;
    });
    const types = Object.keys(counts).sort();

    const pills = [{ label: `All (${currentFiles.length})`, value: 'all' },
      ...types.map(t => ({ label: `${t} (${counts[t]})`, value: t }))];

    typeFiltersEl.innerHTML = '';
    pills.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'type-filter-btn' + (activeType === p.value ? ' active' : '');
      btn.textContent = p.label;
      btn.addEventListener('click', () => {
        activeType = p.value;
        renderTypeFilters();
        render();
      });
      typeFiltersEl.appendChild(btn);
    });
  }

  function getFilteredFiles() {
    const q = searchQuery.trim().toLowerCase();
    return currentFiles.filter(f => {
      if (activeType !== 'all' && (f.fileType || 'FILE') !== activeType) return false;
      if (!q) return true;
      const haystack = `${f.title || ''} ${f.announcementSnippet || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  function renderEmpty(msg) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">${msg}</td></tr>`;
    countEl.textContent = '';
  }

  function render() {
    if (!currentFiles.length) {
      countEl.textContent = '';
      renderEmpty('No files found yet. Open the class stream, let it finish loading, then reopen this page — or sync a course from the popup to pull in everything at once.');
      return;
    }

    const filtered = getFilteredFiles();
    countEl.textContent = `${filtered.length} of ${currentFiles.length} file(s)`;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty">No files match your current filter/search.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    filtered.forEach(file => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" class="file-check" data-id="${file.id}"></td>
        <td>${escapeHtml(file.fileType || 'FILE')}</td>
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

  if (searchBox) {
    searchBox.addEventListener('input', () => {
      searchQuery = searchBox.value;
      selectAll.checked = false;
      render();
    });
  }

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
    return (name || 'attachment').replace(/[\\/:*?"<>|]/g, '_');
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  loadFiles();
});