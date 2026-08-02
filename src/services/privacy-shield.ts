import { join } from 'node:path';
import * as vscode from 'vscode';
import mammoth from 'mammoth';
import { runCommand } from './command-runner.js';
import { resolveExecutable, type ExecutableResolution } from './executable-resolver.js';

export interface ShieldResult { text: string; summary: string }

export function sanitizeShieldPromptReferences(text: string): string {
  return text
    .replace(/@file\[[^\]]+\]/gi, 'the anonymized mentioned document')
    .replace(/^## Mentioned file:.*$/gim, '## Anonymized mentioned document')
    .replace(/^## Mentioned file unavailable:.*$/gim, '## Mentioned document unavailable');
}

const parsePdf = require('pdf-parse/lib/pdf-parse.js') as (data: Buffer) => Promise<{ text?: string }>;

let cachedPython: ExecutableResolution | undefined;

function bundledVeloCwd(): string {
  return join(__dirname, '..', 'vendor', 'velo');
}

async function resolvePython(): Promise<ExecutableResolution | undefined> {
  if (cachedPython) return cachedPython;
  const checkedPaths = new Set<string>();
  for (const candidate of ['python3', 'python', 'py']) {
    const resolved = await resolveExecutable(candidate, { force: true });
    if (!resolved || checkedPaths.has(resolved.path.toLowerCase())) continue;
    checkedPaths.add(resolved.path.toLowerCase());
    const probe = await runCommand(resolved.path, ['-c', 'import velo'], {
      cwd: bundledVeloCwd(),
      env: resolved.env,
      timeoutMs: 5000
    }).catch(() => undefined);
    if (probe?.exitCode === 0) {
      cachedPython = resolved;
      return resolved;
    }
  }
  return undefined;
}

export async function isVeloAvailable(): Promise<boolean> {
  return Boolean(await resolvePython());
}

export function resetVeloAvailabilityCache(): void {
  cachedPython = undefined;
}

async function runVelo(args: string[], stdin?: string): Promise<{ stdout: string; stderr: string }> {
  const python = await resolvePython();
  if (!python) throw new Error('Velo non trovato');
  const result = await runCommand(python.path, ['-m', 'velo', ...args], {
    cwd: bundledVeloCwd(),
    env: python.env,
    stdin,
    timeoutMs: 30_000,
    maxBufferBytes: 16 * 1024 * 1024
  });
  if (result.exitCode !== 0) throw new Error(result.stderr || `Velo exited with code ${result.exitCode}`);
  return { stdout: result.stdout, stderr: result.stderr };
}

export async function shieldText(text: string, vaultPath: string): Promise<ShieldResult> {
  const result = await runVelo(['anonimizza', '-', '-v', vaultPath], text);
  return { text: result.stdout, summary: result.stderr };
}

export async function unshieldText(text: string, vaultPath: string): Promise<string> {
  return (await runVelo(['ripristina', '-', '-v', vaultPath], text)).stdout;
}

export async function auditText(text: string): Promise<string> {
  const result = await runVelo(['audit', '-'], text);
  return [result.stdout, result.stderr].filter(Boolean).join('\n');
}

export async function extractPdfText(filePath: string): Promise<string> {
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    const parsed = await parsePdf(Buffer.from(bytes));
    return String(parsed.text ?? '').trim();
  } catch (error) {
    console.warn(`[privacy-shield] PDF extraction failed for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}

export async function extractDocxText(filePath: string): Promise<string> {
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    const parsed = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return String(parsed.value ?? '').trim();
  } catch (error) {
    console.warn(`[privacy-shield] DOCX extraction failed for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}
