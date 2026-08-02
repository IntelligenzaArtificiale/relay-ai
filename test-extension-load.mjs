import Module from 'node:module';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const originalLoad = Module._load;
const vscodeStub = new Proxy(function () {}, {
  apply: () => vscodeStub,
  construct: () => vscodeStub,
  get: () => vscodeStub
});

try {
  Module._load = (request, parent, isMain) => request === 'vscode'
    ? vscodeStub
    : originalLoad(request, parent, isMain);
  require('./dist/extension.js');
  console.log('Extension bundle load test\n  PASS bundle imports without browser globals or startup side effects');
} finally {
  Module._load = originalLoad;
}