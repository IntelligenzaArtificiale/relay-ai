export {};

declare function acquireVsCodeApi<T = unknown>(): {
  postMessage(message: unknown): void;
  getState(): T | undefined;
  setState(state: T): void;
};

interface BootstrapBridgePayload {
  vscode: ReturnType<typeof acquireVsCodeApi>;
  pendingMessages: unknown[];
  mainReady: boolean;
  mainError?: string;
  startedAt: number;
}

(() => {
  const relayWindow = window as any;
  if (relayWindow.__relayBootBridge) return;

  const vscode = acquireVsCodeApi();
  const bridge: BootstrapBridgePayload = {
    vscode,
    pendingMessages: [],
    mainReady: false,
    startedAt: Date.now()
  };
  relayWindow.__relayBootBridge = bridge;

  const reportMainFailure = (message: string, stack = '') => {
    if (bridge.mainReady) return;
    bridge.mainError = message;
    const copy = document.querySelector<HTMLElement>('#app .boot-copy p');
    if (copy) copy.textContent = 'Interfaccia Relay non avviata. Apri Relay Diagnostics.';
    vscode.postMessage({
      type: 'reportUiError',
      payload: { message, stack }
    });
  };

  window.addEventListener('error', (event) => {
    if (/ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/i.test(event.message ?? '')) {
      event.preventDefault();
      return;
    }
    reportMainFailure(
      `Errore JavaScript durante il boot Relay: ${event.message || 'errore sconosciuto'}`,
      event.error instanceof Error ? event.error.stack ?? '' : `${event.filename || ''}:${event.lineno || 0}:${event.colno || 0}`
    );
  }, true);
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    reportMainFailure(`Promise rifiutata durante il boot Relay: ${reason.message}`, reason.stack ?? '');
  });

  window.addEventListener('message', (event) => {
    if (!bridge.mainReady) bridge.pendingMessages.push(event.data);
  });

  vscode.postMessage({ type: 'webviewBootstrapReady' });

  window.setTimeout(() => {
    if (bridge.mainReady) return;
    reportMainFailure(
      bridge.mainError
        ? `Bootstrap Relay attivo; il bundle inline ha fallito: ${bridge.mainError}`
        : 'Bootstrap Relay attivo, ma il bundle inline dist/webview.js non ha completato l’avvio entro 5 secondi.'
    );
  }, 5_000);
})();
