import * as vscode from 'vscode';
import type { AntigravityCommandHost } from './antigravity-native-bridge.js';

export function createVscodeAntigravityCommandHost(): AntigravityCommandHost {
  return {
    appName: vscode.env.appName,
    getCommands: () => Promise.resolve(vscode.commands.getCommands(true)),
    execute: <T>(command: string, ...args: unknown[]) => Promise.resolve(vscode.commands.executeCommand<T>(command, ...args))
  };
}
