import * as vscode from 'vscode';
import * as path from 'path';
import { createServer } from './server';
import { generateTestFiles } from './generator';
import { EndpointData, TestCase } from './types';

const SERVER_PORT = 3333;

let capturedEndpoints: EndpointData[] = [];
let serverInstance: ReturnType<typeof createServer> | null = null;

export function activate(context: vscode.ExtensionContext): void {
  startServer();

  context.subscriptions.push(
    vscode.commands.registerCommand('testcaseGenerator.generateTests', handleGenerate),
    vscode.commands.registerCommand('testcaseGenerator.clearEndpoints', () => {
      capturedEndpoints = [];
      vscode.window.showInformationMessage('API Testcase Generator: Captured endpoints cleared.');
    })
  );
}

function buildBasicHttpFile(endpoints: EndpointData[]): string {
  if (endpoints.length === 0) return '';

  // Extract base URL from first endpoint
  try {
    const first = new URL(endpoints[0].url);
    const baseUrl = `${first.protocol}//${first.host}`;
    const lines: string[] = [
      `@baseUrl = ${baseUrl}`,
      `@token = {{$dotenv API_TOKEN}}`,
      '',
    ];

    for (const ep of endpoints) {
      let urlPath = ep.url;
      try {
        const u = new URL(ep.url);
        urlPath = u.pathname + u.search;
      } catch { }

      lines.push(`### ${ep.method} ${urlPath}`);
      lines.push(`${ep.method} {{baseUrl}}${urlPath}`);

      // Include auth header if present
      const auth = ep.headers?.find(
        (h) => h.name.toLowerCase() === 'authorization'
      );
      if (auth) {
        lines.push(`Authorization: Bearer {{token}}`);
      }

      if (ep.body) {
        lines.push('');
        lines.push(ep.body);
      }

      lines.push('');
    }

    return lines.join('\n');
  } catch {
    // Fallback: dump endpoints as-is if URL parsing fails
    return endpoints
      .map((ep) => `### ${ep.method} ${ep.url}\n${ep.method} ${ep.url}\n`)
      .join('\n');
  }
}

function extractBearerToken(endpoints: EndpointData[]): string {
  for (const ep of endpoints) {
    const auth = ep.headers?.find(
      (h) => h.name.toLowerCase() === 'authorization'
    );
    if (auth) {
      const match = auth.value.match(/^Bearer\s+(.+)$/i);
      if (match) return match[1].trim();
    }
  }
  return 'YOUR_TOKEN_HERE';
}

function startServer(): void {
  serverInstance = createServer(async (endpoints) => {
    capturedEndpoints = endpoints;

    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showInformationMessage(
          `API Testcase generator: Received ${endpoints.length} endpoint(s). Open a workspace folder, then run "Generate API Tests".`
        );
        return;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;

      const httpUri = vscode.Uri.file(path.join(workspaceRoot, 'api-tests.http'));
      await vscode.workspace.fs.writeFile(httpUri, Buffer.from(buildBasicHttpFile(endpoints), 'utf-8'));

      const token = extractBearerToken(endpoints);
      await writeEnvFile(workspaceRoot, `API_TOKEN=${token}`);

      const doc = await vscode.workspace.openTextDocument(httpUri);
      await vscode.window.showTextDocument(doc);

      vscode.window.showInformationMessage(
        `API Testcase generator: ${endpoints.length} endpoint(s) loaded. Token extracted: ${token.slice(0, 12)}…`
      );
    } catch (err) {
      vscode.window.showErrorMessage(`API Testcase generator: Failed to write files — ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  serverInstance.listen(SERVER_PORT, 'localhost', () => {
    console.log(`API Testcase generator: Server listening on port ${SERVER_PORT}`);
  });

  serverInstance.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      vscode.window.showErrorMessage(
        `API Testcase generator: Port ${SERVER_PORT} is already in use. Is another VS Code window running this extension?`
      );
    } else {
      vscode.window.showErrorMessage(`API Testcase Generator: Server error — ${err.message}`);
    }
  });
}

async function handleGenerate(): Promise<void> {
  if (capturedEndpoints.length === 0) {
    vscode.window.showWarningMessage(
      'API Testcase generator: No endpoints captured. Use the Chrome extension to send endpoints first.'
    );
    return;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('API Testcase generator: No workspace folder open. Please open a folder first.');
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'API Testcase generator: Generating API tests with Claude…',
      cancellable: true,
    },
    async (progress, token) => {
      try {
        progress.report({ message: `Processing ${capturedEndpoints.length} endpoint(s)…` });

        const generated = await generateTestFiles(capturedEndpoints, token);

        progress.report({ message: 'Writing files…' });

        // Write api-tests.http
        const httpUri = vscode.Uri.file(path.join(workspaceRoot, 'api-tests.http'));
        await vscode.workspace.fs.writeFile(httpUri, Buffer.from(generated.httpFileContent, 'utf-8'));

        // Write .env (smart merge) — only if generation produced env content
        if (generated.envFileContent) {
          await writeEnvFile(workspaceRoot, generated.envFileContent);
        }

        // Write testcases/*.md
        await writeTestCaseMarkdown(workspaceRoot, generated.testCases);

        // Open api-tests.http in the editor
        const doc = await vscode.workspace.openTextDocument(httpUri);
        await vscode.window.showTextDocument(doc);

        const tcCount = generated.testCases.reduce((sum, tc) => sum + tc.scenarios.length, 0);
        vscode.window.showInformationMessage(
          `API Testcase Generator: Done! Generated ${tcCount} test scenarios across ${generated.testCases.length} endpoint(s). ` +
          `Check testcases/ for markdown docs.`
        );

        capturedEndpoints = [];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`API Testcase Generator: Generation failed — ${msg}`);
      }
    }
  );
}

async function writeEnvFile(workspaceRoot: string, newLine: string): Promise<void> {
  const envUri = vscode.Uri.file(path.join(workspaceRoot, '.env'));
  let existing = '';
  try {
    existing = Buffer.from(await vscode.workspace.fs.readFile(envUri)).toString('utf-8');
  } catch {
    // file does not exist yet
  }

  const key = newLine.split('=')[0]; // e.g. "API_TOKEN"
  const lines = existing.split(/\r?\n/);
  const filtered = lines.filter(l => !l.startsWith(key + '=') && l !== '');
  filtered.unshift(newLine.trim());
  await vscode.workspace.fs.writeFile(envUri, Buffer.from(filtered.join('\n') + '\n', 'utf-8'));
}

async function writeTestCaseMarkdown(workspaceRoot: string, testCases: TestCase[]): Promise<void> {
  const tcDir = vscode.Uri.file(path.join(workspaceRoot, 'testcases'));

  // Create directory if it doesn't exist
  try {
    await vscode.workspace.fs.createDirectory(tcDir);
  } catch {
    // already exists
  }

  for (const tc of testCases) {
    const filename = sanitizeFilename(tc.endpointKey) + '.md';
    const content = renderMarkdown(tc);
    const fileUri = vscode.Uri.file(path.join(workspaceRoot, 'testcases', filename));
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
  }
}

function renderMarkdown(tc: TestCase): string {
  const lines: string[] = [`# ${tc.endpointLabel}`, ''];

  for (const scenario of tc.scenarios) {
    lines.push(`## Scenario: ${scenario.title}`, '');

    lines.push('### Preconditions');
    for (const p of scenario.preconditions) {
      lines.push(`- ${p}`);
    }
    lines.push('');

    lines.push('### Steps');
    scenario.steps.forEach((step, i) => {
      lines.push(`${i + 1}. ${step}`);
    });
    lines.push('');

    lines.push('### Expected Results');
    for (const r of scenario.expectedResults) {
      lines.push(`- ${r}`);
    }
    lines.push('');
    lines.push('---', '');
  }

  return lines.join('\n');
}

function sanitizeFilename(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_|_$/g, '');
}

export function deactivate(): void {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
}
