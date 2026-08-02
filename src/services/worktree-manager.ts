import { mkdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { runCommand } from './command-runner.js';
import { RelayError } from '../core/errors.js';

export interface WorktreeLease {
  id: string;
  repoRoot: string;
  path: string;
  branch: string;
  baseCommit: string;
}

export class WorktreeManager {
  constructor(private readonly storageRoot: string) {}

  async isGitRepository(cwd: string): Promise<boolean> {
    const result = await runCommand('git', ['rev-parse', '--is-inside-work-tree'], { cwd, timeoutMs: 5000 }).catch(() => null);
    return result?.exitCode === 0 && result.stdout.trim() === 'true';
  }


  async isClean(cwd: string): Promise<boolean> {
    const result = await runCommand('git', ['status', '--porcelain=v1'], { cwd, timeoutMs: 10_000 }).catch(() => null);
    return result?.exitCode === 0 && result.stdout.trim() === '';
  }

  async applyDiff(lease: WorktreeLease, diff: string): Promise<void> {
    if (!diff.trim()) return;
    const check = await runCommand('git', ['apply', '--check', '--whitespace=nowarn', '-'], {
      cwd: lease.repoRoot,
      stdin: diff.endsWith('\n') ? diff : `${diff}\n`,
      timeoutMs: 30_000
    });
    if (check.exitCode !== 0) {
      throw new RelayError(check.stderr || 'The delegated worktree diff conflicts with the active workspace.', 'WORKTREE_APPLY_CONFLICT');
    }
    const result = await runCommand('git', ['apply', '--whitespace=nowarn', '-'], {
      cwd: lease.repoRoot,
      stdin: diff.endsWith('\n') ? diff : `${diff}\n`,
      timeoutMs: 30_000
    });
    if (result.exitCode !== 0) {
      throw new RelayError(result.stderr || 'Unable to integrate delegated worktree changes.', 'WORKTREE_APPLY_FAILED');
    }
  }

  async create(cwd: string, taskId: string): Promise<WorktreeLease> {
    const repo = await this.repoInfo(cwd);
    const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48);
    const project = basename(repo.root).replace(/[^a-zA-Z0-9_-]/g, '-');
    const path = resolve(join(this.storageRoot, project, safeTaskId));
    const branch = `relay/${new Date().toISOString().replace(/[:.]/g, '-')}/${safeTaskId}`;
    await mkdir(join(this.storageRoot, project), { recursive: true });

    const result = await runCommand('git', ['worktree', 'add', '-b', branch, path, repo.commit], {
      cwd: repo.root,
      timeoutMs: 30_000
    });
    if (result.exitCode !== 0) {
      throw new RelayError(result.stderr || 'Unable to create Git worktree.', 'WORKTREE_CREATE_FAILED');
    }
    return { id: taskId, repoRoot: repo.root, path, branch, baseCommit: repo.commit };
  }

  async inspect(lease: WorktreeLease): Promise<{ diff: string; changedFiles: string[] }> {
    // Intent-to-add makes untracked files visible to `git diff` without staging their contents.
    await runCommand('git', ['add', '--intent-to-add', '--', '.'], { cwd: lease.path, timeoutMs: 10_000 });
    const [diffResult, statusResult] = await Promise.all([
      runCommand('git', ['diff', '--binary', '--no-ext-diff', lease.baseCommit], { cwd: lease.path, timeoutMs: 20_000 }),
      runCommand('git', ['status', '--porcelain=v1'], { cwd: lease.path, timeoutMs: 10_000 })
    ]);
    const changedFiles = [...new Set(
      statusResult.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim())
    )];
    return { diff: diffResult.stdout, changedFiles };
  }

  async remove(lease: WorktreeLease, force = false): Promise<void> {
    const args = ['worktree', 'remove', lease.path];
    if (force) args.push('--force');
    const result = await runCommand('git', args, { cwd: lease.repoRoot, timeoutMs: 30_000 });
    if (result.exitCode !== 0) {
      throw new RelayError(result.stderr || 'Unable to remove Git worktree.', 'WORKTREE_REMOVE_FAILED');
    }
  }

  private async repoInfo(cwd: string): Promise<{ root: string; commit: string }> {
    const [rootResult, commitResult] = await Promise.all([
      runCommand('git', ['rev-parse', '--show-toplevel'], { cwd, timeoutMs: 5000 }),
      runCommand('git', ['rev-parse', 'HEAD'], { cwd, timeoutMs: 5000 })
    ]);
    if (rootResult.exitCode !== 0 || commitResult.exitCode !== 0) {
      throw new RelayError('Parallel write tasks require a Git repository with an initial commit.', 'WORKTREE_REPO_REQUIRED');
    }
    return { root: rootResult.stdout.trim(), commit: commitResult.stdout.trim() };
  }
}
