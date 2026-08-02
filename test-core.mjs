import { build } from 'esbuild';
import { rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'relay-core-test-'));
const outfile = join(directory, 'test-core.mjs');
try {
  await build({
    entryPoints: ['test-core-entry.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    outfile
  });
  await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
