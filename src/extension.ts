import { readFileSync } from 'node:fs';
import * as vscode from 'vscode';
import { RelayController, type RelayOutboundMessage } from './services/relay-controller.js';

export function activate(context: vscode.ExtensionContext): void {
  const controller = new RelayController(context);
  const sidebar = new RelayWebviewViewProvider(context, controller);
  const panelManager = new RelayPanelManager(context, controller);

  context.subscriptions.push(
    controller,
    sidebar,
    panelManager,
    vscode.window.registerWebviewViewProvider('relay.sidebar', sidebar, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand('relay.open', () => panelManager.open()),
    vscode.commands.registerCommand('relay.openAgents', () => {
      panelManager.open();
      controller.openUiSection('agents');
    }),
    vscode.commands.registerCommand('relay.openUsage', () => {
      panelManager.open();
      controller.openUiSection('usage');
    }),
    vscode.commands.registerCommand('relay.openRemote', () => {
      panelManager.open();
      controller.openUiSection('remote');
    }),
    vscode.commands.registerCommand('relay.resetUi', () => {
      panelManager.open();
      controller.resetUi();
    }),
    vscode.commands.registerCommand('relay.refreshProviders', () => controller.refreshProviders()),
    vscode.commands.registerCommand('relay.doctor', async () => {
      await controller.runSystemDoctor();
      panelManager.open();
    }),
    vscode.commands.registerCommand('relay.setup', async () => {
      await controller.handle({ type: 'showOnboarding' });
      panelManager.open();
    })
  );

  void controller.initialize();
}

export function deactivate(): void {}

class RelayPanelManager implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private subscription: vscode.Disposable | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly controller: RelayController
  ) {}

  open(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'relay.workspace',
      'Relay',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
          vscode.Uri.joinPath(this.context.extensionUri, 'media')
        ]
      }
    );
    this.panel = panel;
    // Register the message channel before assigning webview.html. Antigravity
    // can execute local scripts immediately; assigning HTML first can lose the
    // first ready message and leave the UI waiting forever.
    this.subscription = connectWebview(panel.webview, this.controller);
    configureWebview(panel.webview, this.context, 'panel');
    panel.onDidDispose(() => {
      this.subscription?.dispose();
      this.subscription = undefined;
      this.panel = undefined;
    });
  }

  dispose(): void {
    this.subscription?.dispose();
    this.panel?.dispose();
  }
}

class RelayWebviewViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private subscription: vscode.Disposable | undefined;
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly controller: RelayController
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.context.extensionUri, 'media')
      ]
    };
    this.subscription?.dispose();
    // Same ordering as panels: listen first, then let the webview execute.
    this.subscription = connectWebview(view.webview, this.controller);
    configureWebview(view.webview, this.context, 'sidebar');
    view.onDidDispose(() => {
      this.subscription?.dispose();
      this.subscription = undefined;
      this.view = undefined;
    });
  }

  dispose(): void {
    this.subscription?.dispose();
  }
}

function connectWebview(webview: vscode.Webview, controller: RelayController): vscode.Disposable {
  let bootstrapReady = false;
  let mainReady = false;
  let initialStatePosted = false;

  const postInitialState = () => {
    if (initialStatePosted) return;
    initialStatePosted = true;
    void controller.initialize()
      .then((payload) => webview.postMessage({ type: 'state', payload }))
      .catch((error) => webview.postMessage({
        type: 'initializationError',
        payload: {
          message: error instanceof Error ? error.message : String(error),
          ...(error instanceof Error && error.stack ? { detail: error.stack } : {})
        }
      }));
  };

  const inbound = webview.onDidReceiveMessage((message) => {
    if (message?.type === 'webviewBootstrapReady') {
      bootstrapReady = true;
      void webview.postMessage({ type: 'webviewBootstrapAck' });
      return;
    }
    if (message?.type === 'webviewReady') {
      mainReady = true;
      void webview.postMessage({ type: 'webviewAck' });
      postInitialState();
      return;
    }
    void controller.handle(message);
  });
  const outbound = controller.onMessage((message: RelayOutboundMessage) => {
    void webview.postMessage(message);
  });

  const bootstrapTimer = setTimeout(() => {
    if (bootstrapReady) return;
    void controller.handle({
      type: 'reportUiError',
      payload: {
        message: 'Relay webview bootstrap non avviato entro 5 secondi. Verifica CSP, localResourceRoots e URI del bundle.',
        stack: ''
      }
    });
  }, 5_000);
  const mainTimer = setTimeout(() => {
    if (mainReady) return;
    void controller.handle({
      type: 'reportUiError',
      payload: {
        message: bootstrapReady
          ? 'Bootstrap Relay attivo, ma il bundle inline dist/webview.js non ha inviato webviewReady entro 8 secondi.'
          : 'Relay webview non ha inviato webviewReady entro 8 secondi; anche il bootstrap risulta assente.',
        stack: ''
      }
    });
  }, 8_000);

  return vscode.Disposable.from(
    inbound,
    outbound,
    new vscode.Disposable(() => {
      clearTimeout(bootstrapTimer);
      clearTimeout(mainTimer);
    })
  );
}

function configureWebview(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  surface: 'panel' | 'sidebar'
): void {
  const assetVersion = encodeURIComponent(String(context.extension.packageJSON.version ?? 'dev'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.css')).with({ query: `v=${assetVersion}` });
  const bootstrapBundlePath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview-bootstrap.js').fsPath;
  const bootstrapBundle = safeInlineScript(readFileSync(bootstrapBundlePath, 'utf8'));
  const mainBundlePath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.js').fsPath;
  const mainBundle = safeInlineScript(readFileSync(mainBundlePath, 'utf8'));
  const nonce = createNonce();
  webview.html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data: blob:; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>Relay</title>
</head>
<body data-surface="${surface}">
  <div id="app" aria-live="polite"><main class="boot-screen"><div class="boot-orbit" aria-hidden="true"><span></span><span></span><span></span><span></span><i></i></div><div class="boot-copy"><strong>Relay</strong><p>Avvio dell’ambiente locale…</p><div class="boot-progress"><span></span></div></div></main></div>
  <script nonce="${nonce}" data-relay-bootstrap="inline">${bootstrapBundle}</script>
  <script nonce="${nonce}" data-relay-main="inline" data-relay-main-bytes="${Buffer.byteLength(mainBundle, 'utf8')}">${mainBundle}</script>
</body>
</html>`;
}

function safeInlineScript(source: string): string {
  // Keep the trusted local bundle in a separate nonce-authorized script tag,
  // but prevent HTML parser termination and legacy line-separator issues.
  return source
    .replace(/<\/script/gi, '<\\/script')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function createNonce(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => characters.charAt(Math.floor(Math.random() * characters.length))).join('');
}
