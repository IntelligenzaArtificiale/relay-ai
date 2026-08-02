import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class AtomicJsonStore<T> {
  private tail: Promise<void> = Promise.resolve();
  private cache: T | undefined;
  private cacheReady = false;

  constructor(
    private readonly path: string,
    private readonly initialValue: T
  ) {}

  async read(): Promise<T> {
    if (this.cacheReady) return structuredClone(this.cache as T);
    try {
      const raw = await readFile(this.path, 'utf8');
      const value = JSON.parse(raw) as T;
      this.setCache(value);
      return structuredClone(value);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        const value = structuredClone(this.initialValue);
        this.setCache(value);
        return structuredClone(value);
      }
      // A partially-written or manually-edited storage file must never brick the
      // whole webview. Preserve the bad payload for diagnostics/recovery and
      // continue from a clean in-memory value. Permission and I/O failures still
      // propagate because silently ignoring those would hide a real disk issue.
      if (error instanceof SyntaxError) {
        await this.quarantineCorruptFile().catch(() => undefined);
        const value = structuredClone(this.initialValue);
        this.setCache(value);
        return structuredClone(value);
      }
      throw error;
    }
  }


  invalidate(): void {
    this.cache = undefined;
    this.cacheReady = false;
  }

  async write(value: T): Promise<void> {
    await this.exclusive(() => this.writeUnlocked(value));
  }

  async update(updater: (value: T) => T | Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      const next = await updater(await this.read());
      await this.writeUnlocked(next);
      return next;
    });
  }

  private async quarantineCorruptFile(): Promise<void> {
    const target = `${this.path}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await rename(this.path, target);
  }

  private async writeUnlocked(value: T): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.path);
    this.setCache(value);
  }

  private setCache(value: T): void {
    this.cache = structuredClone(value);
    this.cacheReady = true;
  }

  private async exclusive<R>(operation: () => Promise<R>): Promise<R> {
    const previous = this.tail;
    let release: (() => void) | undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
    }
  }
}
