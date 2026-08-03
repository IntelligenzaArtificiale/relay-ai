import { join, resolve, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import * as vscode from 'vscode';
import { classifyLinkTarget, extractResourceLocation, isBinaryExtension, type LinkClassification } from '../core/resource-classifier.js';

export interface ResourceOpenContext {
  workspaceRoot?: string;
  log?: (classification: LinkClassification, action: string) => void;
}

export class ResourceOpenService {
  async open(rawPath: string, context: ResourceOpenContext = {}): Promise<void> {
    const classification = classifyLinkTarget(rawPath);
    if (classification.kind === 'command' || classification.kind === 'plain_text' || classification.kind === 'ambiguous') {
      context.log?.(classification, 'render-only');
      await vscode.env.clipboard.writeText(classification.normalized);
      void vscode.window.showInformationMessage('Questo testo non è un percorso apribile. L’ho copiato negli appunti.');
      return;
    }
    if (classification.kind === 'external_url') {
      context.log?.(classification, 'open-external');
      await vscode.env.openExternal(vscode.Uri.parse(classification.normalized));
      return;
    }

    const location = extractResourceLocation(classification.normalized);
    const filesystemPath = this.resolvePath(location.path, context.workspaceRoot);
    const uri = vscode.Uri.file(filesystemPath);
    let info: vscode.FileStat;
    try {
      info = await vscode.workspace.fs.stat(uri);
    } catch {
      context.log?.({ ...classification, kind: 'nonexistent_path' }, 'toast-missing');
      void vscode.window.showWarningMessage(`Il file o la cartella non esiste più: ${filesystemPath}`, 'Copia percorso').then((choice) => {
        if (choice === 'Copia percorso') void vscode.env.clipboard.writeText(filesystemPath);
      });
      return;
    }

    if (info.type & vscode.FileType.Directory) {
      context.log?.(classification, 'reveal-directory');
      await vscode.commands.executeCommand('revealInExplorer', uri);
      return;
    }

    if (classification.kind === 'binary_file' || isBinaryExtension(filesystemPath)) {
      await this.openBinary(uri, filesystemPath, context, classification);
      return;
    }

    context.log?.(classification, 'open-text');
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, { preview: true, preserveFocus: false });
    if (location.line !== undefined) {
      const line = Math.max(0, Math.min(document.lineCount - 1, location.line - 1));
      const character = Math.max(0, Math.min(document.lineAt(line).text.length, (location.column ?? 1) - 1));
      const position = new vscode.Position(line, character);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
  }

  private resolvePath(path: string, workspaceRoot?: string): string {
    if (/^file:\/\//i.test(path)) return vscode.Uri.parse(path).fsPath;
    if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2));
    if (isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path)) return path;
    return resolve(workspaceRoot ?? process.cwd(), path);
  }

  private async openBinary(uri: vscode.Uri, filesystemPath: string, context: ResourceOpenContext, classification: LinkClassification): Promise<void> {
    if (/\.vsix$/i.test(filesystemPath)) {
      context.log?.(classification, 'offer-install');
      const choice = await vscode.window.showInformationMessage(
        `File VSIX rilevato: ${filesystemPath}`,
        'Installa estensione',
        'Mostra nel file manager',
        'Copia percorso'
      );
      if (choice === 'Installa estensione') {
        await Promise.resolve(vscode.commands.executeCommand('workbench.extensions.installExtension', uri)).catch(async () => {
          await vscode.commands.executeCommand('workbench.extensions.command.installFromVSIX', uri);
        });
      } else if (choice === 'Mostra nel file manager') {
        await Promise.resolve(vscode.commands.executeCommand('revealFileInOS', uri)).catch(() => vscode.commands.executeCommand('revealInExplorer', uri));
      } else if (choice === 'Copia percorso') {
        await vscode.env.clipboard.writeText(filesystemPath);
      }
      return;
    }
    context.log?.(classification, 'reveal-binary');
    await Promise.resolve(vscode.commands.executeCommand('revealFileInOS', uri)).catch(() => vscode.commands.executeCommand('revealInExplorer', uri));
  }
}
