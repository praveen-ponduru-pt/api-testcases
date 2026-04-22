const MAX_SELECT = 10;

let allRequests = [];
let selectedIndices = new Set();
let filterText = '';

// Load initial requests from storage (same source as popup)
chrome.storage.local.get({ capturedRequests: [] }, function (data) {
  allRequests = data.capturedRequests || [];
  renderList();
});

// Real-time updates whenever devtools.js writes new captures to storage
chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== 'local' || !changes.capturedRequests) return;
  allRequests = changes.capturedRequests.newValue || [];
  // Drop any selected indices that no longer exist
  for (const idx of selectedIndices) {
    if (idx >= allRequests.length) selectedIndices.delete(idx);
  }
  renderList();
});

function getFiltered() {
  const lower = filterText.toLowerCase();
  return allRequests
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !filterText || (r.url && r.url.toLowerCase().includes(lower)));
}

function renderList() {
  const list = document.getElementById('request-list');
  const filtered = getFiltered();

  if (allRequests.length === 0) {
    list.innerHTML = '<div id="empty-state">Browse your app — API requests will appear here.<br><br>If requests are not showing, click Refresh.</div>';
    updateStatus();
    return;
  }

  if (filtered.length === 0) {
    list.innerHTML = `<div id="empty-state">No requests match "${filterText}"</div>`;
    updateStatus();
    return;
  }

  list.innerHTML = '';
  filtered.forEach(({ r: req, i: idx }) => {
    const row = document.createElement('div');
    row.className = 'request-row' + (selectedIndices.has(idx) ? ' selected' : '');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedIndices.has(idx);
    cb.disabled = !cb.checked && selectedIndices.size >= MAX_SELECT;

    const method = document.createElement('span');
    method.className = 'method ' + (req.method || 'GET');
    method.textContent = req.method || 'GET';

    const sc = req.responseStatus;
    const statusEl = document.createElement('span');
    statusEl.className = 'status-code' + (sc >= 200 && sc < 300 ? ' ok' : sc >= 400 ? ' err' : '');
    statusEl.textContent = sc || '—';

    const urlEl = document.createElement('span');
    urlEl.className = 'url';
    urlEl.title = req.url;
    try {
      const u = new URL(req.url);
      urlEl.textContent = u.pathname + u.search;
    } catch (_) {
      urlEl.textContent = req.url || '';
    }

    row.appendChild(cb);
    row.appendChild(method);
    row.appendChild(statusEl);
    row.appendChild(urlEl);

    const toggle = () => {
      if (selectedIndices.has(idx)) {
        selectedIndices.delete(idx);
      } else if (selectedIndices.size < MAX_SELECT) {
        selectedIndices.add(idx);
      }
      renderList();
    };
    row.addEventListener('click', (e) => { if (e.target !== cb) toggle(); });
    cb.addEventListener('change', toggle);
    list.appendChild(row);
  });

  updateStatus();
}

function updateStatus() {
  document.getElementById('status').textContent =
    `${allRequests.length} captured  |  ${selectedIndices.size} selected`;
  document.getElementById('send-btn').disabled = selectedIndices.size === 0;
}

// Tell devtools.js to reload from HAR and clear the captured list
document.getElementById('refresh-btn').addEventListener('click', function () {
  allRequests = [];
  selectedIndices.clear();
  chrome.storage.local.set({ panelControl: { action: 'refresh' } });
  renderList();
});

// Tell devtools.js to clear its captured array, and clear storage
document.getElementById('clear-btn').addEventListener('click', function () {
  allRequests = [];
  selectedIndices.clear();
  filterText = '';
  document.getElementById('filter-input').value = '';
  chrome.storage.local.set({ panelControl: { action: 'clear' } });
  renderList();
});

document.getElementById('filter-input').addEventListener('input', function (e) {
  filterText = e.target.value;
  renderList();
});

document.getElementById('send-btn').addEventListener('click', async function () {
  const selected = [...selectedIndices].map((idx) => allRequests[idx]);
  const payload = buildPayload(selected);

  const btn = document.getElementById('send-btn');
  btn.textContent = 'Sending…';
  btn.disabled = true;

  try {
    const res = await fetch(`http://localhost:${VSCODE_PORT}/endpoints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      btn.textContent = '✓ Sent!';
      setTimeout(() => { btn.textContent = 'Send to VS Code'; btn.disabled = selectedIndices.size === 0; }, 2500);
    } else {
      btn.textContent = '✗ Server error';
      setTimeout(() => { btn.textContent = 'Send to VS Code'; btn.disabled = false; }, 3000);
    }
  } catch {
    btn.textContent = '✗ VS Code not running?';
    setTimeout(() => { btn.textContent = 'Send to VS Code'; btn.disabled = false; }, 3500);
  }
});
