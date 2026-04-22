chrome.devtools.panels.create('API Capture', 'icons/icon16.png', 'panel.html', () => {});

const captured = [];
const MAX_CAPTURED = 200;

function shouldSkip(url) {
  if (!url) return true;
  if (/^(chrome-extension|chrome|edge-extension|data|blob):/.test(url)) return true;
  if (/\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|css|js|map)(\?|$)/i.test(url)) return true;
  return false;
}

function buildEntry(req, body) {
  return {
    url: req.request.url,
    method: req.request.method || 'GET',
    requestHeaders: req.request.headers || [],
    requestBody: (req.request.postData && req.request.postData.text) || null,
    responseBody: body || null,
    responseStatus: (req.response && req.response.status) || 0,
  };
}

function pushEntry(entry) {
  if (captured.length >= MAX_CAPTURED) captured.shift();
  captured.push(entry);
  try { chrome.storage.local.set({ capturedRequests: captured }); } catch (_) {}
}

function loadFromHAR() {
  chrome.devtools.network.getHAR(function (harLog) {
    (harLog.entries || []).forEach(function (req) {
      if (shouldSkip(req.request && req.request.url)) return;
      if (typeof req.getContent === 'function') {
        try { req.getContent(function (body) { pushEntry(buildEntry(req, body)); }); }
        catch (_) { pushEntry(buildEntry(req, null)); }
      } else {
        pushEntry(buildEntry(req, null));
      }
    });
  });
}

// Listen for clear/refresh commands from the panel via storage
chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== 'local' || !changes.panelControl) return;
  const action = changes.panelControl.newValue && changes.panelControl.newValue.action;
  if (action === 'clear') {
    captured.length = 0;
    chrome.storage.local.set({ capturedRequests: [], panelControl: null });
  } else if (action === 'refresh') {
    captured.length = 0;
    chrome.storage.local.set({ capturedRequests: [], panelControl: null });
    loadFromHAR();
  }
});

loadFromHAR();

chrome.devtools.network.onRequestFinished.addListener(function (req) {
  if (shouldSkip(req.request && req.request.url)) return;
  if (typeof req.getContent === 'function') {
    try { req.getContent(function (body) { pushEntry(buildEntry(req, body)); }); }
    catch (_) { pushEntry(buildEntry(req, null)); }
  } else {
    pushEntry(buildEntry(req, null));
  }
});
