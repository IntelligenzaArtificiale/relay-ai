import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/ui/webview.ts', 'utf8');
const sections = source.indexOf('const VALID_SECTIONS');
const persisted = source.indexOf('const persisted = safePersistedState');
assert.ok(sections >= 0, 'VALID_SECTIONS declaration missing');
assert.ok(persisted >= 0, 'persisted-state initialization missing');
assert.ok(sections < persisted, 'VALID_SECTIONS must be initialized before safePersistedState runs');

const normalize = source.match(/function normalizeSection\([\s\S]*?\n\}/)?.[0] ?? '';
assert.match(normalize, /VALID_SECTIONS\.includes/);
assert.match(normalize, /: 'chat'/);

console.log('Webview initialization-order test');
console.log('  PASS section allowlist initialized before persisted state normalization');
