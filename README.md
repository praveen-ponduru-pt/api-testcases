# API Test Generator

A two-part tool that captures live API calls from the browser and automatically generates `.http` test files and markdown test case documentation using Claude AI.

## How It Works

1. **Chrome Extension** intercepts network requests in DevTools and sends captured endpoints to a local server.
2. **VS Code Extension** receives those endpoints, writes a basic `api-tests.http` file immediately, then on command calls Claude to generate comprehensive test scenarios and markdown docs in `testcases/`.

## Project Structure

```
api-testcases/
├── chrome-extension/          # Browser extension (Manifest V3)
│   ├── devtools.html/js       # DevTools panel integration
│   ├── panel.html/js          # Network capture panel
│   ├── popup.html/js          # Extension popup
│   ├── shared.js              # Shared utilities
│   ├── icons/                 # Extension icons
│   └── manifest.json
├── vscode-extension/          # VS Code extension
│   ├── src/
│   │   ├── extension.ts       # Entry point, commands, file writing
│   │   ├── generator.ts       # Claude Language Model integration
│   │   ├── prompt.ts          # Claude prompt builder
│   │   ├── server.ts          # Local HTTP server (port 3333)
│   │   └── types.ts           # Shared types
│   ├── out/                   # Compiled JS (gitignored)
│   ├── api-test-generator-1.1.0.vsix  # Installable extension package
│   ├── package.json
│   ├── tsconfig.json
│   └── .vscodeignore
├── testcases/                 # Generated markdown test cases (gitignored)
├── api-tests.http             # Generated .http test file
└── .env                       # API token (gitignored)
```

## Setup

### Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `chrome-extension/` folder

### VS Code Extension

1. Open the Extensions panel (`Ctrl+Shift+X`)
2. Click the `...` menu (top-right of the panel) → **Install from VSIX...**
3. Select `vscode-extension/api-test-generator-1.1.0.vsix`
4. Reload VS Code when prompted

The extension activates automatically on startup and starts a local server on port 3333.

### Environment

A `.env` file in the workspace root is auto-created on first capture:

```
API_TOKEN=your_bearer_token_here
```

## Usage

1. Open DevTools in Chrome on the target app and navigate to the **API Capturer** panel.
2. Browse the app to trigger the API calls you want to test.
3. Click **Send to VS Code** in the panel — this POSTs the captured endpoints to `localhost:3333`.
4. VS Code immediately writes `api-tests.http` with the captured requests and opens it.
5. Run the command **Generate API Tests** (`Ctrl+Shift+P`) to call Claude and generate full test scenarios.
6. Generated markdown test cases are written to `testcases/`, one file per endpoint.

## VS Code Commands

| Command | Description |
|---|---|
| `Generate API Tests` | Calls Claude to generate test scenarios for captured endpoints |
| `Clear Captured Endpoints` | Clears the in-memory endpoint list |

## Output

- **`api-tests.http`** — REST Client-compatible file with happy path, invalid auth, missing/invalid parameter scenarios
- **`testcases/*.md`** — Markdown docs with preconditions, steps, and expected results per endpoint

## Known Issues

### `.http` files not recognized by HTTP Client extension

On first install, the [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) (HTTP Client) extension may not recognize `.http` files — the **Send Request** code lens won't appear. To fix this, uninstall the extension and reinstall it.
