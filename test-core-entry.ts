import assert from "node:assert/strict";
import {
  inferCopilotPlanFromAllowance,
  parseCopilotBillingUsage,
  parseCopilotModels,
  parseCopilotVersion,
} from "./src/providers/copilot-provider.js";
import {
  parseAntigravityLegacyStatus,
  parseAntigravityQuotaSummary,
} from "./src/services/antigravity-local-usage.js";
import { mergeAntigravityUsageSnapshots } from "./src/providers/antigravity-provider.js";
import { requiresAntigravityBrowser } from "./src/services/antigravity-routing.js";
import { antigravitySubmitCommands } from "./src/services/antigravity-native-bridge.js";
import { normalizeCodexUsage } from "./src/providers/codex-provider.js";
import {
  fallbackClaudeUsage,
  isTerminalClaudeRateLimitEvent,
  parseClaudeSubscriptionUsage,
} from "./src/providers/claude-provider.js";
import {
  mergeUsageSnapshots,
  shouldRetryUsageSnapshot,
  usageRetryDelays,
} from "./src/services/usage-state.js";
import {
  preferredUsageBucket,
  withPreferredUsage,
} from "./src/services/usage-selection.js";
import { resolveDelegationModelSelection } from "./src/services/model-capabilities.js";
import type { UsageSnapshot } from "./src/core/types.js";
import { inferDelegationPermission } from "./src/services/delegation-policy.js";
import {
  BUNDLED_AGENT_TEMPLATES,
  instantiateBundledTemplates,
} from "./src/services/agent-templates.js";
import {
  ATTACHMENT_RETENTION_MS,
  AttachmentStore,
  formatAttachmentPromptBlock,
  sanitizeAttachmentName,
} from "./src/services/attachment-store.js";
import {
  consumePendingExtensionUpdate,
  installVsixWithFallback,
  resolveVsixUpdatePath,
  writePendingExtensionUpdate,
} from "./src/services/extension-update.js";

function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log("  PASS", name);
  } catch (error) {
    console.error("  FAIL", name);
    throw error;
  }
}

console.log("provider parsers");
check("Copilot version strips update sentence", () => {
  assert.equal(
    parseCopilotVersion(
      "GitHub Copilot CLI 1.0.70. Run 'copilot update' to check for updates.",
    ),
    "1.0.70",
  );
});

check("Copilot billing aggregates model usage", () => {
  const parsed = parseCopilotBillingUsage(
    JSON.stringify({
      usageItems: [
        { model: "gpt-5", grossQuantity: 12 },
        { model: "claude-sonnet-4", grossQuantity: 7 },
        { model: "gpt-5", grossQuantity: 3 },
      ],
    }),
    "requests",
  );
  assert.equal(
    parsed.buckets?.find((bucket) => bucket.id === "requests-total")?.used,
    22,
  );
  assert.equal(
    parsed.buckets?.find((bucket) => bucket.label === "gpt-5")?.used,
    15,
  );
  assert.equal(
    parsed.buckets?.find((bucket) => bucket.label === "claude-sonnet-4")?.used,
    7,
  );
  assert.equal(
    parsed.buckets?.find((bucket) => bucket.id === "requests-total")?.label,
    "Totale mese",
  );
  assert.equal(
    parsed.buckets?.find((bucket) => bucket.label === "gpt-5")?.group,
    "Richieste per modello",
  );
});

check("Copilot billing ignores empty usage lists without an allowance", () => {
  const parsed = parseCopilotBillingUsage(JSON.stringify({ usageItems: [] }), "credits");
  assert.equal(parsed.buckets, undefined);
});

check("Copilot billing keeps zero usage when GitHub reports an allowance", () => {
  const parsed = parseCopilotBillingUsage(JSON.stringify({ usageItems: [], includedQuantity: 1500 }), "credits");
  const total = parsed.buckets?.find((bucket) => bucket.id === "credits-total");
  assert.equal(total?.used, 0);
  assert.equal(total?.limit, 1500);
  assert.equal(total?.remainingFraction, 1);
});

check("Claude subscription-only usage is treated as active but non numeric", () => {
  const parsed = parseClaudeSubscriptionUsage(
    "You are currently using your subscription to power your Claude Code usage",
  );
  assert.ok(parsed);
  assert.equal(parsed?.remainingFraction, undefined);
  assert.match(parsed?.lastError ?? "", /non espone una quota numerica/i);
});

check(
  "Copilot model inventory follows CLI help instead of adding unsupported fallbacks",
  () => {
    const models = parseCopilotModels(
      `Options:
  --model <model> choices: auto, gpt-5.4, gemini-3.5-flash
  --effort <level>`,
      false,
    );
    assert.deepEqual(
      models.map((model) => model.id),
      ["auto", "gemini-3.5-flash", "gpt-5.4"],
    );
    assert.equal(
      models.find((model) => model.id === "gemini-3.5-flash")?.reasoning.length,
      0,
    );
    assert.ok(
      (models.find((model) => model.id === "gpt-5.4")?.reasoning.length ?? 0) >
        0,
    );
  },
);

check("Copilot plan is inferred only from a returned allowance", () => {
  assert.equal(
    inferCopilotPlanFromAllowance(1500),
    "Copilot Pro · 1.500 AI Credits/mese",
  );
  assert.equal(inferCopilotPlanFromAllowance(undefined), undefined);
});

check(
  "Copilot model discovery falls back from auto-only option text to Supported models",
  () => {
    const models = parseCopilotModels(
      `Options:
  --model=MODEL Set the model. Pass auto for automatic routing.
  --effort=LEVEL

Supported models
  claude-sonnet-4.6 General purpose
  gpt-5.4 Complex reasoning
  gemini-3.5-flash Fast

Tool availability values`,
      false,
    );
    assert.deepEqual(
      models.map((model) => model.id),
      ["auto", "claude-sonnet-4.6", "gemini-3.5-flash", "gpt-5.4"],
    );
  },
);

check(
  "Repair delegations receive full task access while analysis remains restricted",
  () => {
    assert.equal(
      inferDelegationPermission({
        task: {
          provider: "claude",
          prompt: "Risolvi il bug, applica il fix e rifai la build.",
        },
        originalPrompt: "Delega a Claude la correzione completa.",
        agentPermission: "read-only",
        providerDefault: "workspace-write",
      }),
      "danger-full-access",
    );
    assert.equal(
      inferDelegationPermission({
        task: {
          provider: "claude",
          prompt: "Fai solo analisi statica e non modificare nulla.",
        },
        originalPrompt: "Trova la causa del bug.",
        agentPermission: "read-only",
        providerDefault: "workspace-write",
      }),
      "read-only",
    );
    assert.equal(
      inferDelegationPermission({
        task: {
          provider: "antigravity",
          prompt:
            "Adesso risolvi il problema, modifica il codice e rifai la build.",
        },
        originalPrompt:
          "Contesto precedente: prima era stata richiesta solo analisi e di non modificare nulla. Ora delega la correzione completa.",
        agentPermission: "read-only",
        providerDefault: "read-only",
      }),
      "danger-full-access",
    );
  },
);

check(
  "Bundled agent library contains five disabled token-saving templates",
  () => {
    assert.equal(BUNDLED_AGENT_TEMPLATES.length, 5);
    const templates = instantiateBundledTemplates("codex", "gpt-mini");
    assert.equal(templates.length, 5);
    assert.ok(
      templates.every(
        (agent) =>
          agent.provider === "codex" &&
          agent.enabled === false &&
          agent.bundledTemplate,
      ),
    );
    assert.ok(
      templates.some((agent) => agent.templateId === "specification-architect"),
    );
    assert.ok(templates.some((agent) => agent.templateId === "bug-finder"));
    assert.ok(
      templates.some((agent) => agent.templateId === "security-auditor"),
    );
    assert.ok(
      templates.some(
        (agent) =>
          agent.templateId === "surgical-fixer" &&
          agent.permission === "danger-full-access",
      ),
    );
  },
);

check(
  "Attachment names are portable on Windows and prompt references stay explicit",
  () => {
    const sanitized = sanitizeAttachmentName("../CON:<report>?*.txt");
    assert.equal(sanitized, "_CON__report___.txt");
    assert.doesNotMatch(sanitized, /[<>:"/\\|?*]/);
    assert.equal(sanitizeAttachmentName("aux."), "_aux");
    const block = formatAttachmentPromptBlock([
      {
        id: "a1",
        name: "report.md",
        mimeType: "text/markdown",
        size: 42,
        localPath: "C:\\Relay Data\\attachments\\id-report.md",
      },
      {
        id: "a2",
        name: "screen.png",
        mimeType: "image/png",
        size: 2048,
        localPath: "/tmp/relay/attachments/id-screen.png",
      },
    ]);
    assert.match(block, /^## Allegati/m);
    assert.match(block, /C:\\Relay Data\\attachments\\id-report\.md/);
    assert.match(block, /\/tmp\/relay\/attachments\/id-screen\.png/);
    assert.match(block, /image\/png, 2048 byte/);
  },
);

check(
  "Delegation model preference distinguishes smart Relay routing from provider auto",
  () => {
    assert.equal(
      resolveDelegationModelSelection({
        configuredModel: "relay-auto",
        smartModel: "gpt-5.6",
        fallbackModel: "auto",
      }),
      "gpt-5.6",
    );
    assert.equal(
      resolveDelegationModelSelection({
        configuredModel: "auto",
        smartModel: "gpt-5.6",
        fallbackModel: "gpt-5.5",
      }),
      "auto",
    );
    assert.equal(
      resolveDelegationModelSelection({
        configuredModel: "claude-sonnet",
        smartModel: "claude-haiku",
        fallbackModel: "auto",
      }),
      "claude-sonnet",
    );
    assert.equal(
      resolveDelegationModelSelection({
        explicitModel: "gpt-5.5",
        agentModel: "gpt-5.4",
        configuredModel: "gpt-5.6",
        smartModel: "mini",
      }),
      "gpt-5.5",
    );
  },
);

check("Antigravity browser routing requires an explicit browser action", () => {
  assert.equal(
    requiresAntigravityBrowser(
      "Apri Chrome, vai su http://localhost:3000 e controlla la console del browser.",
    ),
    true,
  );
  assert.equal(
    requiresAntigravityBrowser("/browser verifica il form di login"),
    true,
  );
  assert.equal(
    requiresAntigravityBrowser(
      "Analizza staticamente il codice del Browser Subagent e la coda pendingWorkerMessages.",
    ),
    false,
  );
  assert.equal(
    requiresAntigravityBrowser(
      "Non serve aprire un browser né eseguire la app: leggi soltanto mixEngine.js e mixWorker.js.",
    ),
    false,
  );
  assert.equal(
    requiresAntigravityBrowser(
      "Non devi delegare ad Antigravity browser, usa Antigravity normale per questa analisi.",
    ),
    false,
  );
  assert.equal(
    requiresAntigravityBrowser(
      "Analizza staticamente mixEngine.js. Il codice contiene Browser Subagent, screenshot, console e network; non serve aprire un browser né eseguire la app.",
    ),
    false,
  );
});

check(
  "Antigravity submit prefers native commands and ignores unrelated submit commands",
  () => {
    const commands = antigravitySubmitCommands([
      "workbench.action.chat.submit",
      "antigravity.agent.submitFeedback",
      "antigravity.agentSidePanel.submit",
      "antigravity.sendPromptToAgentPanel",
    ]);
    assert.deepEqual(commands, [
      "antigravity.agentSidePanel.submit",
      "workbench.action.chat.submit",
    ]);
  },
);

const antigravityPayload = {
  quotaSummary: {
    groups: [
      {
        displayName: "Gemini Models",
        buckets: [
          {
            bucketId: "WEEKLY_LIMIT",
            remaining: { remainingFraction: 0.3 },
            description: "fully refreshes in 1 day 9 hours",
          },
          {
            bucketId: "FIVE_HOUR_LIMIT",
            remaining: { remainingFraction: 1 },
            description: "fully refreshes in 4 hours",
          },
        ],
      },
      {
        displayName: "Claude and GPT models",
        buckets: [
          {
            bucketId: "WEEKLY_LIMIT",
            remaining: { remainingFraction: 0.07 },
            description: "fully refreshes in 2 days 1 hour",
          },
          {
            bucketId: "FIVE_HOUR_LIMIT",
            remaining: { remainingFraction: 0.97 },
            description: "fully refreshes in 4 hours 51 minutes",
          },
        ],
      },
    ],
  },
};

check("Antigravity summary reads all four grouped windows", () => {
  const parsed = parseAntigravityQuotaSummary(antigravityPayload);
  assert.equal(parsed.buckets?.length, 4);
  assert.equal(
    parsed.buckets?.find(
      (bucket) => bucket.group === "Gemini" && bucket.kind === "weekly",
    )?.remainingFraction,
    0.3,
  );
  assert.equal(
    parsed.buckets?.find(
      (bucket) => bucket.group === "Gemini" && bucket.kind === "five-hour",
    )?.remainingFraction,
    1,
  );
  assert.equal(
    parsed.buckets?.find(
      (bucket) => bucket.group === "Claude e GPT" && bucket.kind === "weekly",
    )?.remainingFraction,
    0.07,
  );
  assert.equal(
    parsed.buckets?.find(
      (bucket) =>
        bucket.group === "Claude e GPT" && bucket.kind === "five-hour",
    )?.remainingFraction,
    0.97,
  );
});

check("Antigravity legacy model configs preserve both pools", () => {
  const parsed = parseAntigravityLegacyStatus({
    userStatus: {
      cascadeModelConfigData: {
        clientModelConfigs: [
          {
            modelOrAlias: { model: "gemini-3.5-flash" },
            quotaInfo: {
              remainingFraction: 1,
              resetTime: "2026-07-16T16:00:00Z",
            },
          },
          {
            modelOrAlias: { model: "claude-sonnet-4.6" },
            quotaInfo: {
              remainingFraction: 0.97,
              resetTime: "2026-07-16T16:51:00Z",
            },
          },
        ],
      },
    },
  });
  assert.equal(parsed.buckets?.length, 2);
  assert.equal(
    parsed.buckets?.find((bucket) => bucket.group === "Gemini")
      ?.remainingFraction,
    1,
  );
  assert.equal(
    parsed.buckets?.find((bucket) => bucket.group === "Claude e GPT")
      ?.remainingFraction,
    0.97,
  );
});

check(
  "Antigravity merges partial sources without overwriting exact local values",
  () => {
    const now = new Date().toISOString();
    const first: UsageSnapshot = {
      provider: "antigravity",
      available: true,
      updatedAt: now,
      buckets: [
        {
          id: "gemini-weekly",
          label: "Settimanale",
          group: "Gemini",
          kind: "weekly",
          remainingFraction: 0.3,
        },
      ],
    };
    const second: UsageSnapshot = {
      provider: "antigravity",
      available: true,
      updatedAt: now,
      buckets: [
        {
          id: "gemini-weekly-cache",
          label: "Settimanale",
          group: "Gemini",
          kind: "weekly",
          remainingFraction: 0.25,
        },
        {
          id: "gemini-five",
          label: "5 ore",
          group: "Gemini",
          kind: "five-hour",
          remainingFraction: 1,
        },
        {
          id: "other-weekly",
          label: "Settimanale",
          group: "Claude e GPT",
          kind: "weekly",
          remainingFraction: 0.07,
        },
        {
          id: "other-five",
          label: "5 ore",
          group: "Claude e GPT",
          kind: "five-hour",
          remainingFraction: 0.97,
        },
      ],
    };
    const merged = mergeAntigravityUsageSnapshots([first, second]);
    assert.equal(merged?.buckets?.length, 4);
    assert.equal(
      merged?.buckets?.find(
        (bucket) => bucket.group === "Gemini" && bucket.kind === "weekly",
      )?.remainingFraction,
      0.3,
    );
  },
);

check(
  "Antigravity headline always uses the selected family five-hour window",
  () => {
    const parsed = parseAntigravityQuotaSummary(antigravityPayload);
    const usage: UsageSnapshot = {
      provider: "antigravity",
      available: true,
      updatedAt: new Date().toISOString(),
      ...parsed,
    };
    const gemini = withPreferredUsage("antigravity", usage, "Gemini 3.5 Flash");
    const claude = withPreferredUsage(
      "antigravity",
      usage,
      "Claude Sonnet 4.6",
    );
    assert.equal(gemini?.remainingFraction, 1);
    assert.equal(claude?.remainingFraction, 0.97);
    assert.equal(
      preferredUsageBucket("antigravity", usage.buckets)?.remainingFraction,
      0.97,
    );
  },
);

check(
  "Usage merge never lets Antigravity weekly quota drive the headline",
  () => {
    const parsed = parseAntigravityQuotaSummary(antigravityPayload);
    const now = new Date().toISOString();
    const merged = mergeUsageSnapshots(
      ["antigravity"],
      [],
      [{ provider: "antigravity", available: true, updatedAt: now, ...parsed }],
      now,
    );
    assert.equal(merged[0]?.remainingFraction, 0.97);
  },
);

check("Codex usage is normalized into the same grouped window model", () => {
  const parsed = normalizeCodexUsage({
    rateLimits: {
      limitId: "codex",
      limitName: "Codex",
      primary: {
        usedPercent: 20,
        windowDurationMins: 300,
        resetsAt: "2026-07-16T18:00:00Z",
      },
      secondary: {
        usedPercent: 55,
        windowDurationMins: 10080,
        resetsAt: "2026-07-20T00:00:00Z",
      },
    },
  });
  assert.equal(
    parsed.buckets?.find((bucket) => bucket.kind === "five-hour")?.group,
    "Codex",
  );
  assert.equal(
    parsed.buckets?.find((bucket) => bucket.kind === "five-hour")?.label,
    "5 ore",
  );
  assert.equal(parsed.remainingFraction, 0.8);
});

console.log("\nALL CORE CHECKS PASSED");

import { RemoteAccessServer } from "./src/services/remote-access-server.js";
import {
  TunnelManager,
  buildTailscaleBaseUrl,
  collectServePorts,
  extractTailscaleApprovalUrl,
  extractTailscaleLoginUrl,
  parseTailscaleStatus,
  selectTailscalePort,
  tailscaleInstallPlan,
} from "./src/services/tunnel-manager.js";
import {
  componentInstallPlan,
  missingProviderInstallerComponent,
  type SystemReadinessSnapshot,
} from "./src/services/system-readiness.js";

const fakeReadiness: SystemReadinessSnapshot = {
  checkedAt: new Date().toISOString(),
  platform: "win32",
  arch: "x64",
  components: [
    {
      id: "runtime",
      label: "Runtime Relay",
      state: "ready",
      detail: "",
      requiredFor: [],
      installable: false,
    },
    {
      id: "node",
      label: "Node.js",
      state: "missing",
      detail: "",
      requiredFor: [],
      installable: true,
    },
    {
      id: "npm",
      label: "npm",
      state: "missing",
      detail: "",
      requiredFor: [],
      installable: true,
    },
    {
      id: "powershell",
      label: "PowerShell",
      state: "ready",
      detail: "",
      requiredFor: [],
      installable: true,
    },
    {
      id: "winget",
      label: "WinGet",
      state: "ready",
      detail: "",
      requiredFor: [],
      installable: false,
    },
  ],
  features: {
    remote: { ready: true, title: "Remoto", detail: "", missing: [] },
    parallelWrites: {
      ready: false,
      title: "Git",
      detail: "",
      missing: ["git"],
    },
    browserAutomation: {
      ready: false,
      title: "Browser",
      detail: "",
      missing: ["browser"],
    },
  },
};
check("System wizard keeps remote ready without external Node", () => {
  assert.equal(fakeReadiness.features.remote.ready, true);
  assert.equal(
    missingProviderInstallerComponent("codex", fakeReadiness),
    "node",
  );
  assert.match(
    componentInstallPlan("node", fakeReadiness)?.command ?? "",
    /winget install/i,
  );
});

check(
  "System wizard accepts Copilot without PowerShell when WinGet is available",
  () => {
    const missingPowerShell: SystemReadinessSnapshot = {
      ...fakeReadiness,
      components: fakeReadiness.components.map((entry) =>
        entry.id === "powershell"
          ? { ...entry, state: "missing" as const }
          : entry,
      ),
    };
    assert.equal(
      missingProviderInstallerComponent("copilot", missingPowerShell),
      undefined,
    );
    const npmFallback: SystemReadinessSnapshot = {
      ...fakeReadiness,
      components: [
        {
          id: "runtime",
          label: "Runtime",
          state: "ready",
          detail: "",
          requiredFor: [],
          installable: false,
        },
        {
          id: "powershell",
          label: "PowerShell",
          state: "ready",
          detail: "",
          requiredFor: [],
          installable: true,
        },
        {
          id: "winget",
          label: "WinGet",
          state: "missing",
          detail: "",
          requiredFor: [],
          installable: false,
        },
        {
          id: "node",
          label: "Node.js",
          state: "outdated",
          detail: "serve 22+",
          version: "v20.19.0",
          requiredFor: [],
          installable: true,
        },
        {
          id: "npm",
          label: "npm",
          state: "ready",
          detail: "",
          requiredFor: [],
          installable: true,
        },
      ],
    };
    assert.equal(
      missingProviderInstallerComponent("copilot", npmFallback),
      "node",
    );
    assert.match(
      componentInstallPlan("powershell", fakeReadiness)?.command ?? "",
      /Microsoft\.PowerShell/,
    );
  },
);

check("System wizard chooses native macOS and Linux installation paths", () => {
  const mac: SystemReadinessSnapshot = {
    ...fakeReadiness,
    platform: "darwin",
    components: [
      {
        id: "runtime",
        label: "Runtime",
        state: "ready",
        detail: "",
        requiredFor: [],
        installable: false,
      },
      {
        id: "brew",
        label: "Homebrew",
        state: "ready",
        detail: "",
        requiredFor: [],
        installable: false,
      },
      {
        id: "git",
        label: "Git",
        state: "missing",
        detail: "",
        requiredFor: [],
        installable: true,
      },
    ],
  };
  const linux: SystemReadinessSnapshot = {
    ...fakeReadiness,
    platform: "linux",
    components: [
      {
        id: "runtime",
        label: "Runtime",
        state: "ready",
        detail: "",
        requiredFor: [],
        installable: false,
      },
      {
        id: "apt",
        label: "APT",
        state: "ready",
        detail: "",
        requiredFor: [],
        installable: false,
      },
      {
        id: "curl",
        label: "curl",
        state: "missing",
        detail: "",
        requiredFor: [],
        installable: true,
      },
    ],
  };
  assert.match(
    componentInstallPlan("git", mac)?.command ?? "",
    /brew install git/,
  );
  assert.match(
    componentInstallPlan("curl", linux)?.command ?? "",
    /apt-get install -y curl/,
  );
});

console.log("tailscale tunnel manager");
check("Tailscale status parser handles login and running fixtures", () => {
  assert.equal(
    parseTailscaleStatus('{"BackendState":"NeedsLogin"}').BackendState,
    "NeedsLogin",
  );
  const running = parseTailscaleStatus(
    '{"BackendState":"Running","Self":{"DNSName":"relay-pc.tail123.ts.net."}}',
  );
  assert.equal(running.BackendState, "Running");
  assert.equal(running.Self?.DNSName, "relay-pc.tail123.ts.net.");
});
check(
  "Tailscale URL and login extraction avoid human-output parsing for status",
  () => {
    assert.equal(
      buildTailscaleBaseUrl("relay-pc.tail123.ts.net.", 443),
      "https://relay-pc.tail123.ts.net",
    );
    assert.equal(
      buildTailscaleBaseUrl("relay-pc.tail123.ts.net.", 8443),
      "https://relay-pc.tail123.ts.net:8443",
    );
    assert.equal(
      extractTailscaleLoginUrl(
        "To authenticate, visit: https://login.tailscale.com/a/abc-123",
      ),
      "https://login.tailscale.com/a/abc-123",
    );
    assert.equal(
      extractTailscaleApprovalUrl(
        "Approve Funnel: https://login.tailscale.com/admin/funnel?node=abc",
      ),
      "https://login.tailscale.com/admin/funnel?node=abc",
    );
    assert.equal(
      extractTailscaleApprovalUrl(
        "Docs: https://tailscale.com/docs/features/tailscale-funnel",
      ),
      undefined,
    );
  },
);
check(
  "Tailscale port selection preserves existing Serve configurations",
  () => {
    const serve = {
      Web: {
        "relay.tail.ts.net:443": {
          Handlers: { "/": { Proxy: "http://127.0.0.1:9000" } },
        },
        "relay.tail.ts.net:8443": {
          Handlers: { "/": { Proxy: "http://127.0.0.1:9100" } },
        },
      },
    };
    const port = selectTailscalePort(serve, {}, "http://127.0.0.1:7777");
    assert.equal(port, 10000);
    assert.deepEqual(
      [...collectServePorts(serve).keys()].sort((a, b) => a - b),
      [443, 8443],
    );
  },
);
check(
  "Tailscale install plans are platform-specific and official-flow oriented",
  () => {
    assert.match(
      tailscaleInstallPlan("win32").command ?? "",
      /winget install/i,
    );
    assert.match(
      tailscaleInstallPlan("linux").command ?? "",
      /tailscale\.com\/install\.sh/,
    );
    assert.match(
      tailscaleInstallPlan("darwin").url ?? "",
      /tailscale\.com\/download\/mac/,
    );
  },
);
await (async () => {
  let statusCalls = 0;
  const manager = new TunnelManager({
    platform: "linux",
    resolve: async () => ({
      configured: "tailscale",
      path: "/tmp/tailscale",
      source: "known-location",
      env: {},
    }),
    run: async (_executable, args) => {
      if (args[0] === "version")
        return { stdout: "1.96.3\n", stderr: "", exitCode: 0 };
      if (args[0] === "status") {
        statusCalls += 1;
        return {
          stdout: JSON.stringify({
            BackendState: "Running",
            Self: { DNSName: "relay-pc.tail123.ts.net." },
          }),
          stderr: "",
          exitCode: 0,
        };
      }
      if (args[0] === "serve" && args[1] === "status")
        return { stdout: "{}", stderr: "", exitCode: 0 };
      if (args[0] === "funnel" && args[1] === "status")
        return { stdout: "{}", stderr: "", exitCode: 0 };
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    fetch: async () => {
      throw Object.assign(
        new Error("getaddrinfo ENOTFOUND relay-pc.tail123.ts.net"),
        { code: "ENOTFOUND" },
      );
    },
  });
  const detected = await manager.detect({
    mode: "funnel",
    localPort: 7777,
    force: true,
  });
  check("Tunnel detection uses BackendState and Self.DNSName", () => {
    assert.equal(detected.backendState, "Running");
    assert.equal(detected.dnsName, "relay-pc.tail123.ts.net");
    assert.equal(detected.state, "FUNNEL_NEEDS_ENABLE");
    assert.ok(statusCalls >= 1);
  });
})();
await (async () => {
  let activated = false;
  const commands: string[] = [];
  const manager = new TunnelManager({
    platform: "darwin",
    resolve: async () => ({
      configured: "tailscale",
      path: "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
      source: "known-location",
      env: {},
    }),
    run: async (_executable, args) => {
      commands.push(args.join(" "));
      if (args[0] === "version")
        return { stdout: "1.98.9\n", stderr: "", exitCode: 0 };
      if (args[0] === "status")
        return {
          stdout: JSON.stringify({
            BackendState: "Running",
            Self: { DNSName: "relay-mac.tail123.ts.net." },
          }),
          stderr: "",
          exitCode: 0,
        };
      if (args[0] === "serve" && args[1] === "status")
        return { stdout: "{}", stderr: "", exitCode: 0 };
      if (args[0] === "funnel" && args[1] === "status")
        return {
          stdout: JSON.stringify(
            activated
              ? {
                  Web: {
                    "relay-mac.tail123.ts.net:443": {
                      Handlers: { "/": { Proxy: "http://127.0.0.1:7777" } },
                    },
                  },
                }
              : {},
          ),
          stderr: "",
          exitCode: 0,
        };
      if (args[0] === "funnel") {
        activated = true;
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    fetch: async () => new Response('{"ok":true}', { status: 200 }),
  });
  const active = await manager.activate({
    mode: "funnel",
    localPort: 7777,
    force: true,
  });
  check(
    "macOS GUI CLI port proxy is capability-tested instead of pre-emptively blocked",
    () => {
      assert.equal(active.state, "ACTIVE");
      assert.ok(
        commands.some((command) =>
          command.startsWith("funnel --bg --https=443 http://127.0.0.1:7777"),
        ),
      );
    },
  );
})();
await (async () => {
  let activated = false;
  let probeCalls = 0;
  const commands: string[] = [];
  const manager = new TunnelManager({
    platform: "win32",
    resolve: async () => ({
      configured: "tailscale",
      path: "C:\\Program Files\\Tailscale\\tailscale.exe",
      source: "known-location",
      env: {},
    }),
    run: async (_executable, args) => {
      commands.push(args.join(" "));
      if (args[0] === "version")
        return { stdout: "1.96.3\n", stderr: "", exitCode: 0 };
      if (args[0] === "status")
        return {
          stdout: JSON.stringify({
            BackendState: "Running",
            Self: { DNSName: "relay-win.tail123.ts.net." },
          }),
          stderr: "",
          exitCode: 0,
        };
      if (args[0] === "serve" && args[1] === "status")
        return { stdout: "{}", stderr: "", exitCode: 0 };
      if (args[0] === "funnel" && args[1] === "status") {
        const json = activated
          ? {
              Web: {
                "relay-win.tail123.ts.net:443": {
                  Handlers: { "/": { Proxy: "http://127.0.0.1:7777" } },
                },
              },
            }
          : {};
        return { stdout: JSON.stringify(json), stderr: "", exitCode: 0 };
      }
      if (args[0] === "funnel" && args.includes("off")) {
        activated = false;
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      if (args[0] === "funnel") {
        activated = true;
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    fetch: async () => {
      probeCalls += 1;
      if (probeCalls === 1) throw new Error("ECONNRESET public funnel");
      return new Response('{"ok":true}', { status: 200 });
    },
  });
  const degraded = await manager.activate({
    mode: "funnel",
    localPort: 7777,
    force: true,
  });
  check(
    "Active-but-unreachable Funnel becomes degraded after end-to-end probe",
    () => {
      assert.equal(degraded.state, "DEGRADED");
      assert.match(
        degraded.remediationCommand ?? "",
        /Restart-Service Tailscale/,
      );
    },
  );
  const repaired = await manager.remediate({
    mode: "funnel",
    localPort: 7777,
    configuredPublicPort: 443,
    force: true,
  });
  check(
    "Tunnel remediation reconfigures and re-probes before returning ready",
    () => {
      assert.equal(repaired.state, "ACTIVE");
      assert.ok(commands.some((command) => command === "down"));
      assert.ok(commands.some((command) => command === "up"));
    },
  );
  const stopped = await manager.deactivate({
    mode: "funnel",
    localPort: 7777,
    configuredPublicPort: 443,
    force: true,
  });
  check("Tunnel off removes Relay exposure explicitly", () => {
    assert.equal(stopped.state, "STOPPED");
    assert.ok(commands.some((command) => command === "funnel --https=443 off"));
  });
})();

console.log("remote access");
await (async () => {
  let received: any;
  let activeRemoteRuns: any[] = [];
  let fullStateCalls = 0;
  let actionStateCalls = 0;
  const fullRemoteState = async () => {
    fullStateCalls += 1;
    return {
      workspace: { id: "p", name: "demo", isGit: true },
      projects: [
        {
          id: "other",
          name: "Altro",
          path: "/tmp/relay-known-project",
          lastOpenedAt: new Date().toISOString(),
          isGit: true,
        },
      ],
      providers: [],
      usage: [],
      conversation: {
        id: "c",
        projectId: "p",
        title: "Demo",
        provider: "codex",
        permission: "workspace-write",
        delegationPolicy: "confirm",
        messages: [],
        delegations: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      conversations: [],
      archivedConversations: [],
      rules: [],
      skills: { entries: [], providers: [], codexSkillsFlag: undefined },
      mcp: {
        servers: [
          {
            provider: "codex",
            name: "files",
            transport: "stdio",
            target: "npx",
            scope: "global",
            enabled: true,
            status: "connected",
          },
        ],
        refreshedAt: new Date().toISOString(),
        errors: [],
      },
      automations: [
        {
          id: "auto-1",
          name: "Daily",
          prompt: "Check",
          projectId: "p",
          permission: "workspace-write",
          delegationPolicy: "confirm",
          schedule: { kind: "daily", time: "09:00" },
          enabled: true,
          missedPolicy: "skip",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      scheduler: { active: [], queued: [], maxParallel: 1 },
      activeRuns: activeRemoteRuns,
      pendingDelegations: [],
      projectConversations: {},
      projectArchivedConversations: {},
      diagnostics: [],
      preferences: {
        disconnectedProviders: [],
        defaultProvider: "codex",
        delegationPolicy: "confirm",
        quotaPolicy: "balanced",
        usageAutoRefreshMinutes: 1,
        exposeUsageToAgents: true,
        quotaWarningThreshold: 0.35,
        quotaCriticalThreshold: 0.15,
        onboardingVersion: 1,
        providerDefaults: {} as any,
      },
      onboardingComplete: true,
      usageRefreshing: false,
      contextItems: [],
      antigravityUsageBridge: {
        enabled: false,
        settingsPath: "",
        cachePath: "",
      },
      agents: [],
      remoteAccess: {
        enabled: true,
        activeSessions: [],
        platform: process.platform,
        computerName: "test",
      },
      systemReadiness: {
        checkedAt: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
        components: [
          {
            id: "runtime",
            label: "Runtime Relay",
            state: "ready",
            detail: "integrato",
            requiredFor: ["Remoto"],
            installable: false,
          },
          {
            id: "node",
            label: "Node.js esterno",
            state: "ready",
            detail: "ok",
            requiredFor: ["CLI"],
            installable: true,
          },
          {
            id: "npm",
            label: "npm",
            state: "ready",
            detail: "ok",
            requiredFor: ["CLI"],
            installable: true,
          },
          {
            id: "git",
            label: "Git",
            state: "ready",
            detail: "ok",
            requiredFor: ["Worktree"],
            installable: true,
          },
          {
            id: "curl",
            label: "curl",
            state: "ready",
            detail: "ok",
            requiredFor: ["CLI"],
            installable: true,
          },
          {
            id: "browser",
            label: "Browser",
            state: "ready",
            detail: "ok",
            requiredFor: ["Browser"],
            installable: true,
          },
        ],
        features: {
          remote: {
            ready: true,
            title: "Accesso remoto",
            detail: "Pronto",
            missing: [],
          },
          parallelWrites: {
            ready: true,
            title: "Scritture parallele isolate",
            detail: "Pronto",
            missing: [],
          },
          browserAutomation: {
            ready: true,
            title: "Browser Agent",
            detail: "Pronto",
            missing: [],
          },
        },
      },
    } as any;
  };
  const remote = new RemoteAccessServer(
    fullRemoteState,
    async (message) => {
      received = message;
    },
    undefined,
    undefined,
    async () => {
      actionStateCalls += 1;
      const state = await fullRemoteState();
      fullStateCalls -= 1;
      return {
        conversation: state.conversation,
        conversations: state.conversations,
        activeRuns: state.activeRuns,
        agents: state.agents,
        rules: state.rules,
        projects: state.projects,
        providers: state.providers,
        mcp: state.mcp,
        automations: state.automations,
      };
    },
  );
  const snapshot = await remote.start();
  try {
    check("Remote access starts LAN server with QR and code", () => {
      assert.equal(snapshot.enabled, true);
      assert.match(snapshot.url ?? "", /^http:\/\//);
      assert.match(snapshot.qrDataUrl ?? "", /^data:image\/svg\+xml;base64,/);
      assert.match(snapshot.pairingCode ?? "", /^\d{6}$/);
    });
    const appResponse = await fetch(`http://127.0.0.1:${snapshot.port}/`);
    const appHtml = await appResponse.text();
    check(
      "Remote mobile app exposes live task UI and safe project picker",
      () => {
        assert.match(appHtml, /sta lavorando/);
        assert.match(appHtml, /Aggiungi dal PC/);
        assert.match(
          appHtml,
          /Aggiungi un progetto dal computer|Apri una cartella sul computer/,
        );
      },
    );
    check(
      "Remote mobile app uses delegated actions and nonce-only script CSP",
      () => {
        assert.doesNotMatch(appHtml, /\sonclick=/i);
        assert.match(appHtml, /data-action=/);
        assert.match(appHtml, /<script nonce="[A-Za-z0-9_-]+">/);
        const csp = appResponse.headers.get("content-security-policy") ?? "";
        assert.match(csp, /script-src 'nonce-[A-Za-z0-9_-]+'/);
        assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
      },
    );
    const unauthenticatedState = await fetch(
      `http://127.0.0.1:${snapshot.port}/api/state`,
    );
    check("Remote state rejects requests without a session", () =>
      assert.equal(unauthenticatedState.status, 401),
    );
    const pairingInfoResponse = await fetch(
      `http://127.0.0.1:${snapshot.port}/api/pairing`,
    );
    const pairingInfo = (await pairingInfoResponse.json()) as any;
    check(
      "Remote pairing metadata exposes the current ticket without exposing the code",
      () => {
        assert.equal(pairingInfoResponse.status, 200);
        assert.equal(
          pairingInfo.ticket,
          new URL(snapshot.url!).searchParams.get("t"),
        );
        assert.match(pairingInfo.instanceId, /^[A-Za-z0-9_-]+$/);
        assert.equal("code" in pairingInfo, false);
      },
    );
    const pairWithoutRelayHeader = await fetch(
      `http://127.0.0.1:${snapshot.port}/api/pair`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticket: "x", code: "000000" }),
      },
    );
    check("Remote access rejects non-Relay pairing requests", () =>
      assert.equal(pairWithoutRelayHeader.status, 403),
    );
    const ticket = new URL(snapshot.url!).searchParams.get("t");
    const mobileHeaders = {
      "content-type": "application/json",
      "x-relay-request": "mobile",
    };
    const pair = await fetch(`http://127.0.0.1:${snapshot.port}/api/pair`, {
      method: "POST",
      headers: mobileHeaders,
      body: JSON.stringify({
        ticket,
        code: snapshot.pairingCode,
        name: "test-phone",
      }),
    });
    const paired = (await pair.json()) as any;
    const sessionCookie = pair.headers.get("set-cookie")?.split(";")[0] ?? "";
    check("Remote access pairs exactly once", () => {
      assert.equal(pair.status, 200);
      assert.ok(paired.sessionId);
      assert.match(paired.token, /^[A-Za-z0-9_-]{20,}$/);
      assert.match(sessionCookie, /^relay_session=/);
      assert.equal(remote.snapshot().activeSessions.length, 1);
      assert.equal(remote.snapshot().ticketUsed, true);
    });
    const bearerState = await fetch(
      `http://127.0.0.1:${snapshot.port}/api/state`,
      {
        headers: { authorization: `Bearer ${paired.token}` },
      },
    );
    check(
      "Remote mobile fallback authenticates without relying on cookies",
      () => assert.equal(bearerState.status, 200),
    );
    const repeat = await fetch(`http://127.0.0.1:${snapshot.port}/api/pair`, {
      method: "POST",
      headers: mobileHeaders,
      body: JSON.stringify({
        ticket,
        code: snapshot.pairingCode,
        name: "test-phone",
      }),
    });
    check("Remote access rejects reused QR", () =>
      assert.equal(repeat.status, 409),
    );
    const fullStateCallsBeforeAction = fullStateCalls;
    const action = await fetch(`http://127.0.0.1:${snapshot.port}/api/action`, {
      method: "POST",
      headers: { ...mobileHeaders, cookie: sessionCookie },
      body: JSON.stringify({
        type: "sendMessage",
        payload: { prompt: "ciao" },
      }),
    });
    check("Remote access forwards allowed actions", () => {
      assert.equal(action.status, 200);
      assert.equal(received.type, "sendMessage");
    });
    check("Remote actions use the lightweight validation snapshot", () => {
      assert.ok(actionStateCalls >= 1);
      assert.equal(fullStateCalls, fullStateCallsBeforeAction);
    });
    const settingsAction = await fetch(
      `http://127.0.0.1:${snapshot.port}/api/action`,
      {
        method: "POST",
        headers: { ...mobileHeaders, cookie: sessionCookie },
        body: JSON.stringify({
          type: "updatePreferences",
          payload: {
            delegationPolicy: "automatic",
            quotaPolicy: "preserve",
            usageAutoRefreshMinutes: 5,
          },
        }),
      },
    );
    check("Remote settings forward only the safe preference subset", () => {
      assert.equal(settingsAction.status, 200);
      assert.equal(received.type, "updatePreferences");
      assert.equal(received.payload.usageAutoRefreshMinutes, 5);
    });
    const unsafeSettingsAction = await fetch(
      `http://127.0.0.1:${snapshot.port}/api/action`,
      {
        method: "POST",
        headers: { ...mobileHeaders, cookie: sessionCookie },
        body: JSON.stringify({
          type: "updatePreferences",
          payload: { remoteAccessAutoStart: false },
        }),
      },
    );
    check("Remote settings reject preferences outside the explicit allowlist", () =>
      assert.equal(unsafeSettingsAction.status, 403),
    );
    const toggleMcp = await fetch(
      `http://127.0.0.1:${snapshot.port}/api/action`,
      {
        method: "POST",
        headers: { ...mobileHeaders, cookie: sessionCookie },
        body: JSON.stringify({
          type: "toggleMcp",
          payload: {
            provider: "codex",
            name: "files",
            scope: "global",
            enabled: false,
          },
        }),
      },
    );
    check("Remote MCP toggle is allowlisted and identity-validated", () => {
      assert.equal(toggleMcp.status, 200);
      assert.equal(received.type, "toggleMcp");
    });
    const runAutomation = await fetch(
      `http://127.0.0.1:${snapshot.port}/api/action`,
      {
        method: "POST",
        headers: { ...mobileHeaders, cookie: sessionCookie },
        body: JSON.stringify({
          type: "runAutomationNow",
          payload: { id: "auto-1" },
        }),
      },
    );
    check(
      "Remote automation run-now is allowlisted and identity-validated",
      () => {
        assert.equal(runAutomation.status, 200);
        assert.equal(received.type, "runAutomationNow");
      },
    );
    activeRemoteRuns = [
      {
        id: "running",
        conversationId: "c",
        provider: "codex",
        kind: "primary",
        phase: "working",
      },
    ];
    const busyChat = await fetch(
      `http://127.0.0.1:${snapshot.port}/api/action`,
      {
        method: "POST",
        headers: { ...mobileHeaders, cookie: sessionCookie },
        body: JSON.stringify({
          type: "sendMessage",
          payload: { prompt: "secondo task" },
        }),
      },
    );
    check("Remote access blocks duplicate sends in a running chat", () =>
      assert.equal(busyChat.status, 403),
    );
    const busyProjectSwitch = await fetch(
      `http://127.0.0.1:${snapshot.port}/api/action`,
      {
        method: "POST",
        headers: { ...mobileHeaders, cookie: sessionCookie },
        body: JSON.stringify({
          type: "requestRemoteProjectOpen",
          payload: { path: "/tmp/relay-known-project" },
        }),
      },
    );
    check("Remote access blocks project switches while tasks are running", () =>
      assert.equal(busyProjectSwitch.status, 403),
    );
    activeRemoteRuns = [];
    const unknownProject = await fetch(
      `http://127.0.0.1:${snapshot.port}/api/action`,
      {
        method: "POST",
        headers: { ...mobileHeaders, cookie: sessionCookie },
        body: JSON.stringify({
          type: "requestRemoteProjectOpen",
          payload: { path: "/tmp/not-registered" },
        }),
      },
    );
    check("Remote access blocks arbitrary filesystem project paths", () =>
      assert.equal(unknownProject.status, 403),
    );
    const forbidden = await fetch(
      `http://127.0.0.1:${snapshot.port}/api/action`,
      {
        method: "POST",
        headers: { ...mobileHeaders, cookie: sessionCookie },
        body: JSON.stringify({ type: "resetAllData", payload: {} }),
      },
    );
    check("Remote access blocks dangerous remote actions", () =>
      assert.equal(forbidden.status, 403),
    );
    remote.closeSession(paired.sessionId);
    const revokedState = await fetch(
      `http://127.0.0.1:${snapshot.port}/api/state`,
      {
        headers: { authorization: `Bearer ${paired.token}` },
      },
    );
    check(
      "Closing a remote session invalidates the mobile bearer immediately",
      () => assert.equal(revokedState.status, 401),
    );
    check("Remote access records closed sessions in paginated history", () => {
      const closed = remote.snapshot();
      assert.equal(closed.activeSessions.length, 0);
      assert.equal(closed.sessionHistory.length, 1);
      assert.equal(closed.sessionHistory[0]?.reason, "revoked");
      assert.ok((closed.sessionHistory[0]?.durationMs ?? -1) >= 0);
    });
    remote.clearHistory();
    check(
      "Remote session history can be cleared without stopping the server",
      () => assert.equal(remote.snapshot().sessionHistory.length, 0),
    );
    check(
      "Remote mobile layout removes oversized heroes and supports markdown",
      () => {
        assert.doesNotMatch(appHtml, /maximum-scale=1/);
        assert.match(appHtml, /overflow-x\s*:\s*hidden/);
        assert.match(appHtml, /function md\(/);
        assert.match(appHtml, /@media\s*\(max-width:\s*390px\)/);
      },
    );
  } finally {
    await remote.stop();
  }
})();

console.log("persistent remote sessions");
await (async () => {
  const { mkdtemp, readFile, writeFile, stat, rm } =
    await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "relay-remote-sessions-"));
  const historyPath = join(root, "remote-session-history.json");
  const sessionsPath = join(root, "remote-sessions.json");
  const state = async () =>
    ({
      workspace: { id: "p", name: "demo", isGit: true },
      projects: [],
      providers: [],
      usage: [],
      conversation: {
        id: "c",
        projectId: "p",
        title: "Demo",
        provider: "codex",
        permission: "workspace-write",
        delegationPolicy: "confirm",
        messages: [],
        delegations: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      conversations: [],
      archivedConversations: [],
      rules: [],
      skills: { entries: [], providers: [], codexSkillsFlag: undefined },
      mcp: { servers: [], refreshedAt: new Date().toISOString(), errors: [] },
      automations: [],
      scheduler: { active: [], queued: [], maxParallel: 1 },
      activeRuns: [],
      pendingDelegations: [],
      projectConversations: {},
      projectArchivedConversations: {},
      diagnostics: [],
      preferences: {
        disconnectedProviders: [],
        defaultProvider: "codex",
        delegationPolicy: "confirm",
        quotaPolicy: "balanced",
        usageAutoRefreshMinutes: 1,
        exposeUsageToAgents: true,
        quotaWarningThreshold: 0.35,
        quotaCriticalThreshold: 0.15,
        onboardingVersion: 1,
        providerDefaults: {} as any,
      },
      onboardingComplete: true,
      usageRefreshing: false,
      contextItems: [],
      antigravityUsageBridge: {
        enabled: false,
        settingsPath: "",
        cachePath: "",
      },
      agents: [],
      remoteAccess: {
        enabled: true,
        activeSessions: [],
        platform: process.platform,
        computerName: "test",
      },
      systemReadiness: {
        checkedAt: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
        components: [],
        features: {
          remote: { ready: true, title: "Remote", detail: "", missing: [] },
          parallelWrites: {
            ready: true,
            title: "Git",
            detail: "",
            missing: [],
          },
          browserAutomation: {
            ready: true,
            title: "Browser",
            detail: "",
            missing: [],
          },
        },
      },
    }) as any;
  try {
    const first = new RemoteAccessServer(
      state,
      async () => undefined,
      historyPath,
    );
    const started = await first.start();
    const ticket = new URL(started.url!).searchParams.get("t");
    const paired = await fetch(`http://127.0.0.1:${started.port}/api/pair`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relay-request": "mobile",
      },
      body: JSON.stringify({
        ticket,
        code: started.pairingCode,
        name: "Persisted phone",
      }),
    });
    const pairBody = (await paired.json()) as any;
    const token = String(pairBody.token ?? "");
    await first.dispose();

    const persisted = JSON.parse(await readFile(sessionsPath, "utf8")) as any[];
    check(
      "Remote session file stores only SHA-256 token hashes with restrictive permissions",
      () => {
        assert.equal(persisted.length, 1);
        assert.match(persisted[0].tokenHash, /^[a-f0-9]{64}$/);
        assert.doesNotMatch(
          JSON.stringify(persisted),
          new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        );
      },
    );
    if (process.platform !== "win32") {
      const mode = (await stat(sessionsPath)).mode & 0o777;
      check("Remote session persistence file is owner-only", () =>
        assert.equal(mode, 0o600),
      );
    }

    const second = new RemoteAccessServer(
      state,
      async () => undefined,
      historyPath,
    );
    const restarted = await second.start();
    const accepted = await fetch(
      `http://127.0.0.1:${restarted.port}/api/state`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const rejected = await fetch(
      `http://127.0.0.1:${restarted.port}/api/state`,
      { headers: { authorization: `Bearer ${token}x` } },
    );
    check(
      "Remote session survives a fresh server instance while altered tokens are rejected",
      () => {
        assert.equal(accepted.status, 200);
        assert.equal(rejected.status, 401);
      },
    );
    await second.dispose();

    const expired = JSON.parse(await readFile(sessionsPath, "utf8")) as any[];
    expired[0].lastSeenAt = new Date(
      Date.now() - 13 * 60 * 60 * 1000,
    ).toISOString();
    await writeFile(sessionsPath, JSON.stringify(expired, null, 2), {
      mode: 0o600,
    });
    const third = new RemoteAccessServer(
      state,
      async () => undefined,
      historyPath,
    );
    const expiredStart = await third.start();
    const expiredResponse = await fetch(
      `http://127.0.0.1:${expiredStart.port}/api/state`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    check("Expired persisted sessions stay invalid after reload", () =>
      assert.equal(expiredResponse.status, 401),
    );
    await third.stop();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
})();

console.log("remote extension update");
await (async () => {
  const { mkdtemp, writeFile, rm, access } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "relay-extension-update-"));
  try {
    const vsix = join(root, "Relay-0_21_3.vsix");
    await writeFile(vsix, "mock-vsix");
    await assert.rejects(
      () => resolveVsixUpdatePath(join(root, "missing.vsix")),
      /non trovato/i,
    );
    await assert.rejects(
      () => resolveVsixUpdatePath(join(root, "Relay.zip")),
      /estensione \.vsix/i,
    );
    const resolved = await resolveVsixUpdatePath("Relay-0_21_3.vsix", root);
    check(
      "VSIX update path validation accepts only an existing local .vsix file",
      () => assert.equal(resolved, vsix),
    );

    const markerPath = join(root, "pending-update.json");
    await writePendingExtensionUpdate(markerPath, {
      fromVersion: "0.21.2",
      vsixPath: vsix,
      createdAt: "2026-07-18T20:00:00.000Z",
    });
    const completed = await consumePendingExtensionUpdate(markerPath, "0.21.3");
    check(
      "Pending update marker is written and consumed on the next version boot",
      () => {
        assert.equal(completed?.fromVersion, "0.21.2");
        assert.equal(completed?.toVersion, "0.21.3");
        assert.equal(completed?.vsixPath, vsix);
      },
    );
    await assert.rejects(() => access(markerPath));

    const directCalls: string[] = [];
    const direct = await installVsixWithFallback(vsix, async (command) => {
      directCalls.push(command);
    });
    check("VSIX installer prefers the primary VS Code command", () => {
      assert.equal(direct, "workbench.extensions.installExtension");
      assert.deepEqual(directCalls, ["workbench.extensions.installExtension"]);
    });
    const fallbackCalls: string[] = [];
    const fallback = await installVsixWithFallback(vsix, async (command) => {
      fallbackCalls.push(command);
      if (command === "workbench.extensions.installExtension")
        throw new Error("command not found");
    });
    check("VSIX installer falls back to installFromVSIX when needed", () => {
      assert.equal(fallback, "workbench.extensions.command.installFromVSIX");
      assert.deepEqual(fallbackCalls, [
        "workbench.extensions.installExtension",
        "workbench.extensions.command.installFromVSIX",
      ]);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
})();

console.log("remote bootstrap pairing");
await (async () => {
  const { mkdtemp, writeFile, access, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "relay-bootstrap-pair-"));
  const historyPath = join(root, "remote-session-history.json");
  const bootstrapPath = join(root, "remote-bootstrap.json");
  const state = async () =>
    ({
      workspace: { id: "p", name: "demo", isGit: true },
      projects: [],
      providers: [],
      usage: [],
      conversation: {
        id: "c",
        projectId: "p",
        title: "Demo",
        provider: "codex",
        permission: "workspace-write",
        delegationPolicy: "confirm",
        messages: [],
        delegations: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      conversations: [],
      archivedConversations: [],
      rules: [],
      skills: { entries: [], providers: [], codexSkillsFlag: undefined },
      mcp: { servers: [], refreshedAt: new Date().toISOString(), errors: [] },
      automations: [],
      scheduler: { active: [], queued: [], maxParallel: 1 },
      activeRuns: [],
      pendingDelegations: [],
      projectConversations: {},
      projectArchivedConversations: {},
      diagnostics: [],
      preferences: {
        disconnectedProviders: [],
        defaultProvider: "codex",
        delegationPolicy: "confirm",
        quotaPolicy: "balanced",
        usageAutoRefreshMinutes: 1,
        exposeUsageToAgents: true,
        quotaWarningThreshold: 0.35,
        quotaCriticalThreshold: 0.15,
        onboardingVersion: 1,
        providerDefaults: {} as any,
      },
      onboardingComplete: true,
      usageRefreshing: false,
      contextItems: [],
      antigravityUsageBridge: {
        enabled: false,
        settingsPath: "",
        cachePath: "",
      },
      agents: [],
      remoteAccess: {
        enabled: true,
        activeSessions: [],
        platform: process.platform,
        computerName: "test",
      },
      systemReadiness: {
        checkedAt: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
        components: [],
        features: {
          remote: { ready: true, title: "Remote", detail: "", missing: [] },
          parallelWrites: {
            ready: true,
            title: "Git",
            detail: "",
            missing: [],
          },
          browserAutomation: {
            ready: true,
            title: "Browser",
            detail: "",
            missing: [],
          },
        },
      },
    }) as any;
  try {
    await writeFile(
      bootstrapPath,
      JSON.stringify({
        code: "472333",
        expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
      }),
      { mode: 0o600 },
    );
    const server = new RemoteAccessServer(
      state,
      async () => undefined,
      historyPath,
    );
    const started = await server.start();
    const accepted = await fetch(`http://127.0.0.1:${started.port}/api/pair`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relay-request": "mobile",
      },
      body: JSON.stringify({
        ticket: "stale-ticket",
        code: "472333",
        name: "Recovery phone",
      }),
    });
    const reused = await fetch(`http://127.0.0.1:${started.port}/api/pair`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relay-request": "mobile",
      },
      body: JSON.stringify({ ticket: "stale-ticket", code: "472333" }),
    });
    check(
      "Bootstrap pairing code works once without the current QR ticket",
      () => {
        assert.equal(accepted.status, 200);
        assert.equal(reused.status, 403);
      },
    );
    await assert.rejects(() => access(bootstrapPath));
    await server.stop();

    await writeFile(
      bootstrapPath,
      JSON.stringify({
        code: "928441",
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      }),
      { mode: 0o600 },
    );
    const expiredServer = new RemoteAccessServer(
      state,
      async () => undefined,
      historyPath,
    );
    const expiredStart = await expiredServer.start();
    const expired = await fetch(
      `http://127.0.0.1:${expiredStart.port}/api/pair`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-relay-request": "mobile",
        },
        body: JSON.stringify({ ticket: "stale-ticket", code: "928441" }),
      },
    );
    check("Expired bootstrap pairing code is rejected", () =>
      assert.equal(expired.status, 403),
    );
    await expiredServer.stop();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
})();

console.log("remote artifact delivery");
await (async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createServer } = await import("node:http");
  const root = await mkdtemp(join(tmpdir(), "relay-remote-delivery-"));
  let localLoginBody = "";
  const localApp = createServer((request, response) => {
    if (request.url === "/asset.css") {
      response.writeHead(200, { "content-type": "text/css" });
      response.end("body{background:#111}");
      return;
    }
    if (request.url === "/login" && request.method === "POST") {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        localLoginBody = Buffer.concat(chunks).toString("utf8");
        response.writeHead(200, {
          "content-type": "application/json",
          "set-cookie": "local_session=ready; Path=/; HttpOnly",
        });
        response.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    if (request.url === "/whoami") {
      const authenticated = String(request.headers.cookie ?? "").includes(
        "local_session=ready",
      );
      response.writeHead(authenticated ? 200 : 401, {
        "content-type": "application/json",
      });
      response.end(JSON.stringify({ authenticated }));
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      '<!doctype html><link rel="stylesheet" href="/asset.css"><h1>Local Relay App</h1><form action="/login" method="post"><button>Login</button></form><script>fetch("/whoami")</script>',
    );
  });
  await new Promise<void>((resolve) =>
    localApp.listen(0, "127.0.0.1", resolve),
  );
  const localAddress = localApp.address();
  const localPort =
    typeof localAddress === "object" && localAddress ? localAddress.port : 0;
  try {
    await mkdir(join(root, "site"), { recursive: true });
    await writeFile(
      join(root, "site", "index.html"),
      '<!doctype html><link rel="stylesheet" href="/style.css"><h1>Static Relay Site</h1>',
    );
    await writeFile(join(root, "site", "style.css"), "h1{color:orange}");
    await writeFile(join(root, "simoEale.md"), "# Ora attuale");
    await writeFile(join(root, "file con spazi.txt"), "Percorso codificato");
    await mkdir(join(root, "cartella risultato"), { recursive: true });
    await writeFile(join(root, "cartella risultato", "a.txt"), "A");
    await writeFile(join(root, "cartella risultato", "b.txt"), "B");
    const encodedFilePath = encodeURI(join(root, "file con spazi.txt"));
    const encodedDirectoryPath = encodeURI(join(root, "cartella risultato"));
    const artifacts = await discoverRemoteArtifacts({
      workspaceRoot: root,
      text: `Creato [simoEale.md](${join(root, "simoEale.md")}), [file codificato](${encodedFilePath}), [cartella progetto](${encodedDirectoryPath}) e app su http://localhost:${localPort}/`,
      changedFiles: ["site/index.html", "site/style.css", ".env"],
    });
    check("Remote artifact discovery decodes markdown paths and packages cited directories", () => {
      assert.ok(
        artifacts.some(
          (artifact) =>
            artifact.kind === "file" && artifact.name === "file con spazi.txt",
        ),
      );
      assert.ok(
        artifacts.some(
          (artifact) =>
            artifact.kind === "bundle" &&
            artifact.name === "cartella-risultato.zip" &&
            artifact.files?.includes("cartella risultato/a.txt") &&
            artifact.files?.includes("cartella risultato/b.txt"),
        ),
      );
    });
    const message = {
      id: "artifact-message",
      role: "assistant",
      text: "Artefatti pronti",
      createdAt: new Date().toISOString(),
      artifacts,
    };
    const state = async () =>
      ({
        workspace: { id: "p", name: "demo", cwd: root, isGit: true },
        projects: [],
        providers: [],
        usage: [],
        conversation: {
          id: "c",
          projectId: "p",
          title: "Demo",
          provider: "codex",
          permission: "workspace-write",
          delegationPolicy: "confirm",
          messages: [message],
          delegations: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        conversations: [],
        archivedConversations: [],
        rules: [],
        skills: { entries: [], providers: [], codexSkillsFlag: undefined },
        mcp: { servers: [], refreshedAt: new Date().toISOString(), errors: [] },
        automations: [],
        scheduler: { active: [], queued: [], maxParallel: 1 },
        activeRuns: [],
        pendingDelegations: [],
        projectConversations: {},
        projectArchivedConversations: {},
        diagnostics: [],
        preferences: {
          disconnectedProviders: [],
          defaultProvider: "codex",
          delegationPolicy: "confirm",
          quotaPolicy: "balanced",
          usageAutoRefreshMinutes: 1,
          exposeUsageToAgents: true,
          quotaWarningThreshold: 0.35,
          quotaCriticalThreshold: 0.15,
          onboardingVersion: 1,
          providerDefaults: {} as any,
        },
        onboardingComplete: true,
        usageRefreshing: false,
        contextItems: [],
        antigravityUsageBridge: {
          enabled: false,
          settingsPath: "",
          cachePath: "",
        },
        agents: [],
        remoteAccess: {
          enabled: true,
          activeSessions: [],
          platform: process.platform,
          computerName: "test",
        },
        systemReadiness: {
          checkedAt: new Date().toISOString(),
          platform: process.platform,
          arch: process.arch,
          components: [],
          features: {
            remote: { ready: true, title: "Remote", detail: "", missing: [] },
            parallelWrites: {
              ready: true,
              title: "Git",
              detail: "",
              missing: [],
            },
            browserAutomation: {
              ready: true,
              title: "Browser",
              detail: "",
              missing: [],
            },
          },
        },
      }) as any;
    const server = new RemoteAccessServer(state, async () => undefined);
    const started = await server.start();
    try {
      const ticket = new URL(started.url!).searchParams.get("t");
      const pair = await fetch(`http://127.0.0.1:${started.port}/api/pair`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-relay-request": "mobile",
        },
        body: JSON.stringify({
          ticket,
          code: started.pairingCode,
          name: "artifact-phone",
        }),
      });
      const cookie = pair.headers.get("set-cookie")?.split(";")[0] ?? "";
      const file = artifacts.find(
        (artifact) =>
          artifact.kind === "file" && artifact.name === "simoEale.md",
      )!;
      const fileResponse = await fetch(
        `http://127.0.0.1:${started.port}/api/artifacts/c/artifact-message/${file.id}`,
        { headers: { cookie } },
      );
      check(
        "Remote authenticated file endpoint downloads cited workspace files",
        () => {
          assert.equal(fileResponse.status, 200);
          assert.match(
            fileResponse.headers.get("content-disposition") ?? "",
            /attachment/,
          );
        },
      );
      assert.match(await fileResponse.text(), /Ora attuale/);
      const staticSite = artifacts.find(
        (artifact) => artifact.kind === "static-site",
      )!;
      const previewResponse = await fetch(
        `http://127.0.0.1:${started.port}/preview/c/artifact-message/${staticSite.id}/`,
        { headers: { cookie } },
      );
      const previewHtml = await previewResponse.text();
      check(
        "Remote static preview serves workspace HTML with a sandbox CSP",
        () => {
          assert.equal(previewResponse.status, 200);
          assert.match(previewHtml, /Static Relay Site/);
          assert.match(
            previewHtml,
            new RegExp(
              `/preview/c/artifact-message/${staticSite.id}/style\.css`,
            ),
          );
          assert.match(
            previewResponse.headers.get("content-security-policy") ?? "",
            /sandbox/,
          );
        },
      );
      const staticTicketResponse = await fetch(
        `http://127.0.0.1:${started.port}/api/preview-ticket`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-relay-request": "mobile",
            cookie,
          },
          body: JSON.stringify({
            conversationId: "c",
            messageId: "artifact-message",
            artifactId: staticSite.id,
          }),
        },
      );
      const staticTicket = (await staticTicketResponse.json()) as any;
      const scopedStaticResponse = await fetch(
        `http://127.0.0.1:${started.port}${staticTicket.url}`,
      );
      const scopedStaticHtml = await scopedStaticResponse.text();
      const scopedStaticCss = await fetch(
        `http://127.0.0.1:${started.port}${staticTicket.url}style.css`,
      );
      check(
        "Scoped preview tickets load static HTML and linked assets without exposing the Relay session",
        () => {
          assert.equal(staticTicketResponse.status, 200);
          assert.match(staticTicket.url, /^\/preview-access\//);
          assert.equal(scopedStaticResponse.status, 200);
          assert.ok(scopedStaticHtml.includes(`${staticTicket.url}style.css`));
          assert.equal(scopedStaticCss.status, 200);
        },
      );
      const service = artifacts.find(
        (artifact) => artifact.kind === "local-service",
      )!;
      const serviceResponse = await fetch(
        `http://127.0.0.1:${started.port}/preview/c/artifact-message/${service.id}/`,
        { headers: { cookie } },
      );
      const serviceHtml = await serviceResponse.text();
      check(
        "Remote preview proxies a loopback web app through the Relay tunnel origin",
        () => {
          assert.equal(serviceResponse.status, 200);
          assert.match(serviceHtml, /Local Relay App/);
          assert.match(
            serviceHtml,
            new RegExp(`/preview/c/artifact-message/${service.id}/asset\\.css`),
          );
        },
      );
      const serviceTicketResponse = await fetch(
        `http://127.0.0.1:${started.port}/api/preview-ticket`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-relay-request": "mobile",
            cookie,
          },
          body: JSON.stringify({
            conversationId: "c",
            messageId: "artifact-message",
            artifactId: service.id,
          }),
        },
      );
      const serviceTicket = (await serviceTicketResponse.json()) as any;
      const scopedServiceResponse = await fetch(
        `http://127.0.0.1:${started.port}${serviceTicket.url}`,
      );
      const scopedServiceHtml = await scopedServiceResponse.text();
      const loginResponse = await fetch(
        `http://127.0.0.1:${started.port}${serviceTicket.url}login`,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "user=relay",
        },
      );
      const whoamiResponse = await fetch(
        `http://127.0.0.1:${started.port}${serviceTicket.url}whoami`,
      );
      const whoami = (await whoamiResponse.json()) as any;
      check(
        "Scoped local previews rewrite assets, forward forms and preserve upstream app cookies",
        () => {
          assert.equal(serviceTicketResponse.status, 200);
          assert.equal(scopedServiceResponse.status, 200);
          assert.ok(scopedServiceHtml.includes(`${serviceTicket.url}asset.css`));
          assert.ok(scopedServiceHtml.includes(`${serviceTicket.url}login`));
          assert.equal(loginResponse.status, 200);
          assert.equal(localLoginBody, "user=relay");
          assert.equal(whoamiResponse.status, 200);
          assert.equal(whoami.authenticated, true);
        },
      );
      const bundle = artifacts.find((artifact) => artifact.kind === "bundle")!;
      const bundleResponse = await fetch(
        `http://127.0.0.1:${started.port}/api/artifacts/c/artifact-message/${bundle.id}`,
        { headers: { cookie } },
      );
      const bundleBytes = Buffer.from(await bundleResponse.arrayBuffer());
      check(
        "Remote bundle endpoint creates a downloadable ZIP without exposing arbitrary paths",
        () => {
          assert.equal(bundleResponse.status, 200);
          assert.equal(bundleBytes.subarray(0, 2).toString("binary"), "PK");
        },
      );
      const traversal = await fetch(
        `http://127.0.0.1:${started.port}/api/artifacts/c/artifact-message/not-real`,
        { headers: { cookie } },
      );
      check("Remote artifact endpoint rejects unknown path tokens", () =>
        assert.equal(traversal.status, 404),
      );
    } finally {
      await server.stop();
    }
  } finally {
    await new Promise<void>((resolve) => localApp.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
})();

console.log("remote access tunnel security");
await (async () => {
  const state = async () =>
    ({
      workspace: { id: "p", name: "demo", isGit: true },
      projects: [],
      providers: [],
      usage: [],
      conversation: {
        id: "c",
        projectId: "p",
        title: "Demo",
        provider: "codex",
        permission: "workspace-write",
        delegationPolicy: "confirm",
        messages: [],
        delegations: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      conversations: [],
      archivedConversations: [],
      rules: [],
      scheduler: { active: [], queued: [], maxParallel: 1 },
      activeRuns: [],
      pendingDelegations: [],
      projectConversations: {},
      projectArchivedConversations: {},
      diagnostics: [],
      preferences: {
        disconnectedProviders: [],
        defaultProvider: "codex",
        delegationPolicy: "confirm",
        quotaPolicy: "balanced",
        usageAutoRefreshMinutes: 1,
        exposeUsageToAgents: true,
        quotaWarningThreshold: 0.35,
        quotaCriticalThreshold: 0.15,
        onboardingVersion: 1,
        providerDefaults: {} as any,
      },
      onboardingComplete: true,
      usageRefreshing: false,
      contextItems: [],
      antigravityUsageBridge: {
        enabled: false,
        settingsPath: "",
        cachePath: "",
      },
      agents: [],
      remoteAccess: {
        enabled: true,
        activeSessions: [],
        platform: process.platform,
        computerName: "test",
      },
      systemReadiness: {
        checkedAt: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
        components: [],
        features: {
          remote: { ready: true, title: "Remote", detail: "", missing: [] },
          parallelWrites: {
            ready: true,
            title: "Git",
            detail: "",
            missing: [],
          },
          browserAutomation: {
            ready: true,
            title: "Browser",
            detail: "",
            missing: [],
          },
        },
      },
    }) as any;
  const server = new RemoteAccessServer(state, async () => undefined);
  const started = await server.start("funnel");
  try {
    await server.configureExposure(
      "funnel",
      "https://relay-pc.tail123.ts.net",
      {
        mode: "funnel",
        state: "ACTIVE",
        installed: true,
        dnsName: "relay-pc.tail123.ts.net",
        publicPort: 443,
        baseUrl: "https://relay-pc.tail123.ts.net",
        transitions: [],
      },
    );
    check("Funnel mode binds Relay only to loopback", () =>
      assert.equal(server.snapshot().bindAddress, "127.0.0.1"),
    );
    const { request: httpRequest } = await import("node:http");
    const hostStatus = (host: string) =>
      new Promise<number>((resolve, reject) => {
        const req = httpRequest(
          {
            hostname: "127.0.0.1",
            port: started.port,
            path: "/health",
            headers: { Host: host },
          },
          (response) => {
            response.resume();
            resolve(response.statusCode ?? 0);
          },
        );
        req.on("error", reject);
        req.end();
      });
    const rejected = await hostStatus("evil.example.com");
    const accepted = await hostStatus("relay-pc.tail123.ts.net");
    check(
      "Funnel Host validation accepts configured ts.net and rejects strangers",
      () => {
        assert.equal(rejected, 421);
        assert.equal(accepted, 200);
      },
    );
    const healthResponse = await fetch(
      `http://127.0.0.1:${started.port}/health`,
      { headers: { host: "relay-pc.tail123.ts.net" } },
    );
    const healthBody = await healthResponse.text();
    check("Public health probe does not disclose the computer identity", () => {
      assert.equal(healthResponse.status, 200);
      assert.doesNotMatch(healthBody, /computerName|platform|test/i);
    });
    const snapshot = server.snapshot();
    const ticket = new URL(snapshot.url!).searchParams.get("t");
    const pair = await fetch(`http://127.0.0.1:${started.port}/api/pair`, {
      method: "POST",
      headers: {
        host: "relay-pc.tail123.ts.net",
        "content-type": "application/json",
        "x-relay-request": "mobile",
      },
      body: JSON.stringify({
        ticket,
        code: snapshot.pairingCode,
        name: "secure-phone",
      }),
    });
    check("Funnel pairing cookie is Secure", () =>
      assert.match(pair.headers.get("set-cookie") ?? "", /; Secure/i),
    );
    const preferredPort = started.port!;
    await server.stop();
    const restarted = await server.start("funnel", preferredPort);
    check("Funnel restart reuses the persisted local port", () =>
      assert.equal(restarted.port, preferredPort),
    );
    await server.stop();
    const originClosed = await fetch(
      `http://127.0.0.1:${preferredPort}/health`,
    ).then(
      () => false,
      () => true,
    );
    check("Stopping Relay makes the loopback tunnel origin unreachable", () =>
      assert.equal(originClosed, true),
    );
  } finally {
    await server.stop();
  }
})();

console.log("remote access security limits");
await (async () => {
  const state = async () =>
    ({
      workspace: { id: "p", name: "demo", isGit: true },
      projects: [],
      providers: [],
      usage: [],
      conversation: {
        id: "c",
        projectId: "p",
        title: "Demo",
        provider: "codex",
        permission: "workspace-write",
        delegationPolicy: "confirm",
        messages: [],
        delegations: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      conversations: [],
      archivedConversations: [],
      rules: [],
      skills: { entries: [], providers: [], codexSkillsFlag: undefined },
      mcp: { servers: [], refreshedAt: new Date().toISOString(), errors: [] },
      automations: [],
      scheduler: { active: [], queued: [], maxParallel: 1 },
      activeRuns: [],
      pendingDelegations: [],
      projectConversations: {},
      projectArchivedConversations: {},
      diagnostics: [],
      preferences: {
        disconnectedProviders: [],
        defaultProvider: "codex",
        delegationPolicy: "confirm",
        quotaPolicy: "balanced",
        usageAutoRefreshMinutes: 1,
        exposeUsageToAgents: true,
        quotaWarningThreshold: 0.35,
        quotaCriticalThreshold: 0.15,
        onboardingVersion: 1,
        providerDefaults: {} as any,
      },
      onboardingComplete: true,
      usageRefreshing: false,
      contextItems: [],
      antigravityUsageBridge: {
        enabled: false,
        settingsPath: "",
        cachePath: "",
      },
      agents: [],
      remoteAccess: {
        enabled: true,
        activeSessions: [],
        platform: process.platform,
        computerName: "test",
      },
      systemReadiness: {
        checkedAt: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
        components: [],
        features: {
          remote: { ready: true, title: "Remote", detail: "", missing: [] },
          parallelWrites: {
            ready: true,
            title: "Git",
            detail: "",
            missing: [],
          },
          browserAutomation: {
            ready: true,
            title: "Browser",
            detail: "",
            missing: [],
          },
        },
      },
    }) as any;
  const rateServer = new RemoteAccessServer(state, async () => undefined);
  const started = await rateServer.start();
  try {
    const ticket = new URL(started.url!).searchParams.get("t");
    const headers = {
      "content-type": "application/json",
      "x-relay-request": "mobile",
    };
    let ninthStatus = 0;
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const response = await fetch(
        `http://127.0.0.1:${started.port}/api/pair`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ticket, code: "000000" }),
        },
      );
      if (attempt === 8) ninthStatus = response.status;
    }
    check("Remote pairing rate-limits the ninth failed attempt", () =>
      assert.equal(ninthStatus, 429),
    );
  } finally {
    await rateServer.stop();
  }

  const resilientServer = new RemoteAccessServer(state, async () => undefined);
  const resilient = await resilientServer.start();
  try {
    const headers = {
      "content-type": "application/json",
      "x-relay-request": "mobile",
    };
    const staleTicketPair = await fetch(
      `http://127.0.0.1:${resilient.port}/api/pair`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          ticket: "stale-or-missing-ticket",
          code: resilient.pairingCode,
          name: "qr-recovery-phone",
        }),
      },
    );
    check(
      "Remote pairing accepts the current six-digit code when the browser lost a stale QR query",
      () => assert.equal(staleTicketPair.status, 200),
    );
  } finally {
    await resilientServer.stop();
  }

  const wrongCodeServer = new RemoteAccessServer(state, async () => undefined);
  const wrongCode = await wrongCodeServer.start();
  try {
    const response = await fetch(
      `http://127.0.0.1:${wrongCode.port}/api/pair`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-relay-request": "mobile",
        },
        body: JSON.stringify({ ticket: "stale-ticket", code: "000000" }),
      },
    );
    const payload = (await response.json()) as any;
    check(
      "Remote pairing still rejects a wrong code when the QR ticket is stale",
      () => {
        assert.equal(response.status, 403);
        assert.match(payload.error, /QR aperto non è più quello corrente/);
      },
    );
  } finally {
    await wrongCodeServer.stop();
  }

  const pairingRouteServer = new RemoteAccessServer(
    state,
    async () => undefined,
  );
  await pairingRouteServer.start("funnel");
  await pairingRouteServer.configureExposure(
    "funnel",
    "https://relay-test.tail123.ts.net",
    {
      mode: "funnel",
      state: "ACTIVE",
      installed: true,
      dnsName: "relay-test.tail123.ts.net",
      publicPort: 443,
      baseUrl: "https://relay-test.tail123.ts.net",
      transitions: [],
    },
  );
  try {
    const currentTicket = new URL(
      pairingRouteServer.snapshot().url!,
    ).searchParams.get("t");
    const verified = await pairingRouteServer.verifyPublicPairingRoute(
      (async () =>
        new Response(
          JSON.stringify({
            ticket: currentTicket,
            instanceId: (pairingRouteServer as any).instanceId,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    );
    const stale = await pairingRouteServer.verifyPublicPairingRoute(
      (async () =>
        new Response(
          JSON.stringify({ ticket: "old-ticket", instanceId: "old-instance" }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    );
    check(
      "Public pairing route probe distinguishes the current Relay process from a stale Funnel target",
      () => {
        assert.equal(verified.ok, true);
        assert.equal(stale.ok, false);
        assert.match(
          stale.error ?? "",
          /altra istanza Relay|processo Relay precedente/,
        );
      },
    );
  } finally {
    await pairingRouteServer.stop();
  }

  const expiryServer = new RemoteAccessServer(state, async () => undefined);
  const expiring = await expiryServer.start();
  try {
    (expiryServer as any).ticket.createdAt = new Date(
      Date.now() - 11 * 60_000,
    ).toISOString();
    const ticket = new URL(expiring.url!).searchParams.get("t");
    const response = await fetch(`http://127.0.0.1:${expiring.port}/api/pair`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relay-request": "mobile",
      },
      body: JSON.stringify({ ticket, code: expiring.pairingCode }),
    });
    check("Remote pairing rejects expired tickets", () =>
      assert.equal(response.status, 410),
    );
  } finally {
    await expiryServer.stop();
  }
})();

void (async () => {
  const { mkdtemp, writeFile, readdir, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { AtomicJsonStore } = await import("./src/services/atomic-store.js");
  const root = await mkdtemp(join(tmpdir(), "relay-corrupt-store-"));
  try {
    const path = join(root, "preferences.json");
    await writeFile(path, '{"broken":', "utf8");
    const store = new AtomicJsonStore(path, { clean: true });
    const value = await store.read();
    check(
      "Malformed Relay storage is quarantined instead of bricking startup",
      () => {
        assert.deepEqual(value, { clean: true });
      },
    );
    value.clean = false;
    const cachedClone = await store.read();
    check("AtomicJsonStore cache returns isolated clones", () =>
      assert.deepEqual(cachedClone, { clean: true }),
    );
    await store.write({ clean: false });
    const updatedCache = await store.read();
    check("AtomicJsonStore writes update the in-memory cache", () =>
      assert.deepEqual(updatedCache, { clean: false }),
    );
    const files = await readdir(root);
    check("Corrupt storage payload is preserved for recovery", () => {
      assert.ok(
        files.some((name) => name.startsWith("preferences.json.corrupt-")),
      );
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
})();

import { access, readFile } from "node:fs/promises";
import {
  createProcessLaunchSpec,
  approximateArgvBytes,
} from "./src/services/process-launcher.js";
import { runCommand } from "./src/services/command-runner.js";
import { preparePromptTransport } from "./src/services/prompt-transport.js";
import { classifyProviderFailure } from "./src/services/provider-failure.js";
import { normalizeProviderHealth } from "./src/services/provider-health.js";
import {
  buildProviderRecoveryBundle,
  recoveryCandidates,
} from "./src/services/provider-recovery.js";
import {
  buildRunErrorRecoveryBundle,
  selectRunRecoveryProvider,
} from "./src/services/run-error-recovery.js";
import { ProviderRegistry } from "./src/services/provider-registry.js";
import {
  SkillManager,
  parseSkill,
  readCodexSkillsFlag,
  renderSkill,
} from "./src/services/skill-manager.js";
import {
  McpManager,
  buildClaudeAddArgs,
  buildCodexAddArgs,
  parseCodexMcpConfig,
  parseJsonMcpConfig,
  parseMcpListOutput,
  serializeCodexMcpConfig,
} from "./src/services/mcp-manager.js";
import { AutomationStore } from "./src/services/automation-store.js";
import {
  AutomationScheduler,
  computeNextRun,
  describeSchedule,
} from "./src/services/automation-scheduler.js";
import {
  createArtifactZip,
  discoverRemoteArtifacts,
  resolveConversationArtifact,
} from "./src/services/remote-artifacts.js";
import type { AgentProvider } from "./src/core/provider.js";
import type { ProviderId, ProviderStatus } from "./src/core/types.js";

async function checkAsync(
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
    console.log("  PASS", name);
  } catch (error) {
    console.error("  FAIL", name);
    throw error;
  }
}

void (async () => {
  console.log("process launcher and prompt transport");
  check(
    "Windows cmd wrapper preserves complex path and argument boundaries",
    () => {
      const executable =
        "C:\\Program Files (Relay) & strumenti\\Ünicode\\codex.cmd";
      const spec = createProcessLaunchSpec(
        executable,
        ["--version", "a & b", "(parentesi)", "L’utente"],
        "win32",
        "cmd.exe",
      );
      assert.equal(spec.executable, "cmd.exe");
      assert.deepEqual(spec.args.slice(0, 3), ["/d", "/s", "/c"]);
      assert.match(spec.args[3]!, /^chcp 65001>nul & call /);
      assert.ok(spec.args[3]!.includes(`"${executable}"`));
      assert.ok(spec.args[3]!.includes('"a & b"'));
      assert.ok(!spec.args[3]!.includes('\\"'));
    },
  );

  await checkAsync(
    "1 MB prompt is transported outside argv and reaches stdin intact",
    async () => {
      const prompt = "à-Relay-".repeat(128 * 1024);
      assert.ok(Buffer.byteLength(prompt, "utf8") >= 1024 * 1024);
      for (const provider of ["claude", "copilot"] as const) {
        const transport = await preparePromptTransport({
          provider,
          prompt,
          cwd: process.cwd(),
          executable: provider,
        });
        assert.equal(
          transport.stdin?.length,
          prompt.length + (provider === "copilot" ? 1 : 0),
        );
        assert.ok(transport.argvBytes < 4096);
        await transport.cleanup();
      }
      const result = await runCommand(
        process.execPath,
        [
          "-e",
          'let n=0;process.stdin.on("data",c=>n+=c.length);process.stdin.on("end",()=>console.log(n))',
        ],
        {
          stdin: prompt,
          timeoutMs: 10_000,
        },
      );
      assert.equal(result.exitCode, 0);
      assert.equal(Number(result.stdout.trim()), Buffer.byteLength(prompt));
      assert.ok(
        approximateArgvBytes(process.execPath, ["-e", "reader"]) < 4096,
      );
    },
  );

  await checkAsync(
    "Antigravity secure-file transport preserves 64 KB, 500 KB and 1 MB and cleans up",
    async () => {
      for (const size of [64 * 1024, 500 * 1024, 1024 * 1024]) {
        const prompt = "x".repeat(size);
        const transport = await preparePromptTransport({
          provider: "antigravity",
          prompt,
          cwd: process.cwd(),
          executable: "agy",
        });
        assert.equal(transport.mode, "secure-file");
        assert.ok(transport.temporaryFile);
        assert.equal(
          (await readFile(transport.temporaryFile!, "utf8")).length,
          size,
        );
        assert.ok(transport.argvBytes < 4096);
        await transport.cleanup();
        await assert.rejects(access(transport.temporaryFile!));
      }
    },
  );

  await checkAsync(
    "Attachment store writes absolute private files and removes expired payloads",
    async () => {
      const { mkdtemp, rm, stat, utimes } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { isAbsolute, join } = await import("node:path");
      const root = await mkdtemp(join(tmpdir(), "relay-attachments-"));
      try {
        const store = new AttachmentStore(root);
        const bytes = new TextEncoder().encode("relay attachment");
        const [saved] = await store.saveMany([
          {
            id: "file-1",
            name: "CON report?.md",
            mimeType: "text/markdown",
            size: bytes.byteLength,
            bytes,
          },
        ]);
        assert.ok(saved);
        assert.equal(isAbsolute(saved!.localPath), true);
        assert.equal(
          await readFile(saved!.localPath, "utf8"),
          "relay attachment",
        );
        assert.doesNotMatch(saved!.name, /[<>:"/\|?*]/);
        if (process.platform !== "win32")
          assert.equal((await stat(saved!.localPath)).mode & 0o777, 0o600);
        const expired = new Date(Date.now() - ATTACHMENT_RETENTION_MS - 5_000);
        await utimes(saved!.localPath, expired, expired);
        assert.equal(await store.cleanupExpired(), 1);
        await assert.rejects(access(saved!.localPath));
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  console.log("provider health and failure classification");
  check(
    "Executable plus version is not ready when model discovery fails",
    () => {
      const status = normalizeProviderHealth({
        id: "codex",
        label: "Codex",
        executable: "codex",
        available: true,
        models: [],
        capabilities: { modelSelection: true },
        probes: [
          {
            id: "resolve",
            ok: true,
            startedAt: new Date().toISOString(),
            durationMs: 1,
            message: "resolved",
          },
          {
            id: "version",
            ok: true,
            startedAt: new Date().toISOString(),
            durationMs: 1,
            message: "version",
          },
          {
            id: "launch",
            ok: true,
            startedAt: new Date().toISOString(),
            durationMs: 1,
            message: "launch",
          },
          {
            id: "models",
            ok: false,
            startedAt: new Date().toISOString(),
            durationMs: 1,
            message: "empty",
          },
        ],
      });
      assert.equal(status.healthState, "degraded");
      assert.equal(status.available, false);
    },
  );

  check(
    "Claude rate limit events abort only when the provider explicitly rejects the request",
    () => {
      assert.equal(
        isTerminalClaudeRateLimitEvent({
          type: "rate_limit_event",
          rate_limit_info: {
            status: "allowed",
            rateLimitType: "out_of_credits",
          },
        }),
        false,
      );
      assert.equal(
        isTerminalClaudeRateLimitEvent({
          type: "rate_limit_event",
          rate_limit_info: {
            status: "rejected",
            overageDisabledReason: "out_of_credits",
          },
        }),
        true,
      );
      assert.equal(
        isTerminalClaudeRateLimitEvent({
          type: "rate_limit_event",
          rate_limit_info: { rateLimitType: "out_of_credits" },
        }),
        false,
      );
    },
  );

  check(
    "Transient Claude usage failures keep the last valid quota visible as stale cache",
    () => {
      const previous: UsageSnapshot = {
        provider: "claude",
        available: true,
        remainingFraction: 0.72,
        source: "native-command",
        confidence: "provider-reported",
        updatedAt: "2026-07-19T10:00:00.000Z",
        buckets: [
          {
            id: "session",
            label: "Sessione",
            kind: "session",
            remainingFraction: 0.72,
          },
        ],
      };
      const fallback = fallbackClaudeUsage(
        previous,
        "Command timed out.",
        "2026-07-19T10:05:00.000Z",
      );
      assert.equal(fallback.available, true);
      assert.equal(fallback.stale, true);
      assert.equal(fallback.source, "cache");
      assert.equal(fallback.remainingFraction, 0.72);
      assert.equal(fallback.lastSuccessfulAt, previous.updatedAt);
      assert.match(fallback.lastError ?? "", /timed out/i);
    },
  );

  check(
    "macOS retries transient usage reads but skips permanent setup failures",
    () => {
      assert.deepEqual(usageRetryDelays("darwin"), [700]);
      assert.deepEqual(usageRetryDelays("linux"), []);
      assert.equal(
        shouldRetryUsageSnapshot({
          provider: "codex",
          available: false,
          detail: "Socket temporarily unavailable.",
          source: "unavailable",
          confidence: "unknown",
          updatedAt: new Date().toISOString(),
        }),
        true,
      );
      assert.equal(
        shouldRetryUsageSnapshot({
          provider: "copilot",
          available: false,
          detail:
            "Collega un token GitHub fine-grained con permesso Plan: read.",
          source: "unavailable",
          confidence: "unknown",
          updatedAt: new Date().toISOString(),
        }),
        false,
      );
    },
  );

  check(
    "Provider failures are classified without exposing raw protocol as user message",
    () => {
      const fixtures: Array<[string, string]> = [
        [
          "rate-limit",
          '{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","overageDisabledReason":"out_of_credits","resetTime":"2026-07-18T02:10:00Z"}}',
        ],
        ["authentication", "Not logged in. Login required."],
        [
          "permission-denied",
          "command permission auto-denied in headless mode",
        ],
        ["payload-too-large", "spawn E2BIG"],
        [
          "launch-failed",
          "Codex app-server stopped with code 1. non è riconosciuto come comando",
        ],
        ["model-discovery", "Unknown model gpt-does-not-exist"],
        ["timeout", "Command timed out after 25000 ms"],
      ];
      for (const [category, raw] of fixtures) {
        const failure = classifyProviderFailure("claude", raw);
        assert.equal(failure.category, category);
        assert.ok(failure.message.length < 300);
        assert.ok(!failure.message.includes('{"type"'));
      }
    },
  );

  await checkAsync(
    "Remote artifacts discover workspace files, static previews, loopback apps and downloadable bundles",
    async () => {
      const { mkdtemp, mkdir, writeFile, rm } =
        await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const root = await mkdtemp(join(tmpdir(), "relay-remote-artifacts-"));
      try {
        await mkdir(join(root, "site"), { recursive: true });
        await writeFile(
          join(root, "site", "index.html"),
          '<!doctype html><link rel="stylesheet" href="/style.css"><h1>Relay</h1>',
        );
        await writeFile(join(root, "site", "style.css"), "body{color:orange}");
        await writeFile(join(root, "report.md"), "# Report Relay");
        await writeFile(join(root, ".env"), "SECRET=do-not-share");
        const artifacts = await discoverRemoteArtifacts({
          workspaceRoot: root,
          text: `Creato [report.md](${join(root, "report.md")}). Anteprima su http://localhost:4173/`,
          changedFiles: ["site/index.html", "site/style.css"],
        });
        assert.ok(
          artifacts.some(
            (artifact) =>
              artifact.kind === "static-site" &&
              artifact.relativePath === "site/index.html",
          ),
        );
        assert.ok(
          artifacts.some(
            (artifact) =>
              artifact.kind === "file" && artifact.relativePath === "report.md",
          ),
        );
        assert.ok(
          artifacts.some(
            (artifact) =>
              artifact.kind === "local-service" &&
              artifact.localUrl === "http://localhost:4173/",
          ),
        );
        assert.ok(
          !artifacts.some((artifact) => artifact.relativePath === ".env"),
        );
        const bundle = artifacts.find((artifact) => artifact.kind === "bundle");
        assert.ok(bundle);
        const resolved = await resolveConversationArtifact(root, bundle!);
        assert.ok(resolved?.files?.length && resolved.files.length >= 2);
        const zip = await createArtifactZip(resolved!);
        assert.equal(zip.subarray(0, 2).toString("binary"), "PK");
        assert.match(zip.toString("utf8"), /site\/index\.html/);
        const escaped = await resolveConversationArtifact(root, {
          id: "x",
          kind: "file",
          name: "passwd",
          relativePath: "../etc/passwd",
          createdAt: new Date().toISOString(),
        });
        assert.equal(escaped, undefined);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  await checkAsync(
    "Provider detection publishes fast providers before slow or failed providers and is single-flight",
    async () => {
      const calls = new Map<ProviderId, number>();
      const make = (
        id: ProviderId,
        delay: number,
        result: "ready" | "fail" | "missing",
      ): AgentProvider => ({
        id,
        async detect(signal?: AbortSignal): Promise<ProviderStatus> {
          calls.set(id, (calls.get(id) ?? 0) + 1);
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, delay);
            signal?.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                reject(new Error("timeout"));
              },
              { once: true },
            );
          });
          if (result === "fail") throw new Error("launch failed");
          if (result === "missing")
            return {
              id,
              label: id,
              executable: id,
              available: false,
              setupState: "not-installed",
              healthState: "not-installed",
              models: [],
            };
          return {
            id,
            label: id,
            executable: id,
            available: true,
            operational: true,
            healthState: "ready",
            authenticated: true,
            models: [{ id: "auto", label: "Auto", reasoning: [] }],
            capabilities: { modelSelection: true },
            probes: [
              {
                id: "resolve",
                ok: true,
                startedAt: new Date().toISOString(),
                durationMs: 1,
                message: "ok",
              },
              {
                id: "launch",
                ok: true,
                startedAt: new Date().toISOString(),
                durationMs: 1,
                message: "ok",
              },
              {
                id: "authentication",
                ok: true,
                startedAt: new Date().toISOString(),
                durationMs: 1,
                message: "ok",
              },
              {
                id: "models",
                ok: true,
                startedAt: new Date().toISOString(),
                durationMs: 1,
                message: "ok",
              },
              {
                id: "smoke",
                ok: true,
                startedAt: new Date().toISOString(),
                durationMs: 1,
                message: "ok",
              },
            ],
          };
        },
        async listModels() {
          return [];
        },
        async getUsage() {
          return {
            provider: id,
            available: false,
            source: "unavailable",
            confidence: "unknown",
            updatedAt: new Date().toISOString(),
          };
        },
        async run() {
          throw new Error("unused");
        },
        async dispose() {},
      });
      const registry = new ProviderRegistry(
        [
          make("codex", 80, "ready"),
          make("claude", 2, "ready"),
          make("antigravity", 4, "fail"),
          make("copilot", 3, "missing"),
        ],
        5,
      );
      const timeline: Array<{ id: ProviderId; state?: string; at: number }> =
        [];
      registry.onStatus((status) =>
        timeline.push({
          id: status.id,
          state: status.healthState,
          at: Date.now(),
        }),
      );
      const first = registry.detectAll({ timeoutMs: 40 });
      const second = registry.detectAll({ timeoutMs: 40 });
      await new Promise((resolve) => setTimeout(resolve, 12));
      assert.ok(
        timeline.some(
          (entry) => entry.id === "claude" && entry.state === "ready",
        ),
      );
      assert.ok(
        registry.currentStatuses().find((entry) => entry.id === "codex")
          ?.healthState === "detecting",
      );
      await Promise.all([first, second]);
      assert.equal(calls.get("codex"), 1);
      assert.equal(calls.get("claude"), 1);
      assert.equal(
        registry.currentStatuses().find((entry) => entry.id === "codex")
          ?.healthState,
        "degraded",
      );
      assert.equal(
        registry.currentStatuses().find((entry) => entry.id === "antigravity")
          ?.healthState,
        "degraded",
      );
      assert.equal(
        registry.currentStatuses().find((entry) => entry.id === "copilot")
          ?.healthState,
        "not-installed",
      );
      await registry.dispose();
    },
  );

  check(
    "Run error recovery selects another healthy provider and builds a sanitized full incident bundle",
    () => {
      const providers: ProviderStatus[] = [
        {
          id: "codex",
          label: "Codex",
          executable: "codex",
          available: true,
          healthState: "ready",
          models: [],
        },
        {
          id: "claude",
          label: "Claude",
          executable: "claude",
          available: true,
          connected: true,
          healthState: "ready",
          models: [],
        },
        {
          id: "antigravity",
          label: "Antigravity",
          executable: "agy",
          available: false,
          healthState: "degraded",
          models: [],
        },
        {
          id: "copilot",
          label: "Copilot",
          executable: "copilot",
          available: false,
          connected: false,
          healthState: "disconnected",
          models: [],
        },
      ];
      assert.equal(selectRunRecoveryProvider("codex", providers), "claude");
      const bundle = buildRunErrorRecoveryBundle({
        runId: "run-failed",
        failedProvider: "codex",
        activeRun: {
          id: "run-failed",
          conversationId: "c1",
          provider: "codex",
          permission: "workspace-write",
          phase: "failed",
          status: "Process exited 1",
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          model: "gpt-5",
          reasoning: "high",
          error: "Authorization: Bearer secret-value failed",
          originalPrompt: "Correggi il launcher",
          partialChanges: ["src/launcher.ts"],
          activities: [{ title: "Avvio comando", detail: "exit code 1" }],
        },
        diagnostics: "ghp_12345678901234567890 command failed",
        platform: "win32",
        arch: "x64",
        editor: "Antigravity IDE",
        tunnel: { state: "DEGRADED", url: "https://example.ts.net" },
      });
      assert.equal(bundle.failedRun.provider, "codex");
      assert.equal(bundle.failedRun.model, "gpt-5");
      assert.equal(bundle.failedRun.reasoning, "high");
      assert.equal(bundle.failedRun.partialChanges[0], "src/launcher.ts");
      assert.equal(bundle.environment.editor, "Antigravity IDE");
      assert.ok(bundle.tunnel);
      assert.ok(!bundle.failedRun.error.includes("secret-value"));
      assert.ok(!bundle.diagnostics.includes("ghp_"));
    },
  );

  await checkAsync(
    "Skill manager publishes, updates and removes only Relay-managed SKILL.md files",
    async () => {
      const { mkdtemp, mkdir, writeFile, readFile, access, rm } =
        await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const root = await mkdtemp(join(tmpdir(), "relay-skills-"));
      const home = join(root, "home");
      const workspace = join(root, "workspace");
      try {
        await mkdir(join(workspace, ".claude", "skills", "manual"), {
          recursive: true,
        });
        const manualPath = join(
          workspace,
          ".claude",
          "skills",
          "manual",
          "SKILL.md",
        );
        await writeFile(
          manualPath,
          '---\nname: manual\ndescription: "Utente"\n---\n\nNon toccare.\n',
        );
        const manager = new SkillManager({ homeDir: home });
        const rule = {
          id: "rule-1",
          name: "Review chirurgica",
          description: "Controlla le modifiche quando serve",
          content: "Leggi i file prima di modificarli.",
          scope: "project" as const,
          projectId: "p1",
          providers: ["claude", "codex"] as ProviderId[],
          priority: 100,
          enabled: true,
          path: "relay://rule-1",
          skillPublication: {
            enabled: true,
            providers: ["claude", "codex"] as ProviderId[],
          },
        };
        const first = await manager.syncAll([rule], workspace);
        assert.equal(first.created, 2);
        const claudePath = join(
          workspace,
          ".claude",
          "skills",
          "review-chirurgica",
          "SKILL.md",
        );
        const codexPath = join(
          workspace,
          ".agents",
          "skills",
          "review-chirurgica",
          "SKILL.md",
        );
        const claudeRaw = await readFile(claudePath, "utf8");
        assert.equal(parseSkill(claudeRaw)?.ruleId, "rule-1");
        assert.match(
          claudeRaw,
          /description: "Controlla le modifiche quando serve"/,
        );
        const second = await manager.syncAll(
          [{ ...rule, content: "Nuovo corpo della regola." }],
          workspace,
        );
        assert.ok(second.updated >= 2);
        assert.match(await readFile(codexPath, "utf8"), /Nuovo corpo/);
        assert.equal(
          await readFile(manualPath, "utf8"),
          '---\nname: manual\ndescription: "Utente"\n---\n\nNon toccare.\n',
        );
        const third = await manager.syncAll([], workspace);
        assert.equal(third.removed, 2);
        await assert.rejects(access(claudePath));
        await access(manualPath);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  await checkAsync(
    "Codex skill flag is parsed and enabled with a backup",
    async () => {
      const { mkdtemp, mkdir, writeFile, readFile, access, rm } =
        await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const root = await mkdtemp(join(tmpdir(), "relay-codex-skill-"));
      try {
        const config = join(root, ".codex", "config.toml");
        await mkdir(join(root, ".codex"), { recursive: true });
        await writeFile(config, "[features]\nskills = false\n");
        assert.equal(await readCodexSkillsFlag(config), false);
        const manager = new SkillManager({ homeDir: root });
        await manager.enableCodexSkills();
        assert.equal(await readCodexSkillsFlag(config), true);
        await access(config + ".relay-bak");
        assert.match(await readFile(config, "utf8"), /skills = true/);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  check(
    "Skill frontmatter uses a stable slug, description and Relay marker",
    () => {
      const raw = renderSkill({
        id: "r-77",
        name: "È una Regola Importante!",
        description: "Caricamento automatico",
        content: "# Istruzioni",
        scope: "global",
        providers: ["claude"],
        priority: 10,
        enabled: true,
        path: "relay://r-77",
      });
      const parsed = parseSkill(raw);
      assert.equal(parsed?.name, "e-una-regola-importante");
      assert.equal(parsed?.description, "Caricamento automatico");
      assert.equal(parsed?.ruleId, "r-77");
    },
  );

  console.log("mcp manager");
  await checkAsync(
    "MCP parsers cover Claude, Codex, Copilot and Antigravity formats",
    async () => {
      const codex = parseCodexMcpConfig(
        {
          mcp_servers: {
            fs: {
              command: "npx",
              args: ["-y", "@mcp/fs"],
              env: { ROOT: "/tmp" },
            },
            web: {
              url: "https://mcp.example.test",
              bearer_token_env_var: "MCP_TOKEN",
            },
          },
        },
        "global",
      );
      assert.equal(codex.length, 2);
      assert.equal(
        codex.find((item) => item.name === "web")?.transport,
        "http",
      );
      const roundTrip = parseCodexMcpConfig(
        (await import("smol-toml")).parse(
          serializeCodexMcpConfig(
            codex.map((entry) => ({
              provider: entry.provider,
              name: entry.name,
              transport: entry.transport,
              target: entry.target,
              scope: entry.scope,
              args: entry.args,
              env: entry.env,
              bearerTokenEnvVar: entry.bearerTokenEnvVar,
            })),
          ),
        ) as any,
        "global",
      );
      assert.deepEqual(roundTrip.map((item) => item.name).sort(), [
        "fs",
        "web",
      ]);
      const copilot = parseJsonMcpConfig(
        {
          mcpServers: { github: { url: "https://api.githubcopilot.com/mcp/" } },
        },
        "copilot",
        "project",
      );
      assert.equal(copilot[0]?.target, "https://api.githubcopilot.com/mcp/");
      const antigravity = parseJsonMcpConfig(
        {
          mcpServers: { active: { command: "node", args: ["server.js"] } },
          _relayDisabled: { paused: { serverUrl: "https://paused.example" } },
        },
        "antigravity",
        "global",
      );
      assert.equal(
        antigravity.find((item) => item.name === "paused")?.enabled,
        false,
      );
      const claude = parseMcpListOutput(
        "claude",
        "filesystem: npx connected\nremote: https://mcp.example.test failed",
      );
      assert.equal(
        claude.find((item) => item.name === "filesystem")?.status,
        "connected",
      );
      assert.equal(
        claude.find((item) => item.name === "remote")?.transport,
        "http",
      );
    },
  );

  check(
    "MCP cross-provider command translation preserves stdio and HTTP definitions",
    () => {
      const stdio = {
        provider: "claude" as const,
        name: "files",
        transport: "stdio" as const,
        target: "npx",
        args: ["-y", "@mcp/fs"],
        env: { ROOT: "/repo" },
        scope: "project" as const,
      };
      assert.deepEqual(buildClaudeAddArgs(stdio), [
        "mcp",
        "add",
        "--scope",
        "project",
        "--env",
        "ROOT=/repo",
        "files",
        "--",
        "npx",
        "-y",
        "@mcp/fs",
      ]);
      assert.deepEqual(buildCodexAddArgs({ ...stdio, provider: "codex" }), [
        "mcp",
        "add",
        "files",
        "--env",
        "ROOT=/repo",
        "--",
        "npx",
        "-y",
        "@mcp/fs",
      ]);
      assert.deepEqual(
        buildCodexAddArgs({
          provider: "codex",
          name: "remote",
          transport: "http",
          target: "https://mcp.example",
          bearerTokenEnvVar: "MCP_TOKEN",
          scope: "global",
        }),
        [
          "mcp",
          "add",
          "remote",
          "--url",
          "https://mcp.example",
          "--bearer-token-env-var",
          "MCP_TOKEN",
        ],
      );
    },
  );

  await checkAsync(
    "MCP toggles are reversible and configuration writes create backups",
    async () => {
      const { mkdtemp, mkdir, writeFile, readFile, access, rm } =
        await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const root = await mkdtemp(join(tmpdir(), "relay-mcp-"));
      const home = join(root, "home");
      const workspace = join(root, "workspace");
      const calls: string[] = [];
      const runner = async (exe: string, args: string[]) => {
        calls.push(`${exe} ${args.join(" ")}`);
        if (args.join(" ") === "mcp list")
          return { stdout: "", stderr: "", exitCode: 0 };
        return { stdout: "ok", stderr: "", exitCode: 0 };
      };
      const providers: ProviderStatus[] = [
        "claude",
        "codex",
        "copilot",
        "antigravity",
      ].map((id) => ({
        id: id as ProviderId,
        label: id,
        available: true,
        executable: id,
        models: [],
      }));
      try {
        await mkdir(join(home, ".copilot"), { recursive: true });
        await mkdir(join(home, ".gemini", "config"), { recursive: true });
        await mkdir(workspace, { recursive: true });
        await writeFile(
          join(home, ".copilot", "mcp-config.json"),
          JSON.stringify(
            {
              mcpServers: {
                cp: {
                  command: "node",
                  args: ["cp.js"],
                  env: { API_TOKEN: "secret" },
                },
              },
            },
            null,
            2,
          ),
        );
        await writeFile(
          join(home, ".gemini", "config", "mcp_config.json"),
          JSON.stringify(
            { mcpServers: { ag: { command: "node", args: ["ag.js"] } } },
            null,
            2,
          ),
        );
        const manager = new McpManager({
          storagePath: join(root, "storage"),
          homeDir: home,
          runner: runner as any,
          cacheTtlMs: 0,
        });
        const initial = await manager.inventory(workspace, providers, true);
        assert.equal(
          initial.servers.find((item) => item.name === "cp")?.env?.API_TOKEN,
          "••••••",
        );
        await manager.toggle(
          { provider: "antigravity", name: "ag", scope: "global" },
          false,
          workspace,
          providers,
        );
        let agConfig = JSON.parse(
          await readFile(
            join(home, ".gemini", "config", "mcp_config.json"),
            "utf8",
          ),
        );
        assert.ok(agConfig._relayDisabled.ag);
        assert.equal(agConfig.mcpServers.ag, undefined);
        await access(
          join(home, ".gemini", "config", "mcp_config.json.relay-bak"),
        );
        await manager.toggle(
          { provider: "antigravity", name: "ag", scope: "global" },
          true,
          workspace,
          providers,
        );
        agConfig = JSON.parse(
          await readFile(
            join(home, ".gemini", "config", "mcp_config.json"),
            "utf8",
          ),
        );
        assert.ok(agConfig.mcpServers.ag);
        assert.equal(agConfig._relayDisabled.ag, undefined);
        await manager.toggle(
          { provider: "copilot", name: "cp", scope: "global" },
          false,
          workspace,
          providers,
        );
        await manager.toggle(
          { provider: "copilot", name: "cp", scope: "global" },
          true,
          workspace,
          providers,
        );
        assert.ok(
          calls.some((call) => call.includes("copilot mcp disable cp")),
        );
        assert.ok(calls.some((call) => call.includes("copilot mcp enable cp")));
        await manager.add(
          {
            providers: ["antigravity"],
            name: "remote",
            transport: "http",
            target: "https://mcp.example",
            headers: { Authorization: "Bearer value" },
            scope: "global",
          },
          workspace,
          providers,
        );
        const final = await manager.inventory(workspace, providers, true);
        assert.ok(final.servers.some((item) => item.name === "remote"));
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  await checkAsync("MCP invalid JSON is never overwritten", async () => {
    const { mkdtemp, mkdir, writeFile, readFile, rm } =
      await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = await mkdtemp(join(tmpdir(), "relay-mcp-invalid-"));
    const config = join(root, "home", ".gemini", "config", "mcp_config.json");
    try {
      await mkdir(join(root, "home", ".gemini", "config"), { recursive: true });
      await writeFile(config, "{ not json");
      const manager = new McpManager({
        storagePath: join(root, "storage"),
        homeDir: join(root, "home"),
        runner: (async () => ({ stdout: "", stderr: "", exitCode: 0 })) as any,
      });
      const providers: ProviderStatus[] = [
        {
          id: "antigravity",
          label: "Antigravity",
          available: true,
          executable: "agy",
          models: [],
        },
      ];
      await assert.rejects(
        manager.add(
          {
            providers: ["antigravity"],
            name: "x",
            transport: "stdio",
            target: "node",
            scope: "global",
          },
          root,
          providers,
        ),
        /JSON non valido/,
      );
      assert.equal(await readFile(config, "utf8"), "{ not json");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  console.log("automation scheduler");
  check(
    "Automation next-run calculation covers interval, daily, weekly, once and expired periods",
    () => {
      const from = new Date(2026, 6, 20, 8, 30, 0, 0);
      assert.equal(
        computeNextRun({ kind: "interval", everyMinutes: 15 }, from)?.getTime(),
        from.getTime() + 15 * 60_000,
      );
      const daily = computeNextRun({ kind: "daily", time: "09:00" }, from)!;
      assert.equal(daily.getHours(), 9);
      assert.equal(daily.getDate(), from.getDate());
      const later = new Date(2026, 6, 20, 10, 0);
      assert.equal(
        computeNextRun({ kind: "daily", time: "09:00" }, later)?.getDate(),
        21,
      );
      const weekly = computeNextRun(
        { kind: "weekly", days: [1, 4], time: "09:00" },
        new Date(2026, 6, 20, 10, 0),
      )!;
      assert.equal(weekly.getDay(), 4);
      assert.equal(weekly.getHours(), 9);
      const onceAt = new Date(from.getTime() + 123_000).toISOString();
      assert.equal(
        computeNextRun({ kind: "once", at: onceAt }, from)?.toISOString(),
        onceAt,
      );
      assert.equal(
        computeNextRun(
          { kind: "once", at: new Date(from.getTime() - 1).toISOString() },
          from,
        ),
        undefined,
      );
      assert.equal(
        computeNextRun(
          {
            kind: "daily",
            time: "09:00",
            activeTo: new Date(from.getTime() - 1).toISOString(),
          },
          from,
        ),
        undefined,
      );
    },
  );

  check(
    "Automation scheduling respects local DST transitions without producing an invalid or past time",
    () => {
      const previous = process.env.TZ;
      process.env.TZ = "Europe/Rome";
      try {
        const beforeJump = new Date(2026, 2, 29, 1, 50, 0, 0);
        const next = computeNextRun(
          { kind: "daily", time: "02:30" },
          beforeJump,
        )!;
        assert.ok(Number.isFinite(next.getTime()));
        assert.ok(next.getTime() > beforeJump.getTime());
        assert.equal(next.getDate(), 29);
        assert.ok(next.getHours() === 3 || next.getHours() === 2);
      } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
      }
    },
  );

  check("Automation descriptions are readable for every schedule kind", () => {
    assert.equal(
      describeSchedule({ kind: "interval", everyMinutes: 15 }),
      "Ogni 15 minuti",
    );
    assert.equal(
      describeSchedule({ kind: "daily", time: "09:00" }),
      "Ogni giorno alle 09:00",
    );
    assert.match(
      describeSchedule({ kind: "weekly", days: [1, 4], time: "09:00" }),
      /lunedì e giovedì alle 09:00/,
    );
    assert.match(
      describeSchedule({ kind: "once", at: "2026-07-20T09:00:00.000Z" }),
      /Una volta/,
    );
  });

  await checkAsync(
    "Automation store persists schedules and keeps only the latest twenty executions",
    async () => {
      const { mkdtemp, rm } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const root = await mkdtemp(join(tmpdir(), "relay-auto-store-"));
      try {
        const store = new AutomationStore(join(root, "automations.json"));
        const saved = await store.upsert(
          {
            name: "Report",
            prompt: "Controlla il repo",
            projectId: "p1",
            permission: "workspace-write",
            delegationPolicy: "confirm",
            schedule: { kind: "interval", everyMinutes: 1 },
            enabled: true,
            missedPolicy: "skip",
          },
          new Date(Date.now() + 5 * 60_000).toISOString(),
        );
        assert.equal(saved.schedule.kind, "interval");
        assert.equal((saved.schedule as any).everyMinutes, 5);
        for (let index = 0; index < 23; index += 1)
          await store.recordRun(
            saved.id,
            {
              at: new Date(Date.now() + index).toISOString(),
              outcome: "ok",
              conversationId: `c-${index}`,
            },
            new Date(Date.now() + 60_000).toISOString(),
          );
        const loaded = await store.get(saved.id);
        assert.equal(loaded?.history?.length, 20);
        assert.equal(loaded?.history?.at(-1)?.conversationId, "c-22");
        const duplicate = await store.duplicate(saved.id);
        assert.equal(duplicate.enabled, false);
        assert.match(duplicate.name, /copia/);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  await checkAsync(
    "Automation scheduler applies catch-up once, records conversations and blocks overlap",
    async () => {
      const { mkdtemp, rm } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const root = await mkdtemp(join(tmpdir(), "relay-auto-scheduler-"));
      let release: (() => void) | undefined;
      let executions = 0;
      const nowValue = new Date(2026, 6, 20, 12, 0, 0);
      try {
        const store = new AutomationStore(join(root, "automations.json"));
        const saved = await store.upsert(
          {
            name: "Catch up",
            prompt: "Esegui",
            projectId: "p1",
            permission: "workspace-write",
            delegationPolicy: "confirm",
            schedule: { kind: "interval", everyMinutes: 5 },
            enabled: true,
            missedPolicy: "catchUpOnce",
          },
          new Date(nowValue.getTime() - 60_000).toISOString(),
        );
        const scheduler = new AutomationScheduler({
          store,
          now: () => new Date(nowValue),
          setTimer: (() => ({ unref() {} }) as any) as any,
          clearTimer: (() => undefined) as any,
          execute: async () => {
            executions += 1;
            if (executions > 1)
              await new Promise<void>((resolve) => {
                release = resolve;
              });
            return { conversationId: `conversation-${executions}` };
          },
        });
        await scheduler.start();
        assert.equal(executions, 1);
        assert.equal(
          (await store.get(saved.id))?.lastRun?.conversationId,
          "conversation-1",
        );
        const first = scheduler.runNow(saved.id);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const second = scheduler.runNow(saved.id);
        await second;
        release?.();
        await first;
        const history = (await store.get(saved.id))?.history ?? [];
        assert.ok(
          history.some(
            (entry) =>
              entry.outcome === "skipped" &&
              /ancora in corso/.test(entry.detail ?? ""),
          ),
        );
        scheduler.dispose();
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  check(
    "Cross-provider recovery excludes target, unhealthy providers and low-health loops",
    () => {
      const providers: ProviderStatus[] = [
        {
          id: "codex",
          label: "Codex",
          executable: "codex",
          available: false,
          healthState: "degraded",
          models: [],
        },
        {
          id: "claude",
          label: "Claude",
          executable: "claude",
          available: true,
          connected: true,
          healthState: "ready",
          models: [],
        },
        {
          id: "antigravity",
          label: "Antigravity",
          executable: "agy",
          available: false,
          healthState: "rate-limited",
          models: [],
        },
        {
          id: "copilot",
          label: "Copilot",
          executable: "copilot",
          available: false,
          connected: false,
          healthState: "disconnected",
          models: [],
        },
      ];
      assert.deepEqual(recoveryCandidates("codex", providers), ["claude"]);
      const bundle = buildProviderRecoveryBundle({
        target: providers[0]!,
        providers,
        diagnostics:
          "Authorization: Bearer secret-token-value ghp_12345678901234567890",
        pathValue: "/usr/local/bin:/home/user/.local/bin",
      });
      assert.equal(bundle.targetProvider, "codex");
      assert.ok(!bundle.technicalDetail.includes("ghp_"));
      assert.ok(!bundle.technicalDetail.includes("secret-token-value"));
      assert.equal(bundle.relevantPathEntries.length, 2);
      assert.ok(
        bundle.probableRelayFiles.some((file) =>
          file.includes("codex-app-server"),
        ),
      );
    },
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
