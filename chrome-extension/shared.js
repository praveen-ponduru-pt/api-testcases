const VSCODE_PORT = 3333;

function buildPayload(selected) {
  return selected.map((req) => ({
    url: req.url,
    method: req.method,
    headers: req.requestHeaders,
    body: req.requestBody,
    responseBody: req.responseBody,
  }));
}
