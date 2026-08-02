import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const directory = await mkdtemp(join(tmpdir(), "relay-remote-syntax-"));
const outfile = join(directory, "remote-app.mjs");
try {
  await build({
    entryPoints: ["src/services/remote-app.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    outfile,
  });
  const module = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
  const html = module.remoteHtml("test-nonce");
  const script = html.match(
    /<script nonce="test-nonce">([\s\S]*?)<\/script>/,
  )?.[1];
  assert.ok(script, "remote app inline script must be present");
  assert.doesNotThrow(
    () => new vm.Script(script, { filename: "relay-remote-inline.js" }),
  );
  assert.match(html, /height:\s*100dvh/);
  assert.match(html, /safe-area-inset-bottom/);
  assert.match(html, /\.sheet\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(html, /\.composer-wrap\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(html, /class="send-round/);
  assert.ok(script.includes("conversationsSheet"));
  assert.ok(script.includes("providerSheet"));
  assert.ok(script.includes("modelSheet"));
  assert.ok(script.includes("patchChat"));
  assert.ok(script.includes("openSheet"));
  assert.doesNotMatch(script, /Conversazioni del progetto/);
  assert.doesNotMatch(html, /\sonclick=/);
  assert.match(html, /data-action=/);

  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "http://127.0.0.1:41700/",
  });
  const { window } = dom;
  const state = {
    workspace: { id: "p1", name: "Demo", cwd: "/tmp/demo", isGit: true },
    projects: [
      {
        id: "p1",
        name: "Demo",
        path: "/tmp/demo",
        isGit: true,
        lastOpenedAt: new Date().toISOString(),
      },
    ],
    providers: [
      {
        id: "codex",
        label: "Codex",
        available: true,
        authenticated: true,
        healthState: "ready",
        models: [
          {
            id: "gpt-mini",
            label: "GPT Mini",
            isDefault: true,
            reasoning: [{ id: "low", label: "Low" }],
          },
        ],
      },
      {
        id: "claude",
        label: "Claude Code",
        available: true,
        authenticated: true,
        connected: true,
        healthState: "ready",
        models: [
          { id: "sonnet", label: "Sonnet", isDefault: true, reasoning: [] },
        ],
      },
    ],
    usage: [],
    conversation: {
      id: "c1",
      projectId: "p1",
      title: "Demo chat",
      provider: "codex",
      model: "gpt-mini",
      reasoning: "low",
      permission: "workspace-write",
      messages: [
        {
          id: "u1",
          role: "user",
          text: "Ciao",
          createdAt: new Date().toISOString(),
        },
        {
          id: "a1",
          role: "assistant",
          provider: "codex",
          text: "File e sito pronti: https://example.com/docs e http://localhost:4173/",
          createdAt: new Date().toISOString(),
          artifacts: [
            {
              id: "file-1",
              kind: "file",
              name: "report-con-un-nome-molto-lungo-per-il-download.md",
              relativePath: "report.md",
              mimeType: "text/markdown",
              size: 42,
              createdAt: new Date().toISOString(),
            },
            {
              id: "site-1",
              kind: "static-site",
              name: "index.html",
              relativePath: "site/index.html",
              mimeType: "text/html",
              size: 120,
              createdAt: new Date().toISOString(),
            },
            {
              id: "image-1",
              kind: "file",
              name: "screen.png",
              relativePath: "screen.png",
              mimeType: "image/png",
              size: 2048,
              createdAt: new Date().toISOString(),
            },
            {
              id: "service-1",
              kind: "local-service",
              name: "localhost:4173",
              localUrl: "http://localhost:4173/",
              createdAt: new Date().toISOString(),
            },
            {
              id: "bundle-1",
              kind: "bundle",
              name: "demo-files.zip",
              files: ["report.md", "site/index.html", "screen.png"],
              mimeType: "application/zip",
              size: 2210,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      delegations: [],
    },
    conversations: [
      {
        id: "c1",
        projectId: "p1",
        title: "Demo chat",
        provider: "codex",
        messageCount: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        id: "c2",
        projectId: "p1",
        title: "Analisi recente",
        provider: "claude",
        messageCount: 3,
        updatedAt: new Date(Date.now() - 60_000).toISOString(),
      },
    ],
    agents: [],
    rules: [],
    activeRuns: [],
    projectConversations: { p1: [] },
    remoteAccess: { computerName: "demo-pc" },
  };
  let stateFetches = 0;
  let actionCalls = 0;
  let resolveAction;
  window.fetch = async (url) => {
    const path = String(url);
    if (path.includes("/api/action")) {
      actionCalls += 1;
      await new Promise((resolve) => {
        resolveAction = resolve;
      });
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true };
        },
      };
    }
    if (path.includes("/api/preview-ticket")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { url: "/preview-access/grant-1/c1/a1/site-1/" };
        },
      };
    }
    stateFetches += 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return state;
      },
    };
  };
  window.EventSource = class {
    constructor() {
      this.listeners = {};
      window.__relayEventSource = this;
    }
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }
    close() {}
    emit(type, data) {
      if (this.listeners[type])
        this.listeners[type]({
          data: data === undefined ? "" : JSON.stringify(data),
        });
    }
  };
  window.navigator.clipboard = { async writeText() {} };
  window.eval(script);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const thread = window.document.getElementById("thread");
  assert.ok(thread, "chat thread must render");
  assert.equal(
    window.document.querySelectorAll(".artifact-card").length,
    4,
    "non-bundle assistant artifacts must render as compact typed rows",
  );
  assert.ok(
    window.document.querySelector('[data-action="download-artifact:1:0"]'),
    "file result must expose an authenticated download action",
  );
  assert.ok(
    window.document.querySelector(".artifact-group"),
    "multiple results must render in a collapsible group",
  );
  assert.match(
    window.document.querySelector(".artifact-group summary")?.textContent || "",
    /Risultati\s*4/,
  );
  assert.ok(
    window.document.querySelector('[data-action="download-artifact:1:4"]'),
    "bundle must expose a compact ZIP action",
  );
  assert.equal(
    window.document.querySelectorAll(".artifact-thumb").length,
    0,
    "minimal result rows must not reserve space for oversized thumbnails",
  );
  assert.ok(
    window.document.querySelector(
      '[data-action="copy-artifact-path:report.md"]',
    ),
    "file result must expose copy path",
  );
  assert.ok(
    window.document.querySelectorAll(".message-link").length >= 2,
    "message URLs must render as compact external chips",
  );
  assert.match(
    window.document.querySelector(".message-link-badge")?.textContent || "",
    /via Relay/,
  );
  assert.equal(
    window.document.querySelectorAll(".page-count:empty").length,
    0,
    "empty count pills must not render as mysterious amber controls",
  );
  const previewButton = window.document.querySelector(
    '[data-action="preview-artifact:1:1"]',
  );
  assert.ok(previewButton, "HTML result must expose an in-app preview action");
  previewButton.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.ok(
    window.document.querySelector(".preview-modal"),
    "preview must open in an isolated overlay",
  );
  assert.match(
    window.document.querySelector("#preview-content")?.getAttribute("src") ||
      "",
    /\/preview-access\/grant-1\/c1\/a1\/site-1\//,
  );
  assert.ok(
    window.document.querySelector('[data-action="open-preview-browser"]'),
    "preview header must expose a compact browser action",
  );
  assert.ok(
    window.document.querySelector('[data-action="share-preview"]'),
    "preview header must expose a compact share action",
  );
  window.document
    .querySelector('[data-action="close-preview"]')
    .dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  Object.defineProperty(thread, "scrollHeight", {
    configurable: true,
    value: 1800,
  });
  Object.defineProperty(thread, "clientHeight", {
    configurable: true,
    value: 500,
  });
  thread.scrollTop = 321;
  const providerButton = window.document.querySelector(
    '[data-action="open-sheet:provider"]',
  );
  assert.ok(providerButton, "provider sheet trigger must render");
  providerButton.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(
    window.document.querySelector("#active-sheet"),
    "provider sheet must render in overlay root",
  );
  assert.equal(
    window.document.getElementById("thread"),
    thread,
    "opening a sheet must preserve the thread node",
  );
  assert.equal(
    thread.scrollTop,
    321,
    "opening a sheet must preserve thread scrollTop",
  );

  window.document
    .querySelector('[data-action="close-sheet"]')
    .dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  window.document
    .querySelector('[data-action="open-drawer"]')
    .dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  await new Promise((resolve) => setTimeout(resolve, 20));
  const drawer = window.document.querySelector(".drawer");
  assert.ok(drawer, "conversation-first drawer must render");
  assert.ok(
    drawer.querySelector("#drawer-search"),
    "drawer must expose conversation search",
  );
  assert.ok(
    drawer.querySelectorAll('[data-action^="conversation:"]').length >= 2,
    "drawer must list recent conversations",
  );
  assert.equal(
    drawer.querySelectorAll(
      '[data-action="section:chat"], [data-action="section:agents"], [data-action="section:usage"], [data-action="section:rules"]',
    ).length,
    0,
    "drawer must not duplicate global bottom navigation",
  );
  assert.equal(
    window.document.getElementById("thread"),
    thread,
    "opening the drawer must preserve the thread node",
  );
  assert.equal(
    thread.scrollTop,
    321,
    "opening the drawer must preserve thread scrollTop",
  );

  window.document
    .querySelector('[data-action="close-drawer"]')
    .dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );

  const stablePrompt = window.document.getElementById("prompt");
  stablePrompt.value = "Bozza lunga che deve mantenere il cursore";
  stablePrompt.dispatchEvent(new window.Event("input", { bubbles: true }));
  stablePrompt.focus();
  stablePrompt.setSelectionRange(6, 12);
  window.__relayEventSource.emit("state", state);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(
    window.document.getElementById("prompt"),
    stablePrompt,
    "identical composer signature must preserve textarea node identity",
  );
  assert.equal(
    window.document.activeElement,
    stablePrompt,
    "identical composer signature must preserve focus",
  );
  assert.equal(
    stablePrompt.selectionStart,
    6,
    "identical composer signature must preserve caret start",
  );
  assert.equal(
    stablePrompt.selectionEnd,
    12,
    "identical composer signature must preserve caret end",
  );

  state.conversation.model = "gpt-mini-next";
  window.__relayEventSource.emit("state", state);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const replacedPrompt = window.document.getElementById("prompt");
  assert.notEqual(
    replacedPrompt,
    stablePrompt,
    "changed composer signature must replace the composer",
  );
  assert.equal(
    window.document.activeElement,
    replacedPrompt,
    "changed composer signature must restore focus",
  );
  assert.equal(
    replacedPrompt.selectionStart,
    6,
    "changed composer signature must restore caret start",
  );
  assert.equal(
    replacedPrompt.selectionEnd,
    12,
    "changed composer signature must restore caret end",
  );
  state.conversation.model = "gpt-mini";
  window.__relayEventSource.emit("state", state);
  await new Promise((resolve) => setTimeout(resolve, 30));

  const prompt = window.document.getElementById("prompt");
  prompt.value = "Messaggio remoto senza ritardo";
  prompt.dispatchEvent(new window.Event("input", { bubbles: true }));
  window.document
    .getElementById("composer-form")
    .dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(
    actionCalls,
    1,
    "submitting remotely must dispatch the action immediately",
  );
  assert.equal(
    window.document.getElementById("prompt")?.value || "",
    "",
    "composer must clear immediately while the action is in flight",
  );
  assert.equal(
    window.sessionStorage.getItem("relay_draft"),
    null,
    "sent text must not remain persisted as a draft",
  );
  assert.match(
    window.document.querySelector(".message-wrap.optimistic")?.textContent ||
      "",
    /Messaggio remoto senza ritardo/,
    "the thread must show an optimistic local echo immediately",
  );
  const fetchesBeforeActionAck = stateFetches;
  resolveAction();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(
    stateFetches,
    fetchesBeforeActionAck,
    "send acknowledgement must not trigger a redundant state fetch before SSE",
  );
  state.conversation.messages.push({
    role: "user",
    text: "Messaggio remoto senza ritardo",
    createdAt: new Date().toISOString(),
  });
  state.activeRuns = [
    {
      id: "run-send",
      conversationId: "c1",
      provider: "codex",
      phase: "queued",
      status: "In coda…",
      startedAt: new Date().toISOString(),
      activities: [],
    },
  ];
  window.__relayEventSource.emit("state", state);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(
    stateFetches,
    fetchesBeforeActionAck,
    "full SSE state must update the UI without another HTTP round trip",
  );
  assert.equal(
    window.document.querySelector(".message-wrap.optimistic"),
    null,
    "optimistic echo must reconcile with the persisted user message",
  );
  assert.equal(
    window.document.getElementById("prompt")?.value || "",
    "",
    "composer must stay empty after the run begins",
  );

  state.activeRuns = [
    {
      id: "run-1",
      conversationId: "c1",
      provider: "codex",
      phase: "starting-session",
      status: "starting-session",
      startedAt: new Date(Date.now() - 24_000).toISOString(),
      activities: [{ title: "Avvio sessione", detail: "starting-session" }],
    },
  ];
  window.__relayEventSource.emit("state", state);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.match(
    window.document.querySelector(".live-phase")?.textContent || "",
    /Preparazione della sessione/,
  );
  assert.doesNotMatch(
    window.document.querySelector(".live-card")?.textContent || "",
    /starting-session/,
  );
  assert.equal(
    window.document.querySelectorAll(".send-round.stop").length,
    1,
    "an active run must expose one stop control only",
  );
  assert.equal(
    window.document.querySelectorAll(
      '.live-card [aria-label="Interrompi task"], .live-card [data-action*="cancel"]',
    ).length,
    0,
    "live card must not duplicate the stop action",
  );
  assert.ok(
    window.document.querySelector(".composer-compact"),
    "an active run must collapse the composer instead of covering the live card",
  );
  assert.match(
    window.document.querySelector(".compact-run-copy")?.textContent || "",
    /Codex/,
    "compact run composer must preserve provider context",
  );
  assert.equal(
    window.document.querySelectorAll(
      '.composer [data-action*="attachment"], .composer [aria-label*="allegat" i]',
    ).length,
    0,
    "remote composer must not show unsupported attachment controls",
  );

  state.activeRuns = [];
  state.conversation.messages.push({
    id: "err-1",
    role: "assistant",
    provider: "codex",
    runId: "failed-1",
    error: true,
    text: "Codex non è riuscito ad avviare il comando.",
    createdAt: new Date().toISOString(),
  });
  window.__relayEventSource.emit("state", state);
  await new Promise((resolve) => setTimeout(resolve, 40));
  const recoveryButton = window.document.querySelector(
    '[data-action="resolve-run:failed-1"]',
  );
  assert.ok(
    recoveryButton,
    "failed mobile messages must expose cross-provider recovery",
  );
  assert.match(recoveryButton.getAttribute("title") || "", /Claude Code/);
  assert.match(recoveryButton.textContent || "", /Risolvi/);

  let visibilityState = "hidden";
  Object.defineProperty(window.document, "visibilityState", {
    configurable: true,
    get() {
      return visibilityState;
    },
  });
  const fetchesBeforeResume = stateFetches;
  visibilityState = "visible";
  window.document.dispatchEvent(new window.Event("visibilitychange"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(
    stateFetches > fetchesBeforeResume,
    "returning to a visible page must refresh state immediately",
  );

  const reconnectSource = window.__relayEventSource;
  reconnectSource.onerror();
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(
    window.document
      .getElementById("reconnect-overlay")
      .classList.contains("show"),
    false,
    "reconnect overlay must not flash before the 800ms threshold",
  );
  await new Promise((resolve) => setTimeout(resolve, 560));
  assert.equal(
    window.document
      .getElementById("reconnect-overlay")
      .classList.contains("show"),
    true,
    "reconnect overlay must appear after a sustained disconnect",
  );
  reconnectSource.emit("hello");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(
    window.document
      .getElementById("reconnect-overlay")
      .classList.contains("show"),
    false,
    "successful reconnection must hide the overlay",
  );

  window.fetch = async () => ({
    ok: false,
    status: 401,
    async json() {
      return { error: "expired" };
    },
  });
  window.dispatchEvent(new window.Event("pageshow"));
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.match(
    window.document.body.textContent || "",
    /Sessione scaduta, ricollega il dispositivo\./,
    "401 after resume must return cleanly to pairing",
  );
  dom.window.close();

  const pairingDom = new JSDOM(html, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://relay-test.tail123.ts.net/",
  });
  const pairingWindow = pairingDom.window;
  let pairingStateReady = false;
  let submittedPairing;
  pairingWindow.fetch = async (url, options = {}) => {
    const path = String(url);
    if (path === "/api/pairing") {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ticket: "fresh-server-ticket",
            instanceId: "server-instance",
            used: false,
          };
        },
      };
    }
    if (path === "/api/pair") {
      submittedPairing = JSON.parse(String(options.body || "{}"));
      pairingStateReady = true;
      return {
        ok: true,
        status: 200,
        async json() {
          return { token: "paired-token-value", sessionId: "session-1" };
        },
      };
    }
    if (path === "/api/state" && pairingStateReady) {
      return {
        ok: true,
        status: 200,
        async json() {
          return state;
        },
      };
    }
    return {
      ok: false,
      status: 401,
      async json() {
        return { error: "Sessione remota non valida." };
      },
    };
  };
  pairingWindow.EventSource = class {
    addEventListener() {}
    close() {}
  };
  pairingWindow.navigator.clipboard = { async writeText() {} };
  pairingWindow.eval(script);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const pairingInputs = [
    ...pairingWindow.document.querySelectorAll("[data-otp]"),
  ];
  assert.equal(
    pairingInputs.length,
    6,
    "pairing screen must render after an unauthenticated state response",
  );
  "123456".split("").forEach((digit, index) => {
    pairingInputs[index].value = digit;
    pairingInputs[index].dispatchEvent(
      new pairingWindow.Event("input", { bubbles: true }),
    );
  });
  pairingWindow.document
    .getElementById("pair-button")
    .dispatchEvent(
      new pairingWindow.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }),
    );
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(
    submittedPairing.ticket,
    "fresh-server-ticket",
    "mobile pairing must refresh the current server ticket when the QR query is missing or stale",
  );
  assert.equal(submittedPairing.code, "123456");
  pairingDom.window.close();

  console.log("Remote app syntax test");
  console.log(
    "  PASS generated mobile script parses, sheets overlay without moving the thread, and contains no inline handlers",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
