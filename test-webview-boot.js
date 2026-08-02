const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

console.log('webview boot channel');

const extensionSource = fs.readFileSync('src/extension.ts', 'utf8');
const panelConnect = extensionSource.indexOf('this.subscription = connectWebview(panel.webview, this.controller);');
const panelConfigure = extensionSource.indexOf("configureWebview(panel.webview, this.context, 'panel');");
assert.ok(panelConnect >= 0 && panelConnect < panelConfigure, 'panel listener must be registered before webview.html');

const sidebarConnect = extensionSource.indexOf('this.subscription = connectWebview(view.webview, this.controller);');
const sidebarConfigure = extensionSource.indexOf("configureWebview(view.webview, this.context, 'sidebar');");
assert.ok(sidebarConnect >= 0 && sidebarConnect < sidebarConfigure, 'sidebar listener must be registered before webview.html');
assert.match(extensionSource, /script-src 'nonce-\$\{nonce\}'/);
assert.match(extensionSource, /img-src \$\{webview\.cspSource\} data: blob:/);
assert.doesNotMatch(extensionSource, /script-src \$\{webview\.cspSource\}/);
assert.match(extensionSource, /webview-bootstrap\.js/);
assert.match(extensionSource, /readFileSync\(bootstrapBundlePath, 'utf8'\)/);
assert.match(extensionSource, /readFileSync\(mainBundlePath, 'utf8'\)/);
assert.match(extensionSource, /data-relay-bootstrap=\"inline\"/);
assert.match(extensionSource, /data-relay-main=\"inline\"/);
assert.match(extensionSource, /safeInlineScript/);
assert.doesNotMatch(extensionSource, /src=\"\$\{bootstrapUri\}\"/);
assert.doesNotMatch(extensionSource, /src=\"\$\{scriptUri\}\"/);
assert.match(extensionSource, /query: `v=\$\{assetVersion\}`/);

const dom = new JSDOM(`<!doctype html><html><body><div id="app"><main class="boot-screen"><div class="boot-copy"><p>Avvio</p></div></main></div></body></html>`, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'https://relay.local/'
});
const { window } = dom;
let acquireCount = 0;
const posted = [];
window.acquireVsCodeApi = () => {
  acquireCount += 1;
  return {
    postMessage: (message) => posted.push(message),
    getState: () => undefined,
    setState: () => undefined
  };
};
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

window.eval(fs.readFileSync('dist/webview-bootstrap.js', 'utf8'));
assert.equal(acquireCount, 1, 'bootstrap acquires VS Code API once');
assert.ok(posted.some((message) => message.type === 'webviewBootstrapReady'));
assert.ok(window.__relayBootBridge, 'bootstrap bridge is exposed');

window.eval(fs.readFileSync('dist/webview.js', 'utf8'));
assert.equal(acquireCount, 1, 'main bundle reuses bootstrap VS Code API');
assert.equal(window.__relayBootBridge.mainReady, true);
assert.ok(posted.some((message) => message.type === 'webviewReady'));

window.dispatchEvent(new window.MessageEvent('message', { data: { type: 'webviewAck' } }));
window.close();
assert.match(fs.readFileSync('src/ui/webview-bootstrap.ts', 'utf8'), /Errore JavaScript durante il boot Relay/);
console.log('  PASS listener ordering, inline bundles, bootstrap bridge, CSP and diagnostics');
