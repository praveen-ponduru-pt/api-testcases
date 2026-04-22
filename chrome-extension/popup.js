let allRequests = [];
let selectedIndices = new Set();
let filterText = '';

function init() {
  chrome.storage.local.get({ capturedRequests: [] }, (data) => {
    allRequests = data.capturedRequests;
    renderList();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.capturedRequests) {
      allRequests = changes.capturedRequests.newValue || [];
      for (const idx of selectedIndices) {
        if (idx >= allRequests.length) selectedIndices.delete(idx);
      }
      renderList();
    }
  });

  document.getElementById('filter-input').addEventListener('input', (e) => {
    filterText = e.target.value;
    renderList();
  });

  document.getElementById('clear-btn').addEventListener('click', () => {
    chrome.storage.local.set({ capturedRequests: [] });
    allRequests = [];
    selectedIndices.clear();
    renderList();
  });

  document.getElementById('send-btn').addEventListener('click', sendToVSCode);
}

function getFiltered() {
  if (!filterText) return allRequests.map((r, i) => ({ req: r, origIdx: i }));
  const q = filterText.toLowerCase();
  return allRequests
    .map((r, i) => ({ req: r, origIdx: i }))
    .filter(({ req }) => req.url.toLowerCase().includes(q));
}

function renderList() {
  const list = document.getElementById('request-list');
  const filtered = getFiltered();

  document.getElementById('status').textContent =
    `${allRequests.length} captured`;

  if (allRequests.length === 0) {
    list.innerHTML = `<div id="empty-state">
      <strong>No requests captured yet</strong>
      Open DevTools (F12), go to the API Capture tab,
      then browse your app to capture API calls.
    </div>`;
    updateFooter();
    return;
  }

  list.innerHTML = '';
  filtered.forEach(({ req, origIdx }) => {
    const row = document.createElement('div');
    row.className = 'request-row' + (selectedIndices.has(origIdx) ? ' selected' : '');
    row.title = req.url;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedIndices.has(origIdx);
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      toggle(origIdx, cb.checked);
    });

    const method = document.createElement('span');
    method.className = `method ${req.method}`;
    method.textContent = req.method;

    const url = document.createElement('span');
    url.className = 'url';
    try {
      const u = new URL(req.url);
      url.textContent = u.pathname + u.search;
    } catch {
      url.textContent = req.url;
    }

    const statusEl = document.createElement('span');
    statusEl.className = 'status-code';
    statusEl.textContent = req.responseStatus || '';

    row.appendChild(cb);
    row.appendChild(method);
    row.appendChild(url);
    row.appendChild(statusEl);

    row.addEventListener('click', (e) => {
      if (e.target === cb) return;
      toggle(origIdx, !selectedIndices.has(origIdx));
      cb.checked = selectedIndices.has(origIdx);
    });

    list.appendChild(row);
  });

  updateFooter();
}

function toggle(idx, checked) {
  if (checked) {
    selectedIndices.add(idx);
  } else {
    selectedIndices.delete(idx);
  }
  renderList();
}

function updateFooter() {
  const n = selectedIndices.size;
  document.getElementById('selection-info').textContent =
    n === 0 ? 'Select endpoints to send' : `${n} endpoint${n === 1 ? '' : 's'} selected`;
  document.getElementById('send-btn').disabled = n === 0;
}

async function sendToVSCode() {
  const selected = [...selectedIndices].map((idx) => allRequests[idx]);
  const payload = buildPayload(selected);

  const btn = document.getElementById('send-btn');
  const btnText = document.getElementById('send-btn-text');
  btnText.textContent = 'Sending…';
  btn.disabled = true;
  btn.className = '';

  try {
    const res = await fetch(`http://localhost:${VSCODE_PORT}/endpoints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      btnText.textContent = 'Sent!';
      btn.className = 'success';
      selectedIndices.clear();
      setTimeout(() => {
        btnText.textContent = 'Send to VS Code';
        btn.className = '';
        btn.disabled = true;
        updateFooter();
      }, 2000);
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch {
    btnText.textContent = 'VS Code not running?';
    btn.className = 'error';
    setTimeout(() => {
      btnText.textContent = 'Send to VS Code';
      btn.className = '';
      btn.disabled = false;
    }, 3000);
  }
}

init();
