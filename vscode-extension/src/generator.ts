import * as vscode from 'vscode';
import { EndpointData, GeneratedFiles } from './types';
import { buildPrompt } from './prompt';

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON object found in response');
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error('Unterminated JSON object in response');
}

export async function generateTestFiles(
  endpoints: EndpointData[],
  token: vscode.CancellationToken
): Promise<GeneratedFiles> {
  let models = await vscode.lm.selectChatModels({ vendor: 'anthropic' });

  if (models.length === 0) {
    models = await vscode.lm.selectChatModels({ family: 'claude' });
  }

  if (models.length === 0) {
    const all = await vscode.lm.selectChatModels();
    models = all.filter(m => m.id.toLowerCase().includes('claude') || m.vendor.toLowerCase().includes('anthropic'));
  }

  if (models.length === 0) {
    const all = await vscode.lm.selectChatModels();
    const available = all.map(m => `${m.vendor}/${m.id}`).join(', ') || 'none';
    throw new Error(
      `No Claude model found. Available models: ${available}.\n` +
      `Make sure the Claude Code extension is installed and you are signed in.`
    );
  }

  const model = models[0];
  console.log(`API Testcase Generator: Using model ${model.vendor}/${model.id}`);
  const messages = [vscode.LanguageModelChatMessage.User(buildPrompt(endpoints))];

  let response: vscode.LanguageModelChatResponse;
  try {
    response = await model.sendRequest(messages, {}, token);
  } catch (err) {
    const msg = err instanceof vscode.LanguageModelError ? `${err.message} (${err.code})` : String(err);
    throw new Error(`Claude request failed: ${msg}`);
  }

  let text = '';
  try {
    for await (const chunk of response.text) {
      text += chunk;
    }
  } catch (err) {
    const msg = err instanceof vscode.LanguageModelError ? `${err.message} (${err.code})` : String(err);
    throw new Error(`Claude stream error: ${msg}${text ? `\n\nPartial response:\n${text.slice(0, 300)}` : ''}`);
  }

  if (!text.trim()) {
    throw new Error(
      `Claude returned an empty response (model: ${model.vendor}/${model.id}). ` +
      `Sign out and sign back in to Claude Code, then try again.`
    );
  }

  let parsed: { httpFile: string; testCases: GeneratedFiles['testCases'] };
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch (err) {
    throw new Error(
      `Claude response was not valid JSON: ${(err as Error).message}\n\nRaw response:\n${text.slice(0, 500)}`
    );
  }

  if (!parsed.httpFile || !Array.isArray(parsed.testCases)) {
    throw new Error('Claude response is missing required fields (httpFile or testCases)');
  }

  return {
    httpFileContent: parsed.httpFile,
    envFileContent: '',
    testCases: parsed.testCases,
  };
}
