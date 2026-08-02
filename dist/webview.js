(() => {
  // src/ui/dom.ts
  function el(tag, className = "", text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== void 0) node.textContent = text;
    return node;
  }
  function button(className, label) {
    const node = el("button", className, label);
    node.type = "button";
    return node;
  }
  function icon(name, size = 18) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    for (const pathData of ICONS[name]) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData);
      svg.append(path);
    }
    return svg;
  }
  function iconButton(name, label, className = "icon-button") {
    const node = button(className);
    node.setAttribute("aria-label", label);
    node.title = label;
    node.append(icon(name));
    return node;
  }
  function select(value, options, className = "select-control") {
    const node = el("select", className);
    for (const option of options) {
      const item = el("option");
      item.value = option.value;
      item.textContent = option.label;
      item.disabled = Boolean(option.disabled);
      item.selected = option.value === value;
      node.append(item);
    }
    return node;
  }
  function formatRelativeTime(value) {
    const milliseconds = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(milliseconds)) return "";
    const minutes = Math.floor(milliseconds / 6e4);
    if (minutes < 1) return "ora";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}g`;
    return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }).format(new Date(value));
  }
  function formatClock(value) {
    return new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }
  function formatPercent(value) {
    if (value === void 0) return "\u2014";
    return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
  }
  function formatReset(value) {
    if (!value) return "Reset non disponibile";
    const distance = new Date(value).getTime() - Date.now();
    if (!Number.isFinite(distance)) return "Reset non disponibile";
    if (distance <= 0) return "Reset in corso";
    const minutes = Math.ceil(distance / 6e4);
    if (minutes < 60) return `Reset tra ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `Reset tra ${hours}h${rest ? ` ${rest}m` : ""}`;
  }
  function compactProviderVersion(value) {
    if (!value) return "Disponibile";
    const clean = value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, " ").replace(/\s+/g, " ").trim();
    const semantic = clean.match(/\bv?(\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?)\b/i)?.[1];
    return semantic ?? clean.replace(/\.\s*Run ['"]?copilot update['"]?[^.]*\.?/i, "").trim();
  }
  function providerLabel(id) {
    if (id === "claude") return "Claude Code";
    if (id === "antigravity") return "Antigravity";
    if (id === "copilot") return "GitHub Copilot";
    return "Codex";
  }
  function providerGlyph(id) {
    const node = el("span", `provider-glyph provider-glyph--${id}`);
    const name = id === "claude" ? "providerClaude" : id === "antigravity" ? "providerAntigravity" : id === "copilot" ? "providerCopilot" : "providerCodex";
    node.append(icon(name, 17));
    node.setAttribute("aria-hidden", "true");
    return node;
  }
  function agentGlyph(name) {
    const node = el("span", "agent-glyph");
    node.append(icon("agentEntity", 17));
    if (name) node.title = name;
    node.setAttribute("aria-hidden", "true");
    return node;
  }
  var ICONS = {
    chat: ["M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"],
    history: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v6h6", "M12 7v5l3 2"],
    remote: ["M5 12.5a10 10 0 0 1 14 0", "M8 15.5a6 6 0 0 1 8 0", "M11 18.5a2 2 0 0 1 2 0", "M7 3h10a2 2 0 0 1 2 2v3", "M5 21h14"],
    devices: ["M7 4h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M9 20h6", "M10 7h4"],
    folder: ["M3 7h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2"],
    gauge: ["M4 14a8 8 0 1 1 16 0", "M12 14l4-4", "M5 19h14"],
    rules: ["M9 4h11", "M9 12h11", "M9 20h11", "M4 4h.01", "M4 12h.01", "M4 20h.01"],
    settings: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V20H9.74v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 5.08 15a1.7 1.7 0 0 0-1.55-1H3.4v-3h.13a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1-1.55V4h3v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 18.92 10a1.7 1.7 0 0 0 1.55 1h.13v3h-.13a1.7 1.7 0 0 0-1.07 1z"],
    plus: ["M12 5v14", "M5 12h14"],
    search: ["m21 21-4.35-4.35", "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z"],
    arrowUp: ["M12 19V5", "m6 11 6-6 6 6"],
    chevronDown: ["m6 9 6 6 6-6"],
    chevronRight: ["m9 18 6-6-6-6"],
    more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
    stop: ["M8 8h8v8H8z"],
    refresh: ["M20 11a8 8 0 1 0-2.34 5.66", "M20 4v7h-7"],
    diagnostics: ["M4 4h16v16H4z", "M8 8h8", "M8 12h5", "M8 16h3"],
    pin: ["M12 17v5", "m5 3 14 14", "M8 4h8l-1 5 3 3H9l3-3z"],
    archive: ["M3 6h18", "M5 6v14h14V6", "M9 10h6"],
    edit: ["M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3z", "m14 8 3 3"],
    close: ["M6 6l12 12", "M18 6 6 18"],
    check: ["m5 12 4 4L19 6"],
    warning: ["M12 3 2 21h20z", "M12 9v4", "M12 17h.01"],
    external: ["M14 3h7v7", "M10 14 21 3", "M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"],
    code: ["m8 9-4 3 4 3", "m16 9 4 3-4 3", "m14 5-4 14"],
    shield: ["M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z", "M9 12l2 2 4-4"],
    lock: ["M7 11h10v9H7z", "M9 11V8a3 3 0 0 1 6 0v3"],
    workflow: ["M6 4v5", "M18 15v5", "M6 9h8a4 4 0 0 1 4 4v2", "M3 4h6", "M15 20h6"],
    clock: ["M12 8v5l3 2", "M12 3a9 9 0 1 0 9 9", "M9 3h6"],
    branch: ["M6 3v12", "M18 9v4a4 4 0 0 1-4 4H6", "M3 6h6", "M15 6h6", "M3 18h6"],
    sparkle: ["M12 3l1.2 4.2L17 9l-3.8 1.8L12 15l-1.2-4.2L7 9l3.8-1.8z", "M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z"],
    project: ["M4 5h16v14H4z", "M8 9h8", "M8 13h5"],
    trash: ["M4 7h16", "M9 7V4h6v3", "m7 7 1 13h8l1-13"],
    import: ["M12 3v12", "m8 11 4 4 4-4", "M5 21h14"],
    copy: ["M9 9h11v11H9z", "M4 15H3V4h11v1"],
    minus: ["M5 12h14"],
    providerCodex: ["M7 3h4a3 3 0 0 1 3 3v1", "M17 7v4a3 3 0 0 1-3 3h-1", "M17 17h-4a3 3 0 0 1-3-3v-1", "M7 17v-4a3 3 0 0 1 3-3h1", "M7 7h10v10H7z"],
    providerClaude: ["M12 2v20", "M2 12h20", "m4.93-7.07 14.14 14.14", "m19.07 4.93-14.14 14.14"],
    providerAntigravity: ["M12 2l1.45 6.55L20 10l-6.55 1.45L12 18l-1.45-6.55L4 10l6.55-1.45z", "M19 16l.65 2.35L22 19l-2.35.65L19 22l-.65-2.35L16 19l2.35-.65z"],
    providerCopilot: ["M8 7a4 4 0 0 0-4 4v5a4 4 0 0 0 4 4h2v-5H7v-4h3V7z", "M16 7a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-2v-5h3v-4h-3V7z", "M9 11h6v4H9z"],
    agentEntity: ["M12 3l1.8 4.7L19 9.5l-4 3.1.7 5.4-3.7-2.4L8.3 18l.7-5.4-4-3.1 5.2-1.8z", "M9.5 21h5"],
    logo: ["M5 5h5v5H5z", "M14 5h5v5h-5z", "M5 14h5v5H5z", "M14 14h5v5h-5z", "M10 7.5h4", "M7.5 10v4", "M16.5 10v4", "M10 16.5h4"]
  };

  // src/ui/screens/onboarding.ts
  function renderOnboarding(runtime2) {
    const state = runtime2.state;
    const page = el("main", "onboarding-page onboarding-page--minimal");
    if (!state) return page;
    const shell = el("section", "onboarding-shell onboarding-shell--minimal");
    const head = el("header", "onboarding-minimal-head");
    const identity = el("div", "onboarding-minimal-brand");
    identity.append(icon("logo", 20));
    const identityCopy = el("div");
    identityCopy.append(el("strong", "", "Relay"), el("span", "", "Workspace agentico locale"));
    identity.append(identityCopy);
    head.append(identity);
    const progress = el("div", "onboarding-minimal-progress");
    for (let index = 0; index < 3; index += 1) {
      const step = el("span", `${index === runtime2.onboardingStep ? "is-active" : ""} ${index < runtime2.onboardingStep ? "is-complete" : ""}`);
      step.textContent = index < runtime2.onboardingStep ? "\u2713" : String(index + 1);
      progress.append(step);
    }
    head.append(progress);
    shell.append(head);
    const body = el("div", "onboarding-minimal-body");
    if (runtime2.onboardingStep === 0) body.append(renderDetection(runtime2));
    if (runtime2.onboardingStep === 1) body.append(renderDefaults(runtime2));
    if (runtime2.onboardingStep === 2) body.append(renderFinish(runtime2));
    shell.append(body);
    const footer = el("footer", "onboarding-minimal-footer");
    const back = button("button button--ghost", "Indietro");
    back.disabled = runtime2.onboardingStep === 0;
    back.addEventListener("click", () => {
      runtime2.onboardingStep = Math.max(0, runtime2.onboardingStep - 1);
      runtime2.render();
    });
    footer.append(back);
    const next = button("button button--primary");
    next.append(el("span", "", runtime2.onboardingStep === 2 ? "Apri Relay" : "Continua"), icon("arrowUp", 15));
    next.addEventListener("click", () => {
      if (runtime2.onboardingStep === 2) runtime2.post({ type: "completeOnboarding" });
      else {
        runtime2.onboardingStep += 1;
        runtime2.render();
      }
    });
    footer.append(next);
    shell.append(footer);
    page.append(shell);
    return page;
  }
  function renderDetection(runtime2) {
    const state = runtime2.state;
    const section = el("section", "onboarding-minimal-panel");
    section.append(sectionIntro("Agenti locali", "Quattro agenti, un\u2019unica chat.", "Relay usa gli account gi\xE0 autenticati sul computer."));
    const list = el("div", "onboarding-agent-list");
    for (const provider of state.providers) {
      const cliMissing = provider.id === "antigravity" && provider.nativeBridgeAvailable && provider.cliAvailable === false;
      const row = el("article", `onboarding-agent-row ${cliMissing ? "has-secondary-setup" : ""} ${provider.connected === false ? "is-disconnected" : ""}`);
      row.append(providerGlyph(provider.id));
      const copy = el("div", "onboarding-agent-row__copy");
      copy.append(el("strong", "", provider.label));
      copy.append(el("span", provider.setupError ? "provider-setup-error" : "", provider.connected === false ? "Scollegato da Relay \xB7 account invariato" : provider.setupProgress ?? (cliMissing ? "IDE pronto \xB7 AGY CLI non installata" : provider.available ? compactVersion(provider.version) : "CLI non rilevata")));
      if (provider.setupError) copy.append(el("small", "provider-setup-error__detail", provider.setupError));
      row.append(copy);
      const authUnknown = provider.id === "copilot" && provider.available && provider.authenticated === void 0;
      const ready = provider.connected !== false && provider.available && provider.authenticated !== false && !authUnknown && !provider.setupInProgress && !provider.setupError;
      const stateNode = el("span", `onboarding-agent-state ${ready ? "is-ready" : "is-missing"} ${provider.setupInProgress ? "is-progress" : ""}`);
      stateNode.append(el("span", "health-dot"));
      stateNode.append(el("span", "", provider.connected === false ? "Ricollega" : provider.setupInProgress ? "In corso\u2026" : provider.setupError ? "Riprova" : cliMissing ? "Installa CLI" : provider.available ? provider.authenticated === false ? "Accedi" : authUnknown ? "Verifica accesso" : "Pronto" : "Configura"));
      if (!provider.setupInProgress && (provider.connected === false || provider.setupError || cliMissing || !provider.available || provider.authenticated === false || authUnknown)) {
        stateNode.tabIndex = 0;
        stateNode.setAttribute("role", "button");
        stateNode.addEventListener("click", () => runtime2.post({
          type: provider.connected === false ? "connectProvider" : cliMissing || !provider.available ? "installProvider" : "openProviderSetup",
          payload: { provider: provider.id }
        }));
        stateNode.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") stateNode.click();
        });
      }
      row.append(stateNode);
      if (ready) {
        const disconnect = button("button button--ghost button--small onboarding-agent-disconnect");
        disconnect.append(icon("close", 13), el("span", "", "Scollega"));
        disconnect.title = `Scollega ${provider.label} solo da Relay`;
        disconnect.addEventListener("click", () => runtime2.post({ type: "disconnectProvider", payload: { provider: provider.id } }));
        row.append(disconnect);
      }
      list.append(row);
    }
    section.append(list);
    const actions = el("div", "onboarding-minimal-actions");
    const refresh = button("button button--ghost button--small");
    refresh.append(icon("refresh", 14), el("span", "", "Rileva di nuovo"));
    refresh.addEventListener("click", () => runtime2.post({ type: "refreshProviders" }));
    const diagnostics = button("button button--ghost button--small");
    diagnostics.append(icon("diagnostics", 14), el("span", "", "Diagnostica"));
    diagnostics.addEventListener("click", () => runtime2.post({ type: "openDiagnostics" }));
    actions.append(refresh, diagnostics);
    section.append(actions);
    return section;
  }
  function renderDefaults(runtime2) {
    const state = runtime2.state;
    const section = el("section", "onboarding-minimal-panel");
    section.append(sectionIntro("Default", "Scegli solo il punto di partenza.", "Provider, modello e thinking restano sempre modificabili nel composer."));
    const defaultRow = el("label", "onboarding-default-provider");
    defaultRow.append(el("span", "", "Agente iniziale"));
    const providerSelect = select(
      state.preferences.defaultProvider,
      state.providers.map((provider) => ({ value: provider.id, label: provider.label, disabled: !provider.available })),
      "premium-select"
    );
    providerSelect.addEventListener("change", () => runtime2.post({ type: "updatePreferences", payload: { defaultProvider: providerSelect.value } }));
    defaultRow.append(wrapSelect(providerSelect));
    section.append(defaultRow);
    const list = el("div", "onboarding-default-list");
    for (const provider of state.providers.filter((entry) => entry.available)) {
      const current = state.preferences.providerDefaults[provider.id];
      const row = el("article", "onboarding-default-row");
      const heading = el("div", "onboarding-default-row__identity");
      heading.append(providerGlyph(provider.id));
      const headingCopy = el("div");
      headingCopy.append(el("strong", "", provider.label));
      const models = provider.models.length ? provider.models : [{ id: "auto", label: "Automatico", reasoning: [] }];
      const selectedModel2 = models.find((model) => model.id === current.model) ?? models.find((model) => model.isDefault) ?? models[0];
      const usage = usageForModel(state.usage.find((entry) => entry.provider === provider.id), selectedModel2?.family ?? selectedModel2?.label);
      headingCopy.append(el("span", "", usage?.available ? `${formatPercent(usage.remainingFraction)} disponibile` : "Quota non letta"));
      heading.append(headingCopy);
      row.append(heading);
      const modelSelect = select(current.model, [
        { value: "auto", label: "Automatico" },
        ...models.filter((model) => model.id !== "auto").map((model) => ({ value: model.id, label: model.label }))
      ], "premium-select");
      const reasoningSelect = select(current.reasoning, [
        { value: "auto", label: "Auto" },
        ...(selectedModel2?.reasoning ?? []).map((option) => ({ value: option.id, label: option.label }))
      ], "premium-select");
      reasoningSelect.disabled = (selectedModel2?.reasoning.length ?? 0) === 0;
      modelSelect.addEventListener("change", () => runtime2.post({ type: "updateProviderDefaults", payload: { provider: provider.id, model: modelSelect.value, reasoning: "auto" } }));
      reasoningSelect.addEventListener("change", () => runtime2.post({ type: "updateProviderDefaults", payload: { provider: provider.id, reasoning: reasoningSelect.value } }));
      const controls = el("div", "onboarding-default-row__controls");
      controls.append(wrapSelect(modelSelect), wrapSelect(reasoningSelect));
      row.append(controls);
      list.append(row);
    }
    section.append(list);
    return section;
  }
  function renderFinish(runtime2) {
    const state = runtime2.state;
    const section = el("section", "onboarding-minimal-panel onboarding-minimal-panel--finish");
    const check = el("div", "onboarding-ready-mark");
    check.append(icon("check", 22));
    section.append(check);
    section.append(sectionIntro("Pronto", "Inizia da una conversazione.", `${state.providers.filter((provider) => provider.available).length} agenti disponibili \xB7 ${state.workspace.name}`));
    const note = el("div", "onboarding-finish-note");
    note.append(icon("sparkle", 16));
    const bundledTemplates = state.agents.filter((agent) => agent.bundledTemplate).length;
    note.append(el("span", "", bundledTemplates ? `${bundledTemplates} agenti template pronti e disattivati: attivali solo quando servono per risparmiare token.` : "Relay preparer\xE0 5 agenti template disattivati sul primo provider disponibile."));
    section.append(note);
    return section;
  }
  function sectionIntro(kicker, title, description) {
    const intro = el("div", "onboarding-minimal-copy");
    intro.append(el("span", "eyebrow", kicker), el("h1", "", title), el("p", "", description));
    return intro;
  }
  function usageForModel(usage, modelFamilyOrLabel) {
    if (!usage?.buckets?.length || !modelFamilyOrLabel) return usage;
    const target = /^Gemini/i.test(modelFamilyOrLabel) ? "gemini" : /Claude|GPT/i.test(modelFamilyOrLabel) ? "claude" : "";
    if (!target) return usage;
    const buckets = usage.buckets.filter((bucket) => (bucket.group ?? bucket.label).toLowerCase().includes(target));
    const constrained = [...buckets].sort((a, b) => (a.remainingFraction ?? 1) - (b.remainingFraction ?? 1))[0];
    if (!constrained) return usage;
    return {
      ...usage,
      ...constrained.remainingFraction !== void 0 ? { remainingFraction: constrained.remainingFraction } : {},
      ...constrained.usedFraction !== void 0 ? { usedFraction: constrained.usedFraction } : {},
      ...constrained.resetsAt ? { resetsAt: constrained.resetsAt } : {}
    };
  }
  function compactVersion(value) {
    if (!value) return "Installazione rilevata";
    return value.replace(/\s*\(Claude Code\)\s*/i, "").trim();
  }
  function wrapSelect(control) {
    const shell = el("span", "select-shell");
    shell.append(control, icon("chevronDown", 14));
    return shell;
  }

  // src/ui/markdown.ts
  function renderMarkdown(text, options = {}) {
    const container = el("div", "markdown");
    const blocks = splitCodeBlocks(text);
    for (const block of blocks) {
      if (block.type === "code") {
        const wrapper = el("div", "code-block");
        const header = el("div", "code-block__header");
        header.append(el("span", "", block.language || "code"));
        const copy = el("button", "code-block__copy", "Copia");
        copy.type = "button";
        copy.addEventListener("click", async () => {
          await navigator.clipboard.writeText(block.content);
          copy.textContent = "Copiato";
          setTimeout(() => {
            copy.textContent = "Copia";
          }, 1200);
        });
        header.append(copy);
        const pre = el("pre");
        const code = el("code");
        code.textContent = block.content;
        pre.append(code);
        wrapper.append(header, pre);
        container.append(wrapper);
      } else {
        renderTextBlock(container, block.content, options);
      }
    }
    return container;
  }
  function renderTextBlock(container, text, options) {
    const lines = text.split(/\r?\n/);
    let list;
    for (let index = 0; index < lines.length; index += 1) {
      const rawLine = lines[index] ?? "";
      const line = rawLine.trimEnd();
      const next = lines[index + 1]?.trim() ?? "";
      if (isTableHeader(line, next)) {
        list = void 0;
        const tableLines = [line];
        index += 2;
        while (index < lines.length) {
          const row = lines[index]?.trimEnd() ?? "";
          if (!row.trim() || !row.includes("|")) {
            index -= 1;
            break;
          }
          tableLines.push(row);
          index += 1;
        }
        container.append(renderTable(tableLines, options));
        continue;
      }
      if (!line.trim()) {
        list = void 0;
        continue;
      }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        list = void 0;
        const level = Math.min(3, heading[1].length);
        const node = el(level === 1 ? "h2" : level === 2 ? "h3" : "h4");
        appendInline(node, heading[2], options);
        container.append(node);
        continue;
      }
      const unordered = line.match(/^[-*]\s+(.+)$/);
      const ordered = line.match(/^\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        const shouldOrder = Boolean(ordered);
        if (!list || shouldOrder && list.tagName !== "OL" || !shouldOrder && list.tagName !== "UL") {
          list = el(shouldOrder ? "ol" : "ul");
          container.append(list);
        }
        const item = el("li");
        appendInline(item, ordered?.[1] ?? unordered?.[1], options);
        list.append(item);
        continue;
      }
      if (line.startsWith("> ")) {
        list = void 0;
        const quote = el("blockquote");
        appendInline(quote, line.slice(2), options);
        container.append(quote);
        continue;
      }
      if (/^[-*_]{3,}\s*$/.test(line.trim())) {
        list = void 0;
        container.append(el("hr"));
        continue;
      }
      list = void 0;
      const paragraph = el("p");
      appendInline(paragraph, line.trim(), options);
      container.append(paragraph);
    }
  }
  function isTableHeader(line, separator) {
    if (!line.includes("|") || !separator.includes("|")) return false;
    const cells = tableCells(separator);
    return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
  }
  function renderTable(lines, options) {
    const wrapper = el("div", "markdown-table-wrap");
    const table = el("table", "markdown-table");
    const headerCells = tableCells(lines[0] ?? "");
    const head = el("thead");
    const headRow = el("tr");
    for (const cell of headerCells) {
      const th = el("th");
      appendInline(th, cell.trim(), options);
      headRow.append(th);
    }
    head.append(headRow);
    table.append(head);
    if (lines.length > 1) {
      const body = el("tbody");
      for (const line of lines.slice(1)) {
        const row = el("tr");
        const cells = tableCells(line);
        for (let index = 0; index < headerCells.length; index += 1) {
          const td = el("td");
          appendInline(td, (cells[index] ?? "").trim(), options);
          row.append(td);
        }
        body.append(row);
      }
      table.append(body);
    }
    wrapper.append(table);
    return wrapper;
  }
  function tableCells(line) {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    const cells = [];
    let current = "";
    let escaped = false;
    for (const character of trimmed) {
      if (escaped) {
        current += character;
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        current += character;
        continue;
      }
      if (character === "|") {
        cells.push(current);
        current = "";
        continue;
      }
      current += character;
    }
    cells.push(current);
    return cells;
  }
  function appendInline(parent, text, options) {
    const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(([^)]+)\)|@agent\[[^\]]+\]|@"[^"]+"|@[A-Za-z0-9_À-ÖØ-öø-ÿ-]+)/g;
    let index = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index === void 0) continue;
      if (match.index > index) parent.append(document.createTextNode(text.slice(index, match.index)));
      const token = match[0];
      const mentionedAgent = resolveAgentMention(token, options.agents ?? []);
      if (mentionedAgent) {
        const mention = el("span", "mention-chip mention-chip--agent");
        mention.append(el("span", "mention-chip__mark", "\u2726"), el("span", "", `@${mentionedAgent.name}`));
        mention.title = `Agente ${mentionedAgent.name}`;
        parent.append(mention);
      } else if (token.startsWith("`")) {
        const value = token.slice(1, -1);
        const code = el("code", "inline-code", value);
        if (looksLikeWorkspaceResource(value)) {
          code.dataset.relayResource = value;
          code.classList.add("inline-file-link");
          code.title = "Apri nell\u2019editor";
          code.tabIndex = 0;
          code.setAttribute("role", "link");
          code.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") code.click();
          });
        }
        parent.append(code);
      } else if (token.startsWith("**")) {
        parent.append(el("strong", "", token.slice(2, -2)));
      } else {
        const link = el("a", "markdown-link");
        const labelEnd = token.indexOf("](");
        const target = (match[2] ?? "").trim();
        link.textContent = token.slice(1, labelEnd);
        if (/^https?:\/\//i.test(target)) {
          link.href = target;
          link.target = "_blank";
          link.rel = "noreferrer";
        } else if (/^(?:file:\/\/|\/|[A-Za-z]:[\\/])/.test(target)) {
          link.href = "#";
          link.dataset.relayResource = target;
          link.classList.add("markdown-file-link");
          link.title = "Apri nell\u2019editor";
        } else {
          link.href = "#";
          link.dataset.relayResource = target;
          link.classList.add("markdown-file-link");
          link.title = "Apri nel progetto";
        }
        parent.append(link);
      }
      index = match.index + token.length;
    }
    if (index < text.length) parent.append(document.createTextNode(text.slice(index)));
  }
  function resolveAgentMention(token, agents) {
    const legacy = token.match(/^@agent\[([^\]]+)\]$/i)?.[1];
    if (legacy) return agents.find((agent) => agent.id === legacy);
    const visible = token.startsWith('@"') ? token.slice(2, -1) : token.startsWith("@") ? token.slice(1) : "";
    if (!visible) return void 0;
    return agents.find((agent) => agent.name.toLowerCase() === visible.toLowerCase());
  }
  function splitCodeBlocks(text) {
    const blocks = [];
    const pattern = /```([^\n]*)\n([\s\S]*?)```/g;
    let index = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index === void 0) continue;
      if (match.index > index) blocks.push({ type: "text", content: text.slice(index, match.index) });
      blocks.push({ type: "code", content: match[2] ?? "", language: (match[1] ?? "").trim() });
      index = match.index + match[0].length;
    }
    if (index < text.length) blocks.push({ type: "text", content: text.slice(index) });
    return blocks.length ? blocks : [{ type: "text", content: text }];
  }
  function looksLikeWorkspaceResource(value) {
    const candidate = value.trim();
    if (!candidate || candidate.length > 320 || /[\n\r]/.test(candidate)) return false;
    if (/^(?:https?:|[a-z]+:\/\/)/i.test(candidate) && !/^file:\/\//i.test(candidate)) return false;
    return /^(?:file:\/\/|\.{0,2}[\\/]|~[\\/]|[A-Za-z]:[\\/])/.test(candidate) || /(?:^|[\\/])[\w.@+\- ()]+\.(?:[a-z0-9]{1,12})(?::\d+(?::\d+)?)?$/i.test(candidate) || /^[\w.@+\- ()]+\.(?:md|txt|json|ya?ml|toml|tsx?|jsx?|css|scss|html?|php|py|rb|go|rs|java|kt|cs|sql|sh|ps1)(?::\d+(?::\d+)?)?$/i.test(candidate);
  }

  // src/services/usage-selection.ts
  function usageModelFamily(modelOrFamily) {
    const value = modelOrFamily?.toLowerCase().trim() ?? "";
    if (!value || value === "auto" || value.includes("multi-provider")) return void 0;
    if (value.includes("gemini")) return "gemini";
    if (/claude|gpt|openai|oss/.test(value)) return "claude-gpt";
    return void 0;
  }
  function preferredUsageBucket(provider, buckets, modelOrFamily) {
    const readable = (buckets ?? []).filter((bucket) => bucket.remainingFraction !== void 0 || bucket.used !== void 0);
    if (!readable.length) return void 0;
    if (provider === "copilot") {
      return readable.find((bucket) => bucket.id === "credits-total") ?? readable.find((bucket) => bucket.id.includes("credits-total")) ?? readable.find((bucket) => bucket.id.includes("total")) ?? readable[0];
    }
    const short = readable.filter(isShortWindow);
    if (provider === "antigravity") {
      const family = usageModelFamily(modelOrFamily);
      if (family) {
        const familyShort = short.filter((bucket) => bucketMatchesFamily(bucket, family));
        if (familyShort.length) return mostConstrained(familyShort);
        const familyAny = readable.filter((bucket) => bucketMatchesFamily(bucket, family));
        if (familyAny.length) return mostConstrained(familyAny);
      }
      if (short.length) return mostConstrained(short);
      return mostConstrained(readable);
    }
    if (provider === "claude" || provider === "codex") {
      if (short.length) return mostConstrained(short);
      return mostConstrained(readable);
    }
    return mostConstrained(readable);
  }
  function withPreferredUsage(provider, usage, modelOrFamily) {
    if (!usage) return void 0;
    const preferred = preferredUsageBucket(provider, usage.buckets, modelOrFamily);
    if (!preferred) return usage;
    return {
      ...usage,
      ...preferred.remainingFraction !== void 0 ? { remainingFraction: preferred.remainingFraction } : {},
      ...preferred.usedFraction !== void 0 ? { usedFraction: preferred.usedFraction } : {},
      ...preferred.resetsAt ? { resetsAt: preferred.resetsAt } : {}
    };
  }
  function usageReferenceLabel(provider, bucket) {
    if (!bucket) return "dato provider";
    if (provider === "copilot") return bucket.label || "mese corrente";
    const group = compactGroup(bucket.group);
    const window2 = compactWindow(bucket);
    return [group, window2].filter(Boolean).join(" \xB7 ") || bucket.label;
  }
  function compactWindow(bucket) {
    if (bucket.kind === "five-hour" || bucket.kind === "session") return bucket.kind === "session" ? "sessione" : "5 ore";
    if (bucket.kind === "weekly") return "settimana";
    if (bucket.kind === "monthly") return "mese";
    if (bucket.kind === "daily") return "giorno";
    return bucket.label || "quota";
  }
  function compactGroup(group) {
    if (!group) return "";
    const normalized = group.toLowerCase();
    if (normalized.includes("gemini")) return "Gemini";
    if (normalized.includes("claude") || normalized.includes("gpt")) return "Claude/GPT";
    if (normalized.includes("codex")) return "Codex";
    if (normalized.includes("credit")) return "AI Credits";
    if (normalized.includes("request")) return "Richieste premium";
    return group;
  }
  function isShortWindow(bucket) {
    return bucket.kind === "five-hour" || bucket.kind === "session";
  }
  function bucketMatchesFamily(bucket, family) {
    const value = `${bucket.group ?? ""} ${bucket.label}`.toLowerCase();
    if (family === "gemini") return value.includes("gemini");
    return /claude|gpt|openai|oss/.test(value);
  }
  function mostConstrained(buckets) {
    return [...buckets].sort((a, b) => {
      const aFraction = a.remainingFraction;
      const bFraction = b.remainingFraction;
      if (aFraction !== void 0 && bFraction !== void 0) return aFraction - bFraction;
      if (aFraction !== void 0) return -1;
      if (bFraction !== void 0) return 1;
      return Number(b.id.includes("total")) - Number(a.id.includes("total"));
    })[0];
  }

  // src/ui/screens/chat.ts
  var messageNodeCache = /* @__PURE__ */ new Map();
  var streamMarkdownCache = /* @__PURE__ */ new Map();
  var STREAM_MARKDOWN_INTERVAL_MS = 250;
  var MAX_MESSAGE_CACHE = 600;
  var MAX_CHAT_ATTACHMENTS = 10;
  var MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024;
  var ATTACHMENT_EXTENSIONS = /* @__PURE__ */ new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".bmp",
    ".svg",
    ".pdf",
    ".txt",
    ".md",
    ".markdown",
    ".json",
    ".jsonl",
    ".xml",
    ".yaml",
    ".yml",
    ".csv",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".html",
    ".htm",
    ".py",
    ".java",
    ".kt",
    ".kts",
    ".go",
    ".rs",
    ".c",
    ".h",
    ".cpp",
    ".hpp",
    ".cs",
    ".php",
    ".rb",
    ".swift",
    ".sql",
    ".graphql",
    ".gql",
    ".toml",
    ".ini",
    ".conf",
    ".env",
    ".log",
    ".zip",
    ".gz",
    ".tgz",
    ".tar",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx"
  ]);
  function draftFor(runtime2, conversationId) {
    var _a;
    return (_a = runtime2.drafts)[conversationId] ?? (_a[conversationId] = { text: "", attachments: [] });
  }
  function attachmentExtension(name) {
    const match = /\.[^.]+$/.exec(name.toLowerCase());
    return match?.[0] ?? "";
  }
  function attachmentAllowed(file) {
    if (file.type.startsWith("image/") || file.type.startsWith("text/")) return true;
    if (["application/pdf", "application/json", "application/xml", "application/zip", "application/gzip", "application/x-tar", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(file.type)) return true;
    return ATTACHMENT_EXTENSIONS.has(attachmentExtension(file.name));
  }
  function attachmentId() {
    return globalThis.crypto?.randomUUID?.() ?? `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  function attachmentPreview(file) {
    if (!file.type.startsWith("image/") || typeof URL.createObjectURL !== "function") return void 0;
    return URL.createObjectURL(file);
  }
  function revokeAttachment(attachment) {
    if (attachment.previewUrl && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(attachment.previewUrl);
  }
  function formatAttachmentSize(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${Math.round(size / (1024 * 1024) * 10) / 10} MB`;
  }
  function addDraftFiles(runtime2, conversationId, files) {
    const draft = draftFor(runtime2, conversationId);
    for (const file of files) {
      if (draft.attachments.length >= MAX_CHAT_ATTACHMENTS) {
        runtime2.toast = { id: Date.now(), level: "warning", message: `Puoi allegare al massimo ${MAX_CHAT_ATTACHMENTS} file per messaggio.` };
        break;
      }
      const attachment = {
        id: attachmentId(),
        name: file.name || "allegato",
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        file
      };
      if (file.size > MAX_CHAT_ATTACHMENT_BYTES) attachment.error = "Il file supera il limite di 20 MB.";
      else if (!attachmentAllowed(file)) attachment.error = "Tipo di file non consentito in questa versione.";
      else attachment.previewUrl = attachmentPreview(file);
      draft.attachments.push(attachment);
    }
    runtime2.render();
  }
  function attachmentPrompt(prompt, files) {
    const lines = files.map((file) => `- ${file.localPath} (${file.name}, ${file.mimeType}, ${file.size} byte)`);
    const block = `## Allegati
${lines.join("\n")}`;
    return prompt ? `${prompt}

${block}` : `Analizza gli allegati forniti.

${block}`;
  }
  function renderChat(runtime2) {
    const state = runtime2.state;
    const page = el("section", "chat-page");
    page.append(renderConversationHeader(runtime2));
    const scroll = el("div", "message-scroll");
    const content = el("div", "message-content");
    const rootsRendered = /* @__PURE__ */ new Set();
    const visibleDelegations = state.conversation.delegations.filter(delegationIsVisible);
    const delegationsByRoot = groupDelegations(visibleDelegations);
    const primaryStreams = visiblePrimaryStreams(runtime2);
    pruneRenderCaches(state.conversation.messages.map((message) => message.id), primaryStreams.map((run) => run.runId));
    if (state.conversation.messages.length === 0 && primaryStreams.length === 0 && visibleDelegations.length === 0) {
      content.append(renderEmptyState(runtime2));
    } else {
      for (const message of state.conversation.messages) {
        content.append(renderMessage(runtime2, message));
        if (message.role === "user" && message.runId) {
          const delegations = delegationsByRoot.get(message.runId) ?? [];
          for (const delegation of delegations) content.append(renderDelegation(runtime2, delegation));
          if (delegations.length) rootsRendered.add(message.runId);
        }
      }
      for (const delegation of visibleDelegations) {
        if (!rootsRendered.has(delegation.rootRunId)) content.append(renderDelegation(runtime2, delegation));
      }
      for (const run of primaryStreams) content.append(renderStream(runtime2, run));
    }
    scroll.append(content);
    page.append(scroll, renderComposer(runtime2));
    return page;
  }
  function patchChatRun(runtime2, runId) {
    if (!runtime2.state || runtime2.section !== "chat") return false;
    const stream = runtime2.streams.get(runId);
    if (!stream) return false;
    const scroll = document.querySelector(".message-scroll");
    const distance = scroll ? scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop : Number.POSITIVE_INFINITY;
    const stickToBottom = distance < 96;
    const delegation = runtime2.state.conversation.delegations.find((entry) => entry.tasks.some((task2) => task2.id === runId));
    const task = delegation?.tasks.find((entry) => entry.id === runId);
    if (task) {
      const current = document.querySelector(`[data-delegation-task-id="${cssEscape(runId)}"]`);
      if (delegation && !delegationIsVisible(delegation)) {
        current?.closest(".delegation-card")?.remove();
        return true;
      }
      if (!current) return false;
      current.replaceWith(renderDelegationTask(runtime2, task));
    } else {
      const current = document.querySelector(`[data-stream-run-id="${cssEscape(runId)}"]`);
      const next = renderStream(runtime2, stream);
      if (current) current.replaceWith(next);
      else {
        const content = document.querySelector(".message-content");
        if (!content || stream.conversationId !== runtime2.state.conversation.id) return false;
        content.append(next);
      }
    }
    if (scroll && stickToBottom) scroll.scrollTop = scroll.scrollHeight;
    return true;
  }
  function cssEscape(value) {
    const css = globalThis.CSS;
    return css?.escape ? css.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, (entry) => `\${entry}`);
  }
  function renderConversationHeader(runtime2) {
    const state = runtime2.state;
    const header = el("header", "conversation-header conversation-header--minimal");
    const title = el("div", "conversation-heading");
    const headingButton = button("conversation-title-button");
    headingButton.append(el("h1", "", state.conversation.title));
    headingButton.title = "Rinomina conversazione";
    headingButton.addEventListener("click", () => runtime2.post({ type: "renameConversation", payload: { id: state.conversation.id } }));
    title.append(headingButton);
    const subtitle = el("div", "conversation-subtitle");
    const activeAgent = (state.agents ?? []).find((agent) => agent.id === state.conversation.agentId && agent.enabled);
    if (activeAgent) {
      subtitle.append(agentGlyph(activeAgent.name), el("span", "agent-entity-name", activeAgent.name));
    } else {
      subtitle.append(providerGlyph(state.conversation.provider), el("span", "", providerLabel(state.conversation.provider)));
      const modelLabel = selectedModel(state.conversation.provider, state.conversation.model, runtime2)?.label;
      if (modelLabel) subtitle.append(el("span", "meta-separator", "\xB7"), el("span", "", modelLabel));
      if (state.conversation.reasoning && state.conversation.reasoning !== "auto") {
        subtitle.append(el("span", "meta-separator", "\xB7"), el("span", "", state.conversation.reasoning));
      }
    }
    if (state.workspace.cwd) subtitle.append(el("span", "meta-separator", "\xB7"), el("span", "conversation-path", state.workspace.name));
    title.append(subtitle);
    header.append(title);
    return header;
  }
  function renderEmptyState(runtime2) {
    const state = runtime2.state;
    const section = el("section", "empty-chat");
    const visual = el("div", "empty-chat__visual");
    visual.append(icon("sparkle", 30));
    section.append(visual);
    section.append(el("h2", "", state.workspace.cwd ? `Lavora su ${state.workspace.name}` : "Apri un progetto e inizia"));
    section.append(el("p", "", "Scegli l\u2019agente e il modello pi\xF9 adatti. Relay mantiene sessioni, regole e deleghe nello stesso contesto."));
    const suggestions = el("div", "prompt-suggestions");
    const prompts = state.workspace.cwd ? [
      "Analizza la codebase e spiegami com\u2019\xE8 organizzata",
      "Fammi le domande necessarie prima di sviluppare una nuova funzionalit\xE0",
      "Individua i rischi tecnici principali senza modificare file"
    ] : ["Apri una cartella di progetto per iniziare"];
    for (const prompt of prompts) {
      const item = button("prompt-suggestion");
      item.append(el("span", "", prompt), icon("arrowUp", 14));
      item.addEventListener("click", () => {
        if (!state.workspace.cwd) runtime2.post({ type: "openProject" });
        else {
          draftFor(runtime2, state.conversation.id).text = prompt;
          runtime2.pendingComposerFocus = true;
          runtime2.render();
        }
      });
      suggestions.append(item);
    }
    section.append(suggestions);
    return section;
  }
  function renderMessage(runtime2, message) {
    const agentSignature = (runtime2.state.agents ?? []).map((agent) => `${agent.id}:${agent.name}`).join("|");
    const recoverySignature = runtime2.state.providers.filter((provider) => provider.healthState === "ready" && provider.connected !== false).map((provider) => provider.id).join("|");
    const signature = `${message.role}|${message.text.length}|${message.text}|${message.error ? 1 : 0}|${message.provider ?? ""}|${message.model ?? ""}|${message.reasoning ?? ""}|${message.agentId ?? ""}|${message.agentName ?? ""}|${agentSignature}|${recoverySignature}`;
    const cached = messageNodeCache.get(message.id);
    if (cached?.signature === signature) return cached.node;
    let rendered;
    if (message.role === "user") {
      const wrapper2 = el("article", "message message--user");
      const bubble = el("div", "user-bubble");
      bubble.append(renderMarkdown(message.text, { agents: runtime2.state.agents }));
      wrapper2.append(bubble, el("time", "message-time", formatClock(message.createdAt)));
      rendered = wrapper2;
      cacheMessageNode(message.id, signature, rendered);
      return rendered;
    }
    const wrapper = el("article", `message message--assistant ${message.error ? "is-error" : ""} ${message.agentId ? "is-agent-message" : ""}`);
    const rail = el("div", "assistant-rail");
    rail.append(message.agentId ? agentGlyph(message.agentName) : providerGlyph(message.provider ?? "codex"));
    wrapper.append(rail);
    const body = el("div", "assistant-body");
    const meta = el("header", "assistant-meta");
    meta.append(el("strong", message.agentId ? "agent-entity-name" : "", message.agentName || providerLabel(message.provider ?? "codex")));
    if (!message.agentId && message.model) meta.append(el("span", "", message.model));
    if (!message.agentId && message.reasoning) meta.append(el("span", "", message.reasoning));
    meta.append(el("time", "", formatClock(message.createdAt)));
    body.append(meta, renderMarkdown(message.text, { agents: runtime2.state.agents }));
    const actions = el("div", "message-actions");
    const copy = iconButton("copy", "Copia risposta", "message-action");
    copy.addEventListener("click", async () => {
      await copyToClipboard(message.text);
      copy.classList.add("is-done");
      copy.replaceChildren(icon("check", 14));
      copy.title = "Copiato";
      setTimeout(() => {
        if (!copy.isConnected) return;
        copy.classList.remove("is-done");
        copy.replaceChildren(icon("copy", 14));
        copy.title = "Copia risposta";
      }, 1600);
    });
    const continueWith = button("message-action message-action--text");
    continueWith.append(icon("arrowUp", 13), el("span", "", `Continua con ${message.agentName || providerLabel(message.provider ?? "codex")}`));
    continueWith.addEventListener("click", () => {
      if (message.agentId) runtime2.post({ type: "selectAgent", payload: { agentId: message.agentId } });
      else {
        const provider = message.provider ?? "codex";
        const model = message.model ?? defaultModel(provider, runtime2)?.id ?? "auto";
        runtime2.post({ type: "setSelection", payload: { provider, model, reasoning: message.reasoning ?? "auto", permission: runtime2.state.conversation.permission } });
      }
      runtime2.pendingComposerFocus = true;
    });
    actions.append(copy, continueWith);
    if (message.error) {
      const diagnostics = button("message-action message-action--text is-error-action");
      diagnostics.append(icon("diagnostics", 13), el("span", "", "Apri diagnostica"));
      diagnostics.addEventListener("click", () => runtime2.setSection("diagnostics"));
      actions.append(diagnostics);
      if (message.runId) {
        const recoveryProvider = firstRecoveryProvider(runtime2, message.provider ?? "codex");
        if (recoveryProvider) {
          const resolve = button("message-action message-action--text message-action--recovery");
          resolve.title = `Apre una nuova chat con ${providerLabel(recoveryProvider.id)} e invia la diagnosi con accesso completo`;
          resolve.append(icon("sparkle", 13), el("span", "", "Risolvi"));
          resolve.addEventListener("click", () => runtime2.post({ type: "resolveRunError", payload: { runId: message.runId } }));
          actions.append(resolve);
        } else {
          actions.append(el("span", "message-recovery-unavailable", "Nessun altro provider disponibile"));
        }
        for (const provider of runtime2.state.providers.filter((entry) => entry.healthState === "ready" && entry.connected !== false && entry.id !== message.provider)) {
          const failover = button("message-action message-action--text message-action--failover");
          failover.append(icon("arrowUp", 13), el("span", "", `Continua con ${providerLabel(provider.id)}`));
          failover.addEventListener("click", () => runtime2.post({ type: "continueFailedRun", payload: { runId: message.runId, provider: provider.id } }));
          actions.append(failover);
        }
      }
    }
    body.append(actions);
    wrapper.append(body);
    rendered = wrapper;
    cacheMessageNode(message.id, signature, rendered);
    return rendered;
  }
  function cacheMessageNode(id, signature, node) {
    messageNodeCache.delete(id);
    messageNodeCache.set(id, { signature, node });
    while (messageNodeCache.size > MAX_MESSAGE_CACHE) {
      const oldest = messageNodeCache.keys().next().value;
      if (!oldest) break;
      messageNodeCache.delete(oldest);
    }
  }
  function pruneRenderCaches(messageIds, runIds) {
    const messages = new Set(messageIds);
    const runs = new Set(runIds);
    for (const id of messageNodeCache.keys()) if (!messages.has(id)) messageNodeCache.delete(id);
    for (const id of streamMarkdownCache.keys()) if (!runs.has(id)) streamMarkdownCache.delete(id);
  }
  function renderStreamMarkdown(runtime2, run) {
    const now = Date.now();
    let cached = streamMarkdownCache.get(run.runId);
    const terminal = ["completed", "failed", "cancelled"].includes(run.phase);
    const mustParse = !cached || run.text.length < cached.parsedText.length || !run.text.startsWith(cached.parsedText) || terminal || now - cached.parsedAt >= STREAM_MARKDOWN_INTERVAL_MS;
    if (mustParse) {
      cached = { parsedText: run.text, parsedAt: now, node: renderMarkdown(run.text, { agents: runtime2.state.agents }) };
      streamMarkdownCache.set(run.runId, cached);
    }
    const container = el("div", "stream-markdown");
    container.append(cached.node);
    const tail = run.text.slice(cached.parsedText.length);
    if (tail) container.append(el("span", "stream-markdown__tail", tail));
    return container;
  }
  function renderStream(runtime2, run) {
    const wrapper = el("article", `message message--assistant message--stream ${run.error ? "is-error" : ""} ${run.agentId ? "is-agent-message" : ""}`);
    wrapper.dataset.streamRunId = run.runId;
    const rail = el("div", "assistant-rail");
    rail.append(run.agentId ? agentGlyph(run.agentName) : providerGlyph(run.provider));
    wrapper.append(rail);
    const body = el("div", "assistant-body");
    const meta = el("header", "assistant-meta");
    meta.append(el("strong", run.agentId ? "agent-entity-name" : "", run.agentName || providerLabel(run.provider)));
    if (!run.agentId && run.model) meta.append(el("span", "", run.model));
    if (!run.agentId && run.reasoning) meta.append(el("span", "", run.reasoning));
    const live = el("span", `live-state phase-${run.phase}`);
    live.append(el("span", "live-state__dot"), el("span", "", run.error ? "Errore" : run.phase === "cancelled" ? "Interrotto" : "In corso"));
    meta.append(live);
    body.append(meta);
    if (run.text) body.append(renderStreamMarkdown(runtime2, run));
    body.append(renderRunBar(runtime2, run));
    if (run.activities.length > 0) {
      const panelKey = `activity:${run.runId}`;
      const details = el("details", "activity-details");
      details.open = runtime2.expandedPanels.has(panelKey);
      details.addEventListener("toggle", () => {
        if (details.open) runtime2.expandedPanels.add(panelKey);
        else runtime2.expandedPanels.delete(panelKey);
      });
      const summary = el("summary");
      summary.append(el("span", "", lastActivityLabel(run)), icon("chevronDown", 14));
      details.append(summary);
      const list = el("div", "activity-list");
      for (const activity of run.activities.slice(-12)) {
        const row = el("div", "activity-row");
        row.append(el("span", "activity-row__dot"));
        const copy = el("div");
        copy.append(el("strong", "", activity.title));
        if (activity.detail) copy.append(el("span", "", activity.detail));
        row.append(copy);
        list.append(row);
      }
      details.append(list);
      body.append(details);
    }
    wrapper.append(body);
    return wrapper;
  }
  function renderRunBar(runtime2, run) {
    const progress = el("div", `run-progress phase-${run.phase}`);
    const pulse = el("span", "run-pulse");
    progress.append(pulse);
    const copy = el("div", "run-progress__copy");
    copy.append(el("strong", "", run.error || run.status || phaseLabel(run.phase)));
    const detail = el("span", "run-progress__detail");
    detail.append(el("span", "", phaseLabel(run.phase)), el("span", "meta-separator", "\xB7"));
    const elapsed = el("span", "", elapsedLabel(run.startedAt));
    if (!["completed", "failed", "cancelled"].includes(run.phase)) elapsed.dataset.elapsedStart = String(run.startedAt);
    detail.append(elapsed);
    copy.append(detail);
    progress.append(copy);
    if (run.error || run.phase === "failed") {
      const recoveryProvider = firstRecoveryProvider(runtime2, run.provider);
      if (recoveryProvider) {
        const resolve = button("button button--secondary button--small run-recovery");
        resolve.title = `Apre una nuova chat con ${providerLabel(recoveryProvider.id)} e invia la diagnosi con accesso completo`;
        resolve.append(icon("sparkle", 13), el("span", "", "Risolvi"));
        resolve.addEventListener("click", () => runtime2.post({ type: "resolveRunError", payload: { runId: run.rootRunId ?? run.runId } }));
        progress.append(resolve);
      } else {
        progress.append(el("span", "message-recovery-unavailable", "Nessun altro provider disponibile"));
      }
    } else if (!["completed", "cancelled"].includes(run.phase)) {
      const stop = iconButton("stop", "Interrompi esecuzione", "run-stop");
      stop.addEventListener("click", () => runtime2.post({ type: "cancelRun", payload: { runId: run.rootRunId ?? run.runId } }));
      progress.append(stop);
    }
    return progress;
  }
  function renderDelegation(runtime2, delegation) {
    const state = runtime2.state;
    const pending = state.pendingDelegations.find((entry) => entry.id === delegation.id);
    const card = el("section", `delegation-card is-${delegation.status}`);
    const header = el("header", "delegation-card__header");
    const visual = el("span", "delegation-card__visual");
    visual.append(icon("sparkle", 16));
    const copy = el("div", "delegation-card__heading");
    copy.append(el("strong", "", `${providerLabel(delegation.requestedBy)} ha richiesto ${delegation.tasks.length} ${delegation.tasks.length === 1 ? "delega" : "deleghe"}`));
    copy.append(el("span", "", delegation.reason || (delegation.strategy === "parallel" ? "Esecuzione parallela coordinata da Relay" : "Esecuzione sequenziale coordinata da Relay")));
    header.append(visual, copy, delegationStatus(delegation.status));
    card.append(header);
    const tasks = el("div", "delegation-task-list");
    for (const task of delegation.tasks) tasks.append(renderDelegationTask(runtime2, task));
    card.append(tasks);
    if (pending) {
      const approval = el("div", "delegation-approval");
      const text = el("div");
      text.append(el("strong", "", "Conferma richiesta"), el("span", "", "Relay avvier\xE0 gli agenti indicati usando modelli, permessi e isolamento mostrati sopra."));
      const actions = el("div");
      const reject = button("button button--ghost button--small", "Rifiuta");
      reject.addEventListener("click", () => runtime2.post({ type: "rejectDelegation", payload: { id: delegation.id } }));
      const approve = button("button button--primary button--small", "Avvia deleghe");
      approve.addEventListener("click", () => runtime2.post({ type: "approveDelegation", payload: { id: delegation.id } }));
      actions.append(reject, approve);
      approval.append(text, actions);
      card.append(approval);
    }
    return card;
  }
  function renderDelegationTask(runtime2, task) {
    const active = runtime2.state.activeRuns.find((run) => run.id === task.id);
    const stream = runtime2.streams.get(task.id);
    const livePhase = stream?.phase ?? active?.phase;
    const liveStatus = stream?.status ?? active?.status;
    const liveProvider = stream?.provider ?? active?.provider;
    const liveModel = stream?.model ?? active?.model;
    const liveStartedAt = stream?.startedAt ?? (active ? Date.parse(active.startedAt) : void 0);
    const liveActivities = stream?.activities ?? active?.activities ?? [];
    const liveFailure = stream?.failure ?? active?.failure;
    const hasLiveRun = Boolean(stream || active);
    const panelKey = `delegation-task:${task.id}`;
    const row = el("details", `delegation-task is-${task.status}`);
    row.dataset.delegationTaskId = task.id;
    row.open = runtime2.expandedPanels.has(panelKey);
    row.addEventListener("toggle", () => {
      if (row.open) runtime2.expandedPanels.add(panelKey);
      else runtime2.expandedPanels.delete(panelKey);
    });
    const summary = el("summary", "delegation-task__summary");
    summary.append(providerGlyph(task.provider));
    const copy = el("span", "delegation-task__copy");
    copy.append(el("strong", "", task.label));
    const meta = [
      task.model,
      task.reasoning,
      task.complexity === "light" ? "leggero" : task.complexity === "complex" ? "complesso" : task.complexity === "standard" ? "standard" : "",
      task.permission === "read-only" ? "sola lettura" : task.permission === "workspace-write" ? "workspace" : "accesso completo"
    ].filter(Boolean).join(" \xB7 ");
    copy.append(el("small", "", meta));
    summary.append(copy);
    const status = el("span", `task-status is-${task.status}`);
    if (hasLiveRun && livePhase && !["completed", "failed", "cancelled", "rate-limited", "permission-denied"].includes(livePhase)) status.append(el("span", "task-status__pulse"));
    status.append(el("span", "", taskStatusLabel(task.status, liveStatus)));
    summary.append(status, icon("chevronDown", 14));
    row.append(summary);
    const body = el("div", "delegation-task__body");
    const promptDetails = el("details", "delegation-task__prompt-details");
    const promptSummary = el("summary", "delegation-task__prompt-summary");
    promptSummary.append(icon("code", 13), el("span", "", "Prompt delegato"), el("small", "", `${task.prompt.length.toLocaleString("it-IT")} caratteri`), icon("chevronDown", 13));
    promptDetails.append(promptSummary, el("div", "delegation-task__prompt", task.prompt));
    body.append(promptDetails);
    if (hasLiveRun && livePhase && liveStatus && liveProvider) {
      const live = el("div", `delegation-task__live phase-${livePhase}`);
      const liveCopy = el("div", "delegation-task__live-copy");
      liveCopy.append(el("strong", "", liveStatus || phaseLabel(livePhase)));
      const last = liveActivities.at(-1);
      const hasOutput = Boolean(stream?.text || active?.partialOutput);
      liveCopy.append(el("span", "", last?.detail || last?.title || (hasOutput ? "Output ricevuto, elaborazione in corso." : "Processo vivo \xB7 in attesa del primo output.")));
      const liveMeta = el("div", "delegation-task__live-meta");
      liveMeta.append(el("span", "", providerLabel(liveProvider)));
      if (liveModel) liveMeta.append(el("span", "meta-separator", "\xB7"), el("span", "", liveModel));
      if (liveStartedAt !== void 0 && Number.isFinite(liveStartedAt)) {
        liveMeta.append(el("span", "meta-separator", "\xB7"));
        const elapsed = el("span", "", elapsedLabel(liveStartedAt));
        if (!["completed", "failed", "cancelled"].includes(livePhase)) elapsed.dataset.elapsedStart = String(liveStartedAt);
        liveMeta.append(elapsed);
      }
      const terminal = ["completed", "failed", "cancelled", "rate-limited", "permission-denied"].includes(livePhase);
      live.append(terminal ? icon(livePhase === "completed" ? "check" : "warning", 13) : el("span", "task-status__pulse"), liveCopy, liveMeta);
      body.append(live);
      if (liveFailure?.resetAt) body.append(el("p", "delegation-task__failure-note", `Limite attivo \xB7 reset ${liveFailure.resetAt}`));
    }
    if (task.routingReason || task.dependsOn?.length || task.files?.length) {
      const routing = el("div", "delegation-task__routing");
      const badges = el("div", "delegation-task__badges");
      badges.append(el("span", `delegation-badge permission-${task.permission}`, task.permission === "danger-full-access" ? "Accesso completo" : task.permission === "workspace-write" ? "Workspace" : "Sola lettura"));
      if (task.complexity) badges.append(el("span", "delegation-badge", task.complexity === "light" ? "Leggero" : task.complexity === "complex" ? "Complesso" : "Standard"));
      if (task.dependsOn?.length) badges.append(el("span", "delegation-badge", `Dopo ${task.dependsOn.length} task`));
      routing.append(badges);
      if (task.files?.length) {
        const files = el("div", "delegation-scope-badges");
        for (const path of task.files.slice(0, 4)) files.append(el("span", "delegation-file-badge", path));
        if (task.files.length > 4) files.append(el("span", "delegation-file-badge is-more", `+${task.files.length - 4}`));
        routing.append(files);
      }
      if (task.routingReason) {
        const reason = el("details", "delegation-routing-details");
        const summary2 = el("summary");
        summary2.append(el("span", "", "Perch\xE9 questa delega"), icon("chevronDown", 12));
        reason.append(summary2, el("p", "", task.routingReason));
        routing.append(reason);
      }
      body.append(routing);
    }
    if (stream?.text) {
      const output = el("div", "delegation-task__output");
      output.append(el("span", "section-label", "Output in corso"), renderMarkdown(stream.text, { agents: runtime2.state.agents }));
      body.append(output);
    } else if (task.resultText) {
      const output = el("div", "delegation-task__output");
      output.append(el("span", "section-label", "Risultato"), renderMarkdown(task.resultText, { agents: runtime2.state.agents }));
      body.append(output);
    }
    if (task.changedFiles?.length) {
      const files = el("div", "delegation-task__files");
      files.append(el("span", "", `${task.changedFiles.length} file modificati`));
      const links = el("div", "delegation-task__file-links");
      for (const path of task.changedFiles.slice(0, 8)) {
        const link = button("delegation-file-link", path);
        link.dataset.relayResource = path;
        link.title = "Apri nell\u2019editor";
        links.append(link);
      }
      files.append(links);
      body.append(files);
    }
    if (task.error) body.append(el("p", "delegation-task__error", task.error));
    if (hasLiveRun && livePhase && !["completed", "failed", "cancelled", "rate-limited", "permission-denied"].includes(livePhase)) {
      const stop = button("delegation-task__stop");
      stop.append(icon("stop", 13), el("span", "", "Interrompi"));
      stop.addEventListener("click", (event) => {
        event.preventDefault();
        runtime2.post({ type: "cancelRun", payload: { runId: stream?.rootRunId ?? active?.rootRunId ?? stream?.runId ?? active?.id ?? task.id } });
      });
      body.append(stop);
    }
    row.append(body);
    return row;
  }
  function renderComposer(runtime2) {
    const state = runtime2.state;
    const selectedAgent = Array.isArray(state.agents) ? state.agents.find((agent) => agent.id === state.conversation.agentId && agent.enabled) : void 0;
    const provider = selectedAgent?.provider ?? state.conversation.provider;
    const providerStatus = state.providers.find((entry) => entry.id === provider);
    const models = providerStatus?.models ?? [];
    const modelValue = selectedAgent?.model ?? state.conversation.model ?? state.preferences.providerDefaults[provider].model ?? "auto";
    const model = models.find((entry) => entry.id === modelValue) ?? models.find((entry) => entry.isDefault) ?? models[0];
    const reasoningOptions = model?.reasoning ?? [];
    const reasoningValue = state.conversation.reasoning ?? model?.defaultReasoning ?? "auto";
    const activeRoot = state.activeRuns.find((run) => run.conversationId === state.conversation.id && run.kind !== "delegation");
    let selectedProvider = provider;
    let selectedAgentId = selectedAgent?.id;
    let selectedModel2 = modelValue;
    let selectedReasoning = reasoningValue;
    let selectedPermission = state.conversation.permission;
    const dock = el("div", "composer-dock");
    const composer = el("form", `composer ${activeRoot ? "is-running" : ""}`);
    const textarea = el("textarea", "composer-input");
    textarea.id = "relay-composer-input";
    textarea.rows = 1;
    const draft = draftFor(runtime2, state.conversation.id);
    textarea.value = draft.text;
    textarea.placeholder = selectedAgent ? `Scrivi a ${selectedAgent.name}\u2026` : "Scrivi qui, usa @ per menzionare";
    textarea.disabled = !state.workspace.cwd || !providerStatus?.available;
    const fileInput = el("input", "composer-file-input");
    fileInput.type = "file";
    fileInput.multiple = true;
    fileInput.tabIndex = -1;
    fileInput.setAttribute("aria-hidden", "true");
    fileInput.addEventListener("change", () => {
      addDraftFiles(runtime2, state.conversation.id, Array.from(fileInput.files ?? []));
      fileInput.value = "";
    });
    const attachments = renderAttachmentTray(runtime2, state.conversation.id, draft);
    const mentionPanel = el("div", "mention-panel");
    mentionPanel.hidden = true;
    let mentionIndex = 0;
    let mentionOptions = [];
    const closeMentions = () => {
      mentionPanel.hidden = true;
      mentionOptions = [];
      mentionIndex = 0;
    };
    const selectMention = (option) => {
      const start = runtime2.mentionStart ?? textarea.selectionStart;
      const end = textarea.selectionStart;
      textarea.value = `${textarea.value.slice(0, start)}${option.token} ${textarea.value.slice(end)}`;
      const cursor = start + option.token.length + 1;
      textarea.setSelectionRange(cursor, cursor);
      draft.text = textarea.value;
      if (option.kind === "provider" && start === 0) {
        const mentionedProvider = option.token.slice(1);
        const mentionedModel = defaultModel(mentionedProvider, runtime2)?.id ?? "auto";
        selectedAgentId = void 0;
        runtime2.post({
          type: "setSelection",
          payload: { provider: mentionedProvider, model: mentionedModel, reasoning: "auto", permission: selectedPermission }
        });
      }
      closeMentions();
      resizeTextarea(textarea);
      textarea.focus();
    };
    const updateMentions = () => {
      const cursor = textarea.selectionStart;
      const prefix = textarea.value.slice(0, cursor);
      const match = prefix.match(/(?:^|\s)([@/])([^\s@/]*)$/);
      if (!match || match.index === void 0) {
        closeMentions();
        return;
      }
      runtime2.mentionStart = match.index + (match[0].startsWith(" ") ? 1 : 0);
      const trigger = match[1] === "/" ? "/" : "@";
      const query = (match[2] ?? "").toLowerCase();
      mentionOptions = buildMentionOptions(runtime2, query, trigger).slice(0, 14);
      mentionIndex = Math.min(mentionIndex, Math.max(0, mentionOptions.length - 1));
      renderMentionPanel(mentionPanel, mentionOptions, mentionIndex, selectMention);
    };
    textarea.addEventListener("input", () => {
      draft.text = textarea.value;
      resizeTextarea(textarea);
      updateMentions();
    });
    textarea.addEventListener("paste", (event) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
      if (!files.length) return;
      event.preventDefault();
      addDraftFiles(runtime2, state.conversation.id, files);
    });
    composer.addEventListener("dragover", (event) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      composer.classList.add("is-dragging");
    });
    composer.addEventListener("dragleave", (event) => {
      if (event.relatedTarget instanceof Node && composer.contains(event.relatedTarget)) return;
      composer.classList.remove("is-dragging");
    });
    composer.addEventListener("drop", (event) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (!files.length) return;
      event.preventDefault();
      composer.classList.remove("is-dragging");
      addDraftFiles(runtime2, state.conversation.id, files);
    });
    textarea.addEventListener("keydown", (event) => {
      if (!mentionPanel.hidden && mentionOptions.length) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          mentionIndex = (mentionIndex + 1) % mentionOptions.length;
          renderMentionPanel(mentionPanel, mentionOptions, mentionIndex, selectMention);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          mentionIndex = (mentionIndex - 1 + mentionOptions.length) % mentionOptions.length;
          renderMentionPanel(mentionPanel, mentionOptions, mentionIndex, selectMention);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeMentions();
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          const option = mentionOptions[mentionIndex];
          if (option) selectMention(option);
          return;
        }
      }
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (!activeRoot) composer.requestSubmit();
      }
    });
    textarea.addEventListener("click", updateMentions);
    textarea.addEventListener("blur", () => window.setTimeout(closeMentions, 80));
    composer.append(fileInput, attachments, textarea, mentionPanel);
    const toolbar = el("div", "composer-toolbar");
    const attach = button("composer-attachment-button composer-icon-only");
    attach.append(icon("plus", 15));
    attach.setAttribute("aria-label", "Aggiungi allegati");
    attach.title = "Allega file, trascina qui oppure incolla un\u2019immagine";
    attach.disabled = Boolean(activeRoot);
    attach.addEventListener("click", () => fileInput.click());
    toolbar.append(attach);
    const controls = el("div", "composer-controls");
    const visibleAgents = Array.isArray(state.agents) ? state.agents.filter((agent) => agent.enabled && agent.visibleInChat !== false && (agent.globalVisible !== false || agent.projectIds?.includes(state.workspace.id))) : [];
    controls.append(composerPicker({
      id: "provider",
      label: selectedAgent ? selectedAgent.name : "Provider",
      leading: selectedAgent ? agentGlyph(selectedAgent.name) : providerGlyph(provider),
      value: selectedAgent ? `agent:${selectedAgent.id}` : provider,
      wide: Boolean(selectedAgent),
      options: [
        ...visibleAgents.map((agent) => {
          const agentProvider = state.providers.find((entry) => entry.id === agent.provider);
          return {
            value: `agent:${agent.id}`,
            label: agent.name,
            description: agentProvider?.connected === false ? `${agent.specialization || providerLabel(agent.provider)} \xB7 provider scollegato` : `${agent.specialization || "Agente custom"} \xB7 ${providerLabel(agent.provider)}`,
            disabled: !agentProvider?.available || agentProvider?.connected === false
          };
        }),
        ...state.providers.map((entry) => ({
          value: entry.id,
          label: entry.label,
          description: entry.connected === false ? "Scollegato da Relay" : entry.available ? compactProviderVersion(entry.version) : "Non disponibile",
          disabled: !entry.available || entry.connected === false
        }))
      ],
      iconOnly: !selectedAgent,
      onChange: (value) => {
        if (value.startsWith("agent:")) {
          selectedAgentId = value.slice("agent:".length);
          runtime2.post({ type: "selectAgent", payload: { agentId: selectedAgentId } });
          return;
        }
        selectedAgentId = void 0;
        selectedProvider = value;
        selectedModel2 = defaultModel(selectedProvider, runtime2)?.id ?? "auto";
        selectedReasoning = "auto";
        runtime2.post({ type: "setSelection", payload: { provider: selectedProvider, model: selectedModel2, reasoning: selectedReasoning, permission: selectedPermission } });
      }
    }));
    if (!selectedAgent) {
      controls.append(composerPicker({
        id: "model",
        label: "Modello",
        leading: icon("sparkle", 14),
        value: modelValue,
        wide: true,
        options: [
          { value: "auto", label: "Automatico", description: "Usa il default configurato per il provider" },
          ...models.filter((entry) => entry.id !== "auto").map((entry) => ({
            value: entry.id,
            label: entry.label,
            ...entry.description ? { description: entry.description } : {}
          }))
        ],
        onChange: (value) => {
          selectedModel2 = value;
          selectedReasoning = "auto";
          runtime2.post({ type: "setSelection", payload: { provider: selectedProvider, model: selectedModel2, reasoning: selectedReasoning, permission: selectedPermission } });
        }
      }));
      controls.append(composerPicker({
        id: "reasoning",
        label: "Thinking",
        leading: icon("gauge", 14),
        value: reasoningValue,
        disabled: reasoningOptions.length === 0,
        options: [
          { value: "auto", label: "Automatico", description: model?.defaultReasoning ? `Default: ${model.defaultReasoning}` : "Scelta del provider" },
          ...reasoningOptions.map((entry) => ({ value: entry.id, label: entry.label, ...entry.description ? { description: entry.description } : {} }))
        ],
        onChange: (value) => {
          selectedReasoning = value;
          runtime2.post({ type: "setSelection", payload: { provider: selectedProvider, model: selectedModel2, reasoning: selectedReasoning, permission: selectedPermission } });
        }
      }));
    }
    controls.append(composerPicker({
      id: "permission",
      label: "Accesso",
      leading: icon("lock", 15),
      value: state.conversation.permission,
      iconOnly: true,
      options: [
        { value: "read-only", label: "Sola lettura", description: "Analizza senza modificare file" },
        { value: "workspace-write", label: "Workspace", description: "Pu\xF2 modificare il progetto aperto" },
        { value: "danger-full-access", label: "Accesso completo", description: "Pu\xF2 operare fuori dal workspace e Relay tenta di approvare consensi browser e terminale" }
      ],
      onChange: (value) => {
        if (value === "danger-full-access") {
          runtime2.pendingFullAccess = true;
          runtime2.render();
          return;
        }
        delete runtime2.pendingFullAccess;
        selectedPermission = value;
        runtime2.post({ type: "setPermission", payload: { permission: selectedPermission } });
      }
    }));
    if (runtime2.pendingFullAccess) {
      const confirm = el("div", "composer-confirm");
      const copy = el("div", "composer-confirm__copy");
      copy.append(el("strong", "", "Consentire l\u2019accesso completo?"));
      copy.append(el("span", "", "L\u2019agente potr\xE0 operare anche fuori dal workspace aperto."));
      const actions = el("div", "composer-confirm__actions");
      const cancel = button("button button--ghost button--small", "Annulla");
      cancel.addEventListener("click", () => {
        delete runtime2.pendingFullAccess;
        runtime2.render();
      });
      const allow = button("button button--danger-ghost button--small", "Consenti");
      allow.addEventListener("click", () => {
        delete runtime2.pendingFullAccess;
        selectedPermission = "danger-full-access";
        runtime2.post({ type: "setPermission", payload: { permission: "danger-full-access" } });
        runtime2.render();
      });
      actions.append(cancel, allow);
      confirm.append(icon("shield", 15), copy, actions);
      composer.append(confirm);
    }
    controls.append(composerPicker({
      id: "delegation",
      label: "Deleghe",
      leading: icon("workflow", 15),
      value: state.conversation.delegationPolicy,
      iconOnly: true,
      alignRight: true,
      options: [
        { value: "confirm", label: "Chiedi conferma", description: "Mostra il piano prima di avviare altri agenti" },
        { value: "automatic", label: "Automatiche", description: "L\u2019agente pu\xF2 delegare senza interrompere il flusso" },
        { value: "disabled", label: "Disattivate", description: "Nessuna delega agente-agente" }
      ],
      onChange: (value) => runtime2.post({ type: "setDelegationPolicy", payload: { policy: value } })
    }));
    const usage = button("composer-usage-button composer-icon-only");
    const currentUsage = usageForModel2(state.usage.find((entry) => entry.provider === provider), model?.family ?? model?.label);
    usage.append(icon("gauge", 14), el("span", `composer-status-dot ${usageHealth(currentUsage?.remainingFraction)}`));
    usage.setAttribute("aria-label", "Utilizzo e limiti provider");
    usage.title = currentUsage?.available ? `${providerLabel(provider)} \xB7 ${formatPercent(currentUsage.remainingFraction)} disponibile \xB7 ${formatReset(currentUsage.resetsAt)}` : "Utilizzo e limiti provider";
    usage.addEventListener("click", (event) => {
      event.preventDefault();
      runtime2.usageOpen = !runtime2.usageOpen;
      runtime2.render();
    });
    controls.append(usage);
    toolbar.append(controls);
    const send = button(`composer-send ${activeRoot ? "is-stop" : ""}`);
    send.type = activeRoot ? "button" : "submit";
    send.append(icon(activeRoot ? "stop" : "arrowUp", 18));
    send.setAttribute("aria-label", activeRoot ? "Interrompi esecuzione" : "Invia messaggio");
    send.title = activeRoot ? "Interrompi esecuzione" : "Invia (Enter)";
    send.disabled = !activeRoot && textarea.disabled;
    if (activeRoot) {
      send.addEventListener("click", (event) => {
        event.preventDefault();
        runtime2.post({ type: "cancelRun", payload: { runId: activeRoot.rootRunId ?? activeRoot.id } });
      });
    }
    toolbar.append(send);
    composer.append(toolbar);
    composer.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (activeRoot || draft.sending) return;
      const prompt = textarea.value.trim();
      const validAttachments = draft.attachments.filter((attachment) => !attachment.error && !attachment.consumed && attachment.file);
      if (!prompt && validAttachments.length === 0 || textarea.disabled) return;
      if (draft.attachments.some((attachment) => Boolean(attachment.error))) {
        runtime2.toast = { id: Date.now(), level: "warning", message: "Rimuovi o sostituisci gli allegati non validi prima di inviare." };
        runtime2.render();
        return;
      }
      draft.sending = true;
      validAttachments.forEach((attachment) => {
        attachment.consumed = true;
      });
      send.disabled = true;
      try {
        const saved = validAttachments.length ? await runtime2.saveAttachments(validAttachments) : [];
        const providerPrompt = saved.length ? attachmentPrompt(prompt, saved) : prompt;
        const displayPrompt = prompt || `Allegati: ${validAttachments.map((attachment) => attachment.name).join(", ")}`;
        runtime2.scrollByConversation[state.conversation.id] = { top: 0, stickToBottom: true };
        runtime2.post({
          type: "sendMessage",
          payload: { provider: selectedProvider, agentId: selectedAgentId, model: selectedModel2, reasoning: selectedReasoning, permission: selectedPermission, prompt: providerPrompt, displayPrompt }
        });
        for (const attachment of validAttachments) revokeAttachment(attachment);
        draft.text = "";
        draft.sending = false;
        draft.attachments = draft.attachments.filter((attachment) => !validAttachments.includes(attachment));
        textarea.value = "";
        resizeTextarea(textarea);
        runtime2.render();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        draft.sending = false;
        for (const attachment of validAttachments) {
          attachment.consumed = false;
          attachment.error = message;
        }
        runtime2.toast = { id: Date.now(), level: "error", message };
        send.disabled = false;
        runtime2.render();
      }
    });
    dock.append(composer);
    if (runtime2.usageOpen) dock.append(renderUsagePopover(runtime2));
    const footer = el("div", "composer-footer");
    const left = el("span");
    if (activeRoot) left.textContent = `${activeRoot.agentName || providerLabel(activeRoot.provider)} sta lavorando \xB7 ${phaseLabel(activeRoot.phase)}`;
    else left.textContent = state.conversation.delegationPolicy === "automatic" ? "Deleghe automatiche attive" : state.conversation.delegationPolicy === "disabled" ? "Deleghe disattivate" : "Le deleghe richiedono conferma";
    footer.append(left);
    if (activeRoot) {
      const parallel = button("composer-parallel-hint");
      parallel.append(icon("plus", 12), el("span", "", "Nuova chat in parallelo"));
      parallel.title = "Questa chat continua in background. Apri un\u2019altra chat per un nuovo task.";
      parallel.addEventListener("click", () => runtime2.post({ type: "newConversation", payload: { provider: state.conversation.provider } }));
      footer.append(parallel);
    } else {
      footer.append(el("span", "", "Enter invia \xB7 Shift+Enter va a capo"));
    }
    dock.append(footer);
    requestAnimationFrame(() => resizeTextarea(textarea));
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? dock.clientWidth;
      dock.classList.toggle("is-compact", width < 520);
      dock.classList.toggle("is-micro", width < 360);
    });
    observer.observe(dock);
    return dock;
  }
  function renderAttachmentTray(runtime2, conversationId, draft) {
    const tray = el("div", "composer-attachments");
    tray.hidden = draft.attachments.length === 0;
    for (const attachment of draft.attachments) {
      const chip = el("div", `composer-attachment ${attachment.error ? "is-error" : ""} ${attachment.consumed ? "is-busy" : ""}`);
      chip.title = attachment.name;
      const visual = el("span", "composer-attachment__visual");
      const fallback = el("span", "composer-attachment__icon");
      fallback.append(icon(attachment.error ? "warning" : "folder", 15));
      if (attachment.previewUrl) {
        const image = el("img", "composer-attachment__preview");
        image.src = attachment.previewUrl;
        image.alt = `Anteprima ${attachment.name}`;
        image.decoding = "async";
        fallback.hidden = true;
        image.addEventListener("error", () => {
          image.hidden = true;
          fallback.hidden = false;
        }, { once: true });
        visual.append(image, fallback);
      } else {
        visual.append(fallback);
      }
      chip.append(visual);
      const copy = el("span", "composer-attachment__copy");
      copy.append(el("strong", "", attachment.name), el("small", "", attachment.error || formatAttachmentSize(attachment.size)));
      chip.append(copy);
      const remove = iconButton("close", `Rimuovi ${attachment.name}`, "composer-attachment__remove");
      remove.disabled = Boolean(attachment.consumed);
      remove.addEventListener("click", () => {
        revokeAttachment(attachment);
        draft.attachments = draft.attachments.filter((entry) => entry.id !== attachment.id);
        runtime2.drafts[conversationId] = draft;
        runtime2.render();
      });
      chip.append(remove);
      tray.append(chip);
    }
    return tray;
  }
  function renderUsagePopover(runtime2) {
    const state = runtime2.state;
    const popover = el("section", "usage-popover");
    const header = el("header");
    const copy = el("div");
    copy.append(el("strong", "", "Utilizzo provider"), el("span", "", "Dati aggiornati dalle CLI locali"));
    const close = iconButton("close", "Chiudi", "usage-popover__close");
    close.addEventListener("click", () => {
      runtime2.usageOpen = false;
      runtime2.render();
    });
    header.append(copy, close);
    popover.append(header);
    const list = el("div", "usage-popover__list");
    for (const provider of state.providers) {
      const modelReference = usageModelReference(runtime2, provider.id);
      const rawUsage = state.usage.find((entry) => entry.provider === provider.id);
      const usage = withPreferredUsage(provider.id, rawUsage, modelReference);
      const primaryBucket = preferredUsageBucket(provider.id, rawUsage?.buckets, modelReference);
      list.append(renderUsageRow(runtime2, provider.id, usage, primaryBucket));
    }
    popover.append(list);
    const footer = button("usage-popover__footer");
    footer.append(icon("gauge", 14), el("span", "", "Apri dettagli e policy di consumo"), icon("arrowUp", 13));
    footer.addEventListener("click", () => {
      runtime2.usageOpen = false;
      runtime2.setSection("usage");
    });
    popover.append(footer);
    return popover;
  }
  function renderUsageRow(runtime2, provider, usage, primaryBucket) {
    const row = el("div", `usage-popover__row ${usage?.buckets?.length ? "has-buckets" : ""}`);
    row.append(providerGlyph(provider));
    const body = el("div", "usage-popover__body");
    const headline = el("div", "usage-popover__headline");
    const copy = el("div", "usage-popover__copy");
    copy.append(el("strong", "", providerLabel(provider)));
    const buckets = usage?.buckets?.filter((bucket) => bucket.remainingFraction !== void 0 || bucket.used !== void 0) ?? [];
    copy.append(el("span", "", usage?.available ? provider === "antigravity" ? `${buckets.length}/4 finestre rilevate${buckets.length < 4 ? " \xB7 dato parziale" : ""} \xB7 riferimento ${usageReferenceLabel(provider, primaryBucket)}` : buckets.length > 1 ? `${buckets.length} finestre / fasce rilevate` : formatReset(usage.resetsAt) : provider === "copilot" ? "Collega GitHub per leggere il consumo mensile" : "Il provider non espone un limite leggibile"));
    headline.append(copy);
    const metric = el("div", "usage-popover__metric");
    metric.append(el("strong", "", usage?.available ? formatUsageMetric(usage) : "\u2014"), el("span", "", usage?.available ? usageMetricLabel(provider, usage, primaryBucket) : "non disponibile"));
    headline.append(metric);
    body.append(headline);
    if (buckets.length > 1 || buckets.length === 1 && buckets[0].group) {
      const bucketGrid = el("div", "usage-popover__buckets");
      for (const bucket of buckets.slice(0, 6)) bucketGrid.append(renderUsageBucket(bucket));
      body.append(bucketGrid);
    } else if (usage?.available && usage.remainingFraction !== void 0) {
      const bar = el("div", "usage-popover__bar");
      const fill = el("span", usageHealth(usage.remainingFraction));
      fill.style.width = `${Math.round(usage.remainingFraction * 100)}%`;
      bar.append(fill);
      body.append(bar);
    }
    if (provider === "copilot" && !usage?.available) {
      const connect = button("usage-popover__connect", "Collega dati mensili");
      connect.addEventListener("click", (event) => {
        event.stopPropagation();
        runtime2.usageOpen = false;
        runtime2.post({ type: "configureCopilotUsage" });
        runtime2.render();
      });
      body.append(connect);
    } else if (provider === "antigravity" && usage?.available && buckets.length < 4) {
      const retry = button("usage-popover__connect", "Riprova lettura completa");
      retry.addEventListener("click", (event) => {
        event.stopPropagation();
        runtime2.post({ type: "refreshUsage" });
      });
      body.append(retry);
    }
    row.append(body);
    return row;
  }
  function renderUsageBucket(bucket) {
    const item = el("div", "usage-popover__bucket");
    const label = el("span", "usage-popover__bucket-label");
    if (bucket.used !== void 0) {
      const meta = [compactGroup(bucket.group), compactWindow(bucket)].filter((value2, index, values) => value2 && values.indexOf(value2) === index).join(" \xB7 ");
      label.append(el("strong", "", bucket.label), el("small", "", meta));
    } else {
      label.append(el("strong", "", compactGroup(bucket.group) || bucket.label), el("small", "", compactWindow(bucket)));
    }
    const value = el("span", `usage-popover__bucket-value ${usageHealth(bucket.remainingFraction)}`);
    value.textContent = bucket.remainingFraction !== void 0 ? formatPercent(bucket.remainingFraction) : bucket.used !== void 0 ? `${compactNumber(bucket.used)} ${compactUsageUnit(bucket.unit)}`.trim() : "\u2014";
    item.append(label, value);
    if (bucket.resetsAt) item.title = formatReset(bucket.resetsAt);
    return item;
  }
  function formatUsageMetric(usage) {
    if (usage.remainingFraction !== void 0) return formatPercent(usage.remainingFraction);
    const total = usage.buckets?.find((bucket) => bucket.id.includes("total")) ?? usage.buckets?.[0];
    if (total?.used !== void 0) return compactNumber(total.used);
    return "\u2014";
  }
  function usageMetricLabel(provider, usage, primaryBucket) {
    if (usage.remainingFraction !== void 0) return usageReferenceLabel(provider, primaryBucket);
    const total = usage.buckets?.find((bucket) => bucket.id.includes("total")) ?? usage.buckets?.[0];
    return total?.unit ? compactUsageUnit(total.unit) : usageReferenceLabel(provider, primaryBucket);
  }
  function compactUsageUnit(unit) {
    if (unit === "requests") return "richieste";
    if (unit === "credits") return "crediti";
    if (unit === "tokens") return "token";
    return unit ?? "";
  }
  function compactNumber(value) {
    return new Intl.NumberFormat("it-IT", { maximumFractionDigits: value >= 100 ? 0 : 2 }).format(value);
  }
  function buildMentionOptions(runtime2, query, trigger = "@") {
    const state = runtime2.state;
    const normalized = query.replace(/^[@/]/, "").toLowerCase();
    const options = [];
    if (trigger === "/") {
      const seen = /* @__PURE__ */ new Set();
      for (const skill of state.skills.items) {
        const key = skill.name.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        options.push({ kind: "skill", label: skill.name, detail: skill.description, token: `/${skill.name}` });
      }
      if (!normalized) return options.sort(mentionSort);
      return options.filter((option) => `${option.label} ${option.detail}`.toLowerCase().includes(normalized)).sort((a, b) => mentionScore(a, normalized) - mentionScore(b, normalized) || mentionSort(a, b));
    }
    for (const provider of state.providers.filter((entry) => entry.available && entry.connected !== false)) {
      options.push({
        kind: "provider",
        label: provider.label,
        detail: provider.models.length ? `${provider.models.length} modelli disponibili` : "Provider locale",
        token: `@${provider.id}`
      });
    }
    for (const agent of (Array.isArray(state.agents) ? state.agents : []).filter((entry) => entry.enabled && entry.visibleInChat !== false && (entry.globalVisible !== false || entry.projectIds?.includes(state.workspace.id)))) {
      options.push({
        kind: "agent",
        label: agent.name,
        detail: `Target di delega \xB7 ${providerLabel(agent.provider)}${agent.specialization ? ` \xB7 ${agent.specialization}` : ""}`,
        token: /^[A-Za-z0-9_À-ÖØ-öø-ÿ-]+$/.test(agent.name) ? `@${agent.name}` : `@"${agent.name}"`
      });
    }
    for (const item of state.contextItems) {
      options.push({
        kind: item.kind,
        label: item.relativePath,
        detail: item.kind === "file" ? "File del progetto" : "Directory del progetto",
        token: item.kind === "file" ? `@file[${item.relativePath}]` : `@dir[${item.relativePath}]`
      });
    }
    for (const rule of state.rules.filter((entry) => entry.enabled)) {
      options.push({ kind: "rule", label: rule.name, detail: "Regola attiva", token: `@rule[${rule.id}]` });
    }
    for (const conversation of state.conversations) {
      options.push({ kind: "conversation", label: conversation.title, detail: `${conversation.messageCount} messaggi`, token: `@chat[${conversation.id}]` });
    }
    if (!normalized) return options.sort(mentionSort);
    return options.filter((option) => `${option.label} ${option.detail} ${option.kind}`.toLowerCase().includes(normalized)).sort((a, b) => mentionScore(a, normalized) - mentionScore(b, normalized) || mentionSort(a, b));
  }
  function renderMentionPanel(panel, options, selectedIndex, onSelect) {
    panel.replaceChildren();
    if (!options.length) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const groups = /* @__PURE__ */ new Map();
    for (const option of options) groups.set(option.kind, [...groups.get(option.kind) ?? [], option]);
    let absoluteIndex = 0;
    for (const [kind, values] of groups) {
      panel.append(el("span", "mention-panel__group", mentionKindLabel(kind)));
      for (const option of values) {
        const index = absoluteIndex++;
        const item = button(`mention-option ${index === selectedIndex ? "is-selected" : ""}`);
        const visual = el("span", "mention-option__icon");
        if (kind === "provider") visual.append(providerGlyph(option.token.slice(1)));
        else if (kind === "agent") visual.append(agentGlyph(option.label));
        else visual.append(icon(kind === "file" ? "code" : kind === "directory" ? "folder" : kind === "rule" || kind === "skill" ? "rules" : "chat", 15));
        const copy = el("span", "mention-option__copy");
        copy.append(el("strong", "", option.label), el("small", "", option.detail));
        item.append(visual, copy);
        item.addEventListener("mousedown", (event) => event.preventDefault());
        item.addEventListener("click", () => onSelect(option));
        panel.append(item);
      }
    }
  }
  function mentionKindLabel(kind) {
    if (kind === "provider") return "Provider";
    if (kind === "agent") return "Agenti custom";
    if (kind === "file") return "File";
    if (kind === "directory") return "Directory";
    if (kind === "rule") return "Regole";
    if (kind === "skill") return "Skill";
    return "Conversazioni";
  }
  function mentionSort(a, b) {
    const order = { skill: 0, provider: 1, agent: 2, file: 3, directory: 4, rule: 5, conversation: 6 };
    return order[a.kind] - order[b.kind] || a.label.localeCompare(b.label);
  }
  function mentionScore(option, query) {
    const label = option.label.toLowerCase();
    if (label === query) return 0;
    if (label.startsWith(query)) return 1;
    return 2;
  }
  function composerPicker(options) {
    const details = el("details", `composer-picker ${options.wide ? "is-wide" : ""} ${options.alignRight ? "align-right" : ""} ${options.iconOnly ? "is-icon-only" : ""}`);
    details.dataset.picker = options.id;
    if (options.disabled) details.classList.add("is-disabled");
    const selected = options.options.find((entry) => entry.value === options.value) ?? options.options[0];
    const summary = el("summary", "composer-picker__trigger");
    summary.append(options.leading);
    if (!options.iconOnly) summary.append(el("span", "composer-picker__value", selected?.label ?? options.label), icon("chevronDown", 13));
    summary.title = options.label;
    if (options.disabled) summary.setAttribute("aria-disabled", "true");
    details.append(summary);
    const menu = el("div", `composer-picker__menu ${options.wide ? "is-wide" : ""}`);
    menu.dataset.pickerMenuOwner = options.id;
    menu.append(el("div", "composer-picker__title", options.label));
    for (const entry of options.options) {
      const item = button(`composer-picker__item ${entry.value === options.value ? "is-selected" : ""}`);
      item.disabled = Boolean(entry.disabled);
      const itemCopy = el("span", "composer-picker__item-copy");
      itemCopy.append(el("strong", "", entry.label));
      if (entry.description) itemCopy.append(el("small", "", entry.description));
      item.append(itemCopy);
      if (entry.value === options.value) item.append(icon("check", 15));
      item.addEventListener("click", (event) => {
        event.preventDefault();
        details.open = false;
        if (entry.disabled || entry.value === options.value) return;
        options.onChange(entry.value);
      });
      menu.append(item);
    }
    details.append(menu);
    const restoreMenu = () => {
      if (menu.parentElement !== details) details.append(menu);
      menu.style.removeProperty("top");
      menu.style.removeProperty("bottom");
      menu.style.removeProperty("left");
      menu.style.removeProperty("right");
      menu.style.removeProperty("width");
    };
    details.addEventListener("toggle", () => {
      if (!details.open) {
        restoreMenu();
        return;
      }
      for (const open of Array.from(document.querySelectorAll("details.composer-picker[open]"))) {
        if (open !== details) open.open = false;
      }
      document.body.append(menu);
      requestAnimationFrame(() => positionPickerMenu(summary, menu));
    });
    return details;
  }
  function positionPickerMenu(trigger, menu) {
    const rect = trigger.getBoundingClientRect();
    const margin = 10;
    const preferredWidth = menu.classList.contains("is-wide") ? 350 : 300;
    const width = Math.min(preferredWidth, Math.max(210, window.innerWidth - margin * 2));
    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, rect.left));
    const availableAbove = Math.max(0, rect.top - margin);
    const availableBelow = Math.max(0, window.innerHeight - rect.bottom - margin);
    const openAbove = availableAbove >= 180 || availableAbove >= availableBelow;
    const maxHeight = Math.max(140, Math.min(420, (openAbove ? availableAbove : availableBelow) - 8));
    menu.style.position = "fixed";
    menu.style.zIndex = "10000";
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${maxHeight}px`;
    menu.style.left = `${left}px`;
    menu.style.right = "auto";
    if (openAbove) {
      menu.style.top = "auto";
      menu.style.bottom = `${Math.max(margin, window.innerHeight - rect.top + 7)}px`;
    } else {
      menu.style.bottom = "auto";
      menu.style.top = `${Math.min(window.innerHeight - margin, rect.bottom + 7)}px`;
    }
  }
  function visiblePrimaryStreams(runtime2) {
    const state = runtime2.state;
    const assistantRunIds = new Set(
      state.conversation.messages.filter((message) => message.role === "assistant").map((message) => message.runId).filter(Boolean)
    );
    const streams = /* @__PURE__ */ new Map();
    for (const run of runtime2.streams.values()) {
      if (run.conversationId !== state.conversation.id || run.kind === "delegation") continue;
      streams.set(run.runId, run);
    }
    for (const run of state.activeRuns) {
      if (run.conversationId !== state.conversation.id || run.kind === "delegation" || streams.has(run.id)) continue;
      streams.set(run.id, {
        runId: run.id,
        conversationId: run.conversationId,
        provider: run.provider,
        text: "",
        status: run.status,
        phase: run.phase,
        activities: run.activities.map((activity) => ({ title: activity.title, ...activity.detail ? { detail: activity.detail } : {} })),
        startedAt: new Date(run.startedAt).getTime(),
        ...run.kind ? { kind: run.kind } : {},
        ...run.rootRunId ? { rootRunId: run.rootRunId } : {},
        ...run.model ? { model: run.model } : {},
        ...run.reasoning ? { reasoning: run.reasoning } : {},
        ...run.error ? { error: run.error } : {}
      });
    }
    return [...streams.values()].filter(
      (run) => !assistantRunIds.has(run.runId) || run.phase !== "completed"
    );
  }
  function delegationIsVisible(delegation) {
    if (delegation.status === "pending-approval" || delegation.status === "running") return true;
    return delegation.tasks.some((task) => ["pending", "queued", "running"].includes(task.status));
  }
  function groupDelegations(delegations) {
    const map = /* @__PURE__ */ new Map();
    for (const delegation of delegations) {
      const values = map.get(delegation.rootRunId) ?? [];
      values.push(delegation);
      map.set(delegation.rootRunId, values);
    }
    return map;
  }
  function firstRecoveryProvider(runtime2, failedProvider) {
    return runtime2.state.providers.find((provider) => provider.id !== failedProvider && provider.healthState === "ready" && provider.connected !== false);
  }
  function selectedModel(provider, modelId, runtime2) {
    const models = runtime2.state?.providers.find((entry) => entry.id === provider)?.models ?? [];
    return models.find((model) => model.id === modelId) ?? models.find((model) => model.isDefault) ?? models[0];
  }
  function defaultModel(provider, runtime2) {
    const models = runtime2.state?.providers.find((entry) => entry.id === provider)?.models ?? [];
    return models.find((model) => model.isDefault) ?? models[0];
  }
  function elapsedLabel(startedAt) {
    const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1e3));
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
  function phaseLabel(phase) {
    if (phase === "queued") return "In coda";
    if (phase === "connecting") return "Connessione";
    if (phase === "starting-session") return "Avvio sessione";
    if (phase === "starting-turn") return "Avvio richiesta";
    if (phase === "waiting-first-output") return "Attesa del primo output";
    if (phase === "delegating") return "Coordinamento deleghe";
    if (phase === "awaiting-approval") return "In attesa di conferma";
    if (phase === "integrating") return "Integrazione risultati";
    if (phase === "cancelled") return "Interrotto";
    if (phase === "failed") return "Errore";
    return "Elaborazione";
  }
  function lastActivityLabel(run) {
    const last = run.activities.at(-1);
    return last ? `${last.title} \xB7 ${run.activities.length} attivit\xE0` : `${run.activities.length} attivit\xE0`;
  }
  function delegationStatus(status) {
    const node = el("span", `delegation-status is-${status}`);
    if (status === "running" || status === "pending-approval") node.append(el("span", "task-status__pulse"));
    node.append(el("span", "", status === "pending-approval" ? "Da confermare" : status === "running" ? "In corso" : status === "completed" ? "Completata" : status === "cancelled" ? "Annullata" : "Errore"));
    return node;
  }
  function taskStatusLabel(status, activeStatus) {
    if (activeStatus && (status === "running" || status === "queued")) return activeStatus;
    if (status === "pending") return "In attesa";
    if (status === "queued") return "In coda";
    if (status === "running") return "In corso";
    if (status === "completed") return "Completata";
    if (status === "cancelled") return "Annullata";
    return "Errore";
  }
  async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const temporary = el("textarea");
    temporary.value = text;
    temporary.style.position = "fixed";
    temporary.style.opacity = "0";
    document.body.append(temporary);
    temporary.select();
    document.execCommand("copy");
    temporary.remove();
  }
  function resizeTextarea(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(220, Math.max(42, textarea.scrollHeight))}px`;
  }
  function usageForModel2(usage, modelFamilyOrLabel) {
    return usage ? withPreferredUsage(usage.provider, usage, modelFamilyOrLabel) : usage;
  }
  function usageModelReference(runtime2, provider) {
    const state = runtime2.state;
    const activeAgent = state.conversation.agentId ? state.agents.find((agent) => agent.id === state.conversation.agentId && agent.provider === provider) : void 0;
    const configured = activeAgent?.model ?? (state.conversation.provider === provider ? state.conversation.model : state.preferences.providerDefaults[provider]?.model);
    const status = state.providers.find((entry) => entry.id === provider);
    const model = status?.models.find((entry) => entry.id === configured) ?? status?.models.find((entry) => entry.isDefault);
    if (configured && configured !== "auto") return model?.family ?? model?.label ?? configured;
    return model?.id === "auto" ? void 0 : model?.family ?? model?.label;
  }
  function usageHealth(remaining) {
    if (remaining === void 0) return "is-unknown";
    if (remaining <= 0.15) return "is-critical";
    if (remaining <= 0.35) return "is-warning";
    return "is-healthy";
  }

  // src/ui/screens/projects.ts
  var PAGE_SIZE = 5;
  var CHAT_PREVIEW_LIMIT = 4;
  function renderProjects(runtime2) {
    const state = runtime2.state;
    const page = el("section", "content-page projects-page projects-page--compact");
    const header = el("header", "page-header projects-header");
    const copy = el("div");
    copy.append(el("span", "eyebrow", "Workspace"), el("h1", "", "Progetti"));
    copy.append(el("p", "", "Apri un progetto, riprendi una chat o creane una nuova."));
    const open = button("button button--primary");
    open.append(icon("folder", 16), el("span", "", "Apri progetto"));
    open.addEventListener("click", () => runtime2.post({ type: "openProject" }));
    header.append(copy, open);
    page.append(header);
    const search = el("label", "projects-search");
    search.append(icon("search", 15));
    const input = el("input");
    input.placeholder = "Cerca progetto";
    input.value = runtime2.projectSearch;
    input.addEventListener("input", () => {
      runtime2.projectSearch = input.value;
      runtime2.projectsVisibleLimit = PAGE_SIZE;
      runtime2.render();
    });
    search.append(input);
    page.append(search);
    const query = runtime2.projectSearch.trim().toLowerCase();
    const projects = [...state.projects].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)).filter((project) => !query || project.name.toLowerCase().includes(query) || project.path.toLowerCase().includes(query));
    const visible = projects.slice(0, runtime2.projectsVisibleLimit);
    const list = el("div", "projects-list projects-list--collapsed");
    for (const project of visible) {
      list.append(renderProject(runtime2, project, state.projectConversations[project.id] ?? []));
    }
    if (!projects.length) {
      const empty = el("div", "projects-empty");
      empty.append(icon("folder", 22), el("strong", "", query ? "Nessun progetto trovato" : "Nessun progetto recente"));
      empty.append(el("span", "", query ? "Prova un nome o un percorso diverso." : "Apri una cartella per iniziare."));
      list.append(empty);
    }
    page.append(list);
    if (visible.length < projects.length) {
      const more = button("projects-load-more");
      more.append(el("span", "", `Carica altri ${Math.min(PAGE_SIZE, projects.length - visible.length)}`), icon("chevronDown", 14));
      more.addEventListener("click", () => {
        runtime2.projectsVisibleLimit += PAGE_SIZE;
        runtime2.render();
      });
      page.append(more);
    }
    return page;
  }
  function renderProject(runtime2, project, conversations) {
    const current = project.id === runtime2.state.workspace.id;
    const expanded = runtime2.expandedProjects.has(project.id);
    const card = el("section", `project-row project-row--compact ${current ? "is-current" : ""} ${expanded ? "is-expanded" : ""}`);
    const top = button("project-row__top project-row__top--button");
    top.setAttribute("aria-expanded", String(expanded));
    const identity = el("span", "project-row__identity");
    const visual = el("span", "project-row__visual");
    visual.append(icon("folder", 18));
    const projectCopy = el("span", "project-row__copy");
    const titleLine = el("span", "project-row__title-line");
    titleLine.append(el("strong", "", project.name));
    if (current) titleLine.append(el("span", "project-current-indicator", "Aperto"));
    projectCopy.append(titleLine, el("small", "project-row__path", project.path));
    const meta = el("span", "project-row__meta");
    meta.append(el("span", "", project.isGit ? "Git" : "Locale"));
    meta.append(el("span", "", `${conversations.length} chat`));
    meta.append(el("span", "", formatRelativeTime(project.lastOpenedAt)));
    projectCopy.append(meta);
    identity.append(visual, projectCopy);
    top.append(identity, icon("chevronDown", 15));
    top.addEventListener("click", () => {
      if (expanded) runtime2.expandedProjects.delete(project.id);
      else runtime2.expandedProjects.add(project.id);
      runtime2.render();
    });
    card.append(top);
    const quick = button("project-row__quick-add");
    quick.append(icon("plus", 14));
    quick.title = `Nuova chat in ${project.name}`;
    quick.setAttribute("aria-label", `Nuova chat in ${project.name}`);
    quick.addEventListener("click", (event) => {
      event.stopPropagation();
      if (current) runtime2.post({ type: "newConversation", payload: { provider: runtime2.state.conversation.provider } });
      else runtime2.post({ type: "openRecentProject", payload: { path: project.path, newConversation: true } });
    });
    card.append(quick);
    if (current) {
      const rules = button("project-row__rules");
      rules.append(icon("rules", 14));
      rules.title = "Regole del progetto";
      rules.setAttribute("aria-label", "Regole del progetto");
      rules.addEventListener("click", (event) => {
        event.stopPropagation();
        runtime2.setSection("rules");
      });
      card.append(rules);
      if (runtime2.state.privacyShieldSetup.provisioned) {
        const shield = el("div", "project-privacy-shield");
        const resolved = project.privacyShieldOverride && project.privacyShieldOverride !== "inherit" ? project.privacyShieldOverride === "on" : runtime2.state.preferences.privacyShield;
        const status = resolved ? project.privacyShieldComplete ? "Protezione completa" : "Copertura parziale" : "Disattivo";
        shield.append(el("strong", "", "Privacy Shield"), el("span", `project-privacy-shield__status ${resolved ? project.privacyShieldComplete ? "is-complete" : "is-partial" : ""}`, status));
        const options = el("div", "project-privacy-options");
        for (const option of [
          { value: "inherit", label: "Eredita" },
          { value: "on", label: "Sempre attivo" },
          { value: "off", label: "Sempre disattivo" }
        ]) {
          const label = el("label", "project-privacy-option");
          const input = el("input");
          input.type = "radio";
          input.name = `privacy-${project.id}`;
          input.value = option.value;
          input.checked = (project.privacyShieldOverride ?? "inherit") === option.value;
          input.addEventListener("change", () => runtime2.post({ type: "updateProjectPrivacyShield", payload: { projectId: project.id, override: input.value } }));
          label.append(input, el("span", "", option.label));
          options.append(label);
        }
        shield.append(options);
        card.append(shield);
      }
    }
    if (expanded) {
      const chats = el("div", "project-chat-list project-chat-list--compact");
      const visible = conversations.slice(0, CHAT_PREVIEW_LIMIT);
      if (visible.length) {
        for (const conversation of visible) chats.append(renderConversation(runtime2, project, conversation, current));
        if (conversations.length > CHAT_PREVIEW_LIMIT) {
          const history = button("project-chat-more");
          history.append(el("span", "", `Vedi tutte le ${conversations.length} conversazioni`), icon("arrowUp", 13));
          history.addEventListener("click", () => {
            if (!current) {
              runtime2.post({ type: "openRecentProject", payload: { path: project.path, openHistory: true } });
              return;
            }
            runtime2.historyOpen = true;
            runtime2.render();
          });
          chats.append(history);
        }
      } else {
        chats.append(el("div", "project-chat-empty", "Nessuna conversazione. Usa + per iniziare."));
      }
      card.append(chats);
    }
    return card;
  }
  function renderConversation(runtime2, project, conversation, interactive) {
    const item = el("div", `project-chat-item ${interactive ? "" : "is-preview"}`);
    const open = button("project-chat-item__main");
    open.append(providerGlyph(conversation.provider));
    const copy = el("span", "project-chat-item__copy");
    copy.append(el("strong", "", conversation.title));
    copy.append(el("small", "", `${conversation.messageCount} messaggi \xB7 ${formatRelativeTime(conversation.updatedAt)}`));
    open.append(copy);
    open.addEventListener("click", () => {
      if (!interactive) {
        runtime2.post({ type: "openRecentProject", payload: { path: project.path, conversationId: conversation.id } });
        return;
      }
      runtime2.post({ type: "selectConversation", payload: { id: conversation.id } });
      runtime2.setSection("chat");
    });
    item.append(open);
    const remove = button("project-chat-item__delete");
    remove.append(icon("trash", 13));
    remove.title = "Elimina conversazione";
    remove.setAttribute("aria-label", "Elimina conversazione");
    remove.addEventListener("click", () => {
      runtime2.post({ type: "deleteConversation", payload: { id: conversation.id, projectId: project.id, stay: "projects" } });
    });
    item.append(remove);
    return item;
  }

  // src/ui/screens/agents.ts
  function renderAgents(runtime2) {
    const state = runtime2.state;
    const local = runtime2;
    const page = el("section", "content-page agents-page");
    const header = el("header", "page-header agents-header");
    const copy = el("div");
    copy.append(el("span", "eyebrow", "Orchestration"), el("h1", "", "Agenti"));
    copy.append(el("p", "", "Profili riutilizzabili sopra provider e modelli, senza duplicare la logica dei provider."));
    const create = button("button button--primary");
    create.append(icon("plus", 16), el("span", "", "Nuovo agente"));
    create.addEventListener("click", () => {
      local.agentEditorDraft = blankDraft(state);
      local.agentEditorId = "new";
      local.agentDeleteId = void 0;
      runtime2.render();
    });
    header.append(copy, create);
    page.append(header);
    if (local.agentEditorDraft) {
      page.append(renderAgentEditor(runtime2, local.agentEditorDraft));
      return page;
    }
    const tools = el("div", "agents-toolbar");
    const search = el("label", "agents-search");
    search.append(icon("search", 15));
    const input = el("input");
    input.placeholder = "Cerca agente, specializzazione o provider";
    input.value = local.agentSearch ?? "";
    input.addEventListener("input", () => {
      local.agentSearch = input.value;
      runtime2.render();
    });
    search.append(input);
    const summary = el("span", "agents-toolbar__summary", `${state.agents?.length ?? 0} configurati`);
    tools.append(search, summary);
    page.append(tools);
    const query = String(local.agentSearch ?? "").trim().toLowerCase();
    const agents = (Array.isArray(state.agents) ? state.agents : []).filter((agent) => !query || [agent.name, agent.bio, agent.specialization, agent.provider, agent.model].some((value) => String(value ?? "").toLowerCase().includes(query))).sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || Number(Boolean(b.enabled)) - Number(Boolean(a.enabled)) || a.name.localeCompare(b.name));
    const customAgents = agents.filter((agent) => !agent.bundledTemplate);
    const templateAgents = agents.filter((agent) => agent.bundledTemplate);
    const grid = el("div", "agents-grid");
    if (!agents.length) {
      const empty = el("div", "agents-empty");
      empty.append(icon("sparkle", 24));
      empty.append(el("strong", "", query ? "Nessun agente trovato" : "Crea il primo agente"));
      empty.append(el("span", "", query ? "Modifica la ricerca." : "Configura nome, provider, modello, specializzazione, deleghe e visibilit\xE0 in un\u2019unica schermata."));
      if (!query) {
        const start = button("button button--primary button--small", "Crea agente");
        start.addEventListener("click", () => {
          local.agentEditorDraft = blankDraft(state);
          local.agentEditorId = "new";
          runtime2.render();
        });
        empty.append(start);
      }
      grid.append(empty);
    }
    for (const agent of customAgents) grid.append(renderAgentCard(runtime2, agent));
    if (grid.childElementCount) page.append(grid);
    if (templateAgents.length) {
      const library = el("details", "agent-template-library");
      library.open = Boolean(query) || customAgents.length === 0;
      const librarySummary = el("summary", "agent-template-library__summary");
      const summaryCopy = el("div");
      summaryCopy.append(el("strong", "", "Template ottimizzati"), el("span", "", "Disattivati di default \xB7 attivali solo quando fanno risparmiare contesto e token"));
      librarySummary.append(icon("sparkle", 15), summaryCopy, el("span", "agent-template-library__count", String(templateAgents.length)), icon("chevronDown", 14));
      library.append(librarySummary);
      const templateGrid = el("div", "agents-grid agents-grid--templates");
      for (const agent of templateAgents) templateGrid.append(renderAgentCard(runtime2, agent));
      library.append(templateGrid);
      page.append(library);
    }
    return page;
  }
  function renderAgentCard(runtime2, agent) {
    const state = runtime2.state;
    const local = runtime2;
    const provider = state.providers.find((entry) => entry.id === agent.provider);
    const unavailable = !provider?.available || provider.connected === false;
    const card = el("article", `agent-card agent-card--compact ${agent.enabled ? "" : "is-disabled"} ${agent.isDefault ? "is-default" : ""}`);
    const top = el("div", "agent-card-compact__top");
    const identity = el("div", "agent-card__identity");
    const glyph = el("span", "agent-card__glyph");
    glyph.append(agentGlyph(agent.name));
    const copy = el("div", "agent-card-compact__copy");
    const title = el("div", "agent-card__title");
    title.append(el("strong", "", agent.name));
    if (agent.isDefault) title.append(el("span", "agent-badge is-default", "Default"));
    if (agent.bundledTemplate) title.append(el("span", "agent-badge is-template", "Template"));
    if (!agent.enabled) title.append(el("span", "agent-badge", "Spento"));
    if (unavailable) title.append(el("span", "agent-provider-warning", provider?.connected === false ? "Provider scollegato" : "Provider non disponibile"));
    copy.append(title, el("small", "", providerModelLine(provider, agent)));
    if (agent.specialization || agent.bio) copy.append(el("p", "agent-card-compact__description", [agent.specialization, agent.bio].filter(Boolean).join(" \xB7 ")));
    identity.append(glyph, copy);
    const actions = el("div", "agent-card-compact__actions");
    const use = button("agent-card-icon-action");
    use.append(icon("chat", 15));
    use.title = `Usa ${agent.name} in chat`;
    use.setAttribute("aria-label", use.title);
    use.disabled = !agent.enabled || unavailable;
    use.addEventListener("click", () => {
      runtime2.post({ type: "selectAgent", payload: { agentId: agent.id } });
      runtime2.setSection("chat");
    });
    const edit = button("agent-card-icon-action");
    edit.append(icon("edit", 15));
    edit.title = `Modifica ${agent.name}`;
    edit.setAttribute("aria-label", edit.title);
    edit.addEventListener("click", () => {
      local.agentEditorDraft = draftFromAgent(agent);
      local.agentEditorId = agent.id;
      local.agentDeleteId = void 0;
      runtime2.render();
    });
    const remove = button("agent-card-icon-action agent-card-icon-action--danger");
    remove.append(icon("trash", 15));
    remove.title = `Elimina ${agent.name}`;
    remove.setAttribute("aria-label", remove.title);
    remove.addEventListener("click", () => {
      local.agentDeleteId = agent.id;
      runtime2.render();
    });
    actions.append(use, edit, remove);
    top.append(identity, actions);
    card.append(top);
    const meta = el("div", "agent-card-compact__meta");
    meta.append(compactMeta(
      agent.permission === "danger-full-access" ? "Accesso completo" : agent.permission === "workspace-write" ? "Lettura e scrittura" : "Sola lettura",
      agent.permission === "danger-full-access" ? "is-full" : agent.permission === "workspace-write" ? "is-write" : ""
    ));
    meta.append(compactMeta(agent.canDelegate ? "Pu\xF2 delegare" : "No deleghe"));
    meta.append(compactMeta(agent.globalVisible ? "Globale" : `${agent.projectIds?.length ?? 0} progetti`));
    meta.append(compactMeta(`${agent.taskCount ?? 0} task`));
    card.append(meta);
    const bottom = el("div", "agent-card-compact__bottom");
    bottom.append(el("span", "", agent.lastUsedAt ? `Ultimo uso ${formatRelativeTime(agent.lastUsedAt)}` : "Mai usato"));
    const toggle = button("agent-card-compact__toggle", agent.enabled ? "Spegni" : "Attiva");
    toggle.addEventListener("click", () => runtime2.post({ type: "toggleAgent", payload: { agentId: agent.id, enabled: !agent.enabled } }));
    bottom.append(toggle);
    card.append(bottom);
    if (local.agentDeleteId === agent.id) {
      const confirm = el("div", "agent-card-delete-confirm");
      const confirmCopy = el("div");
      confirmCopy.append(el("strong", "", `Eliminare ${agent.name}?`), el("span", "", "L\u2019azione rimuove soltanto la configurazione dell\u2019agente."));
      const confirmActions = el("div");
      const cancel = button("button button--ghost button--small", "Annulla");
      cancel.addEventListener("click", () => {
        local.agentDeleteId = void 0;
        runtime2.render();
      });
      const confirmDelete = button("button button--danger button--small", "Elimina");
      confirmDelete.addEventListener("click", () => {
        runtime2.post({ type: "deleteAgent", payload: { agentId: agent.id } });
        local.agentDeleteId = void 0;
      });
      confirmActions.append(cancel, confirmDelete);
      confirm.append(confirmCopy, confirmActions);
      card.append(confirm);
    }
    return card;
  }
  function compactMeta(label, className = "") {
    return el("span", `agent-card-compact__pill ${className}`.trim(), label);
  }
  function renderAgentEditor(runtime2, draft) {
    const state = runtime2.state;
    const local = runtime2;
    const editing = Boolean(draft.id);
    const provider = state.providers.find((entry) => entry.id === draft.provider);
    const models = provider?.models ?? [];
    const selectedModel2 = models.find((entry) => entry.id === draft.model) ?? models.find((entry) => entry.id === "auto") ?? models.find((entry) => entry.isDefault);
    const reasoningOptions = selectedModel2?.reasoning ?? [];
    if (draft.model !== "auto" && !models.some((entry) => entry.id === draft.model)) draft.model = "auto";
    if (draft.reasoning !== "auto" && !reasoningOptions.some((entry) => entry.id === draft.reasoning)) draft.reasoning = "auto";
    const shell = el("section", "agent-editor");
    const top = el("header", "agent-editor__header");
    const heading = el("div");
    heading.append(el("span", "eyebrow", editing ? "Modifica configurazione" : "Nuova configurazione"));
    heading.append(el("h2", "", editing ? draft.name || "Agente" : "Nuovo agente"));
    heading.append(el("p", "", "L\u2019agente aggiunge identit\xE0 e specializzazione; parser, tool call e protocolli Relay restano sempre prioritari."));
    const close = button("button button--ghost button--small");
    close.append(icon("close", 14), el("span", "", "Chiudi"));
    close.addEventListener("click", () => closeEditor(runtime2));
    top.append(heading, close);
    shell.append(top);
    const form = el("form", "agent-editor__form");
    const identity = sectionBlock("Campi base", "Solo ci\xF2 che serve per creare l\u2019agente. Tutto il resto resta nelle opzioni avanzate.");
    const identityGrid = el("div", "agent-form-grid agent-form-grid--two");
    identityGrid.append(textField("Nome", "Es. Code Reviewer", draft.name, 80, (value) => {
      draft.name = value;
    }, true));
    identityGrid.append(textField("Specializzazione", "Es. review codice e refactoring", draft.specialization, 160, (value) => {
      draft.specialization = value;
    }));
    identity.body.append(identityGrid);
    const baseHint = el("div", "agent-base-hint");
    baseHint.append(icon("check", 14), el("span", "", "Nome obbligatorio. Specializzazione consigliata. Bio, modello, thinking e istruzioni sono avanzati."));
    identity.body.append(baseHint);
    form.append(identity.section);
    const advanced = el("details", "agent-advanced");
    advanced.open = runtime2.expandedPanels.has("agent:advanced");
    const advancedSummary = el("summary", "agent-advanced__summary");
    advancedSummary.append(el("span", "", "Opzioni avanzate"), el("small", "", "Modello, thinking, istruzioni, deleghe e visibilit\xE0"), icon("chevronDown", 15));
    advanced.append(advancedSummary);
    const advancedBody = el("div", "agent-advanced__body");
    advanced.addEventListener("toggle", () => {
      if (advanced.open) runtime2.expandedPanels.add("agent:advanced");
      else runtime2.expandedPanels.delete("agent:advanced");
    });
    const engine = sectionBlock("Motore", "Account provider, modello e livello di ragionamento realmente compatibili.");
    const engineGrid = el("div", "agent-form-grid agent-form-grid--three");
    const providerSelect = select(draft.provider, state.providers.map((entry) => ({ value: entry.id, label: entry.connected === false ? `${entry.label} \xB7 scollegato` : entry.label, disabled: !entry.available || entry.connected === false })), "premium-select");
    providerSelect.addEventListener("change", () => {
      draft.provider = providerSelect.value;
      draft.model = "auto";
      draft.reasoning = "auto";
      runtime2.render();
    });
    engineGrid.append(selectField("Provider", "Account reale che esegue il task.", providerSelect));
    const modelSelect = select(draft.model, [
      { value: "auto", label: "Automatico" },
      ...models.filter((entry) => entry.id !== "auto" && !entry.hidden).map((entry) => ({ value: entry.id, label: entry.label }))
    ], "premium-select");
    modelSelect.addEventListener("change", () => {
      draft.model = modelSelect.value;
      draft.reasoning = "auto";
      runtime2.render();
    });
    engineGrid.append(selectField("Modello", "Relay valida la combinazione prima del run.", modelSelect));
    const reasoningSelect = select(draft.reasoning, [
      { value: "auto", label: "Automatico" },
      ...reasoningOptions.map((entry) => ({ value: entry.id, label: entry.label }))
    ], "premium-select");
    reasoningSelect.disabled = reasoningOptions.length === 0;
    reasoningSelect.addEventListener("change", () => {
      draft.reasoning = reasoningSelect.value;
    });
    engineGrid.append(selectField("Thinking", reasoningOptions.length ? "Solo livelli esposti dal modello." : "Il modello non espone livelli selezionabili.", reasoningSelect));
    const permissionSelect = select(draft.permission, [
      { value: "read-only", label: "Sola lettura" },
      { value: "workspace-write", label: "Lettura e scrittura nel workspace" },
      { value: "danger-full-access", label: "Accesso completo" }
    ], "premium-select");
    permissionSelect.addEventListener("change", () => {
      draft.permission = permissionSelect.value === "danger-full-access" ? "danger-full-access" : permissionSelect.value === "workspace-write" ? "workspace-write" : "read-only";
    });
    engineGrid.append(selectField("Accesso", "Per agenti di fix e build usa Accesso completo; analisi e audit possono restare in sola lettura.", permissionSelect));
    engine.body.append(engineGrid);
    const capability = el("div", "agent-capability-note");
    capability.append(icon("shield", 14), el("span", "", capabilityText(provider, selectedModel2?.id ?? "auto")));
    engine.body.append(capability);
    advancedBody.append(engine.section);
    const behavior = sectionBlock("Comportamento", "Bio e istruzioni applicate in un layer sicuro, senza poter rompere il formato di output.");
    behavior.body.append(textAreaField("Bio breve", "Una riga che spiega quando scegliere questo agente.", draft.bio, 240, 3, (value) => {
      draft.bio = value;
    }));
    behavior.body.append(textAreaField("Istruzioni custom", "Preferenze, metodo di lavoro, qualit\xE0 attesa e limiti. Evita di ridefinire JSON, parser o protocolli Relay.", draft.instructions, 12e3, 9, (value) => {
      draft.instructions = value;
    }));
    advancedBody.append(behavior.section);
    const governance = sectionBlock("Visibilit\xE0 e permessi", "Decidi dove compare e se pu\xF2 orchestrare altri agenti.");
    const toggles = el("div", "agent-toggle-grid");
    toggles.append(toggleField("Agente attivo", "Pu\xF2 essere selezionato ed eseguire task.", draft.enabled, (value) => {
      draft.enabled = value;
    }));
    toggles.append(toggleField("Visibile in chat", "Compare nel selettore e nelle menzioni.", draft.visibleInChat, (value) => {
      draft.visibleInChat = value;
    }));
    toggles.append(toggleField("Pu\xF2 delegare", "Pu\xF2 richiedere altri provider o agenti.", draft.canDelegate, (value) => {
      draft.canDelegate = value;
    }));
    toggles.append(toggleField("Agente predefinito", "Viene proposto per primo nelle nuove chat.", draft.isDefault, (value) => {
      draft.isDefault = value;
    }));
    governance.body.append(toggles);
    const visibility = el("div", "agent-visibility");
    const visibilitySelect = select(draft.globalVisible ? "global" : "projects", [
      { value: "global", label: "Globale \xB7 tutti i progetti" },
      { value: "projects", label: "Solo progetti selezionati" }
    ], "premium-select");
    visibilitySelect.addEventListener("change", () => {
      draft.globalVisible = visibilitySelect.value === "global";
      if (!draft.globalVisible && draft.projectIds.length === 0 && state.workspace.id) draft.projectIds = [state.workspace.id];
      runtime2.render();
    });
    visibility.append(selectField("Visibilit\xE0", "Gli agenti restano globali come configurazione e vengono associati ai progetti.", visibilitySelect));
    if (!draft.globalVisible) {
      const projects = el("div", "agent-project-picker");
      for (const project of state.projects ?? []) {
        const row = el("label", "agent-project-option");
        const checkbox = el("input");
        checkbox.type = "checkbox";
        checkbox.checked = draft.projectIds.includes(project.id);
        checkbox.addEventListener("change", () => {
          draft.projectIds = checkbox.checked ? [.../* @__PURE__ */ new Set([...draft.projectIds, project.id])] : draft.projectIds.filter((id) => id !== project.id);
        });
        const label = el("span");
        label.append(el("strong", "", project.name), el("small", "", project.path));
        row.append(checkbox, label);
        projects.append(row);
      }
      visibility.append(projects);
    }
    governance.body.append(visibility);
    advancedBody.append(governance.section);
    advanced.append(advancedBody);
    form.append(advanced);
    const actions = el("footer", "agent-editor__actions");
    const cancel = button("button button--ghost", "Annulla");
    cancel.addEventListener("click", () => closeEditor(runtime2));
    const save = button("button button--primary");
    save.type = "submit";
    save.append(icon("check", 15), el("span", "", editing ? "Salva modifiche" : "Crea agente"));
    actions.append(cancel, save);
    if (editing) {
      const remove = button("button button--danger-ghost", "Elimina agente");
      remove.addEventListener("click", () => {
        local.agentDeleteId = draft.id;
        runtime2.render();
      });
      actions.prepend(remove);
    }
    form.append(actions);
    if (editing && local.agentDeleteId === draft.id) {
      const confirmation = el("div", "agent-delete-confirm");
      const warning = el("div");
      warning.append(icon("warning", 16), el("span", "", "Eliminare questa configurazione? Chat, provider e file del progetto non verranno toccati."));
      const controls = el("div");
      const keep = button("button button--ghost button--small", "Annulla");
      keep.addEventListener("click", () => {
        local.agentDeleteId = void 0;
        runtime2.render();
      });
      const confirm = button("button button--danger-ghost button--small", "Elimina definitivamente");
      confirm.addEventListener("click", () => {
        runtime2.post({ type: "deleteAgent", payload: { agentId: draft.id } });
        closeEditor(runtime2);
      });
      controls.append(keep, confirm);
      confirmation.append(warning, controls);
      form.append(confirmation);
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = draft.name.trim();
      if (!name) {
        runtime2.post({ type: "showNotice", payload: { level: "warning", message: "Inserisci un nome per l\u2019agente." } });
        return;
      }
      if (!draft.globalVisible && draft.projectIds.length === 0) {
        runtime2.post({ type: "showNotice", payload: { level: "warning", message: "Seleziona almeno un progetto oppure imposta la visibilit\xE0 globale." } });
        return;
      }
      runtime2.post({
        type: "saveAgent",
        payload: {
          agentId: draft.id,
          name,
          bio: draft.bio,
          provider: draft.provider,
          model: draft.model,
          reasoning: draft.reasoning,
          permission: draft.permission,
          specialization: draft.specialization,
          instructions: draft.instructions,
          enabled: draft.enabled,
          canDelegate: draft.canDelegate,
          visibleInChat: draft.visibleInChat,
          globalVisible: draft.globalVisible,
          projectIds: draft.globalVisible ? [] : draft.projectIds,
          isDefault: draft.isDefault
        }
      });
      closeEditor(runtime2);
    });
    shell.append(form);
    return shell;
  }
  function blankDraft(state) {
    const preferred = state.providers.find((entry) => entry.id === state.preferences.defaultProvider && entry.available) ?? state.providers.find((entry) => entry.available) ?? state.providers[0];
    return {
      name: "",
      bio: "",
      provider: preferred?.id ?? "codex",
      model: "auto",
      reasoning: "auto",
      permission: "read-only",
      specialization: "",
      instructions: "",
      enabled: true,
      canDelegate: false,
      visibleInChat: true,
      globalVisible: true,
      projectIds: [],
      isDefault: false
    };
  }
  function draftFromAgent(agent) {
    return {
      id: agent.id,
      name: agent.name ?? "",
      bio: agent.bio ?? "",
      provider: agent.provider,
      model: agent.model ?? "auto",
      reasoning: agent.reasoning ?? "auto",
      permission: agent.permission === "danger-full-access" ? "danger-full-access" : agent.permission === "workspace-write" ? "workspace-write" : "read-only",
      specialization: agent.specialization ?? "",
      instructions: agent.instructions ?? "",
      enabled: agent.enabled !== false,
      canDelegate: Boolean(agent.canDelegate),
      visibleInChat: agent.visibleInChat !== false,
      globalVisible: agent.globalVisible !== false,
      projectIds: [...agent.projectIds ?? []],
      isDefault: Boolean(agent.isDefault)
    };
  }
  function closeEditor(runtime2) {
    const local = runtime2;
    local.agentEditorDraft = void 0;
    local.agentEditorId = void 0;
    local.agentDeleteId = void 0;
    runtime2.render();
  }
  function providerModelLine(provider, agent) {
    const model = agent.model && agent.model !== "auto" ? provider?.models.find((entry) => entry.id === agent.model)?.label ?? agent.model : "Modello automatico";
    const reasoning = agent.reasoning && agent.reasoning !== "auto" ? ` \xB7 ${agent.reasoning}` : "";
    return `${provider?.label ?? agent.provider} \xB7 ${model}${reasoning}`;
  }
  function sectionBlock(title, description) {
    const section = el("section", "agent-editor-section");
    const heading = el("header");
    heading.append(el("h3", "", title), el("p", "", description));
    const body = el("div", "agent-editor-section__body");
    section.append(heading, body);
    return { section, body };
  }
  function textField(label, hint, value, maxLength, onInput, required = false) {
    const field = el("label", "agent-field");
    field.append(el("span", "agent-field__label", label), el("small", "", hint));
    const input = el("input", "agent-input");
    input.value = value;
    input.maxLength = maxLength;
    input.required = required;
    input.addEventListener("input", () => onInput(input.value));
    field.append(input);
    return field;
  }
  function textAreaField(label, hint, value, maxLength, rows, onInput) {
    const field = el("label", "agent-field");
    field.append(el("span", "agent-field__label", label), el("small", "", hint));
    const input = el("textarea", "agent-textarea");
    input.value = value;
    input.maxLength = maxLength;
    input.rows = rows;
    input.addEventListener("input", () => onInput(input.value));
    field.append(input);
    return field;
  }
  function selectField(label, hint, control) {
    const field = el("label", "agent-field");
    field.append(el("span", "agent-field__label", label), el("small", "", hint));
    const shell = el("div", "select-shell");
    shell.append(control, icon("chevronDown", 14));
    field.append(shell);
    return field;
  }
  function toggleField(label, hint, checked, onChange) {
    const field = el("label", "agent-toggle");
    const copy = el("span");
    copy.append(el("strong", "", label), el("small", "", hint));
    const control = el("span", "agent-toggle__control");
    const input = el("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    control.append(input, el("span"));
    field.append(copy, control);
    return field;
  }
  function capabilityText(provider, modelId) {
    if (!provider) return "Provider non disponibile: l\u2019agente pu\xF2 essere salvato, ma non eseguito.";
    const model = provider.models.find((entry) => entry.id === modelId);
    const thinking = model?.reasoning?.length ? `${model.reasoning.length} livelli thinking` : "thinking gestito dal provider";
    return `${provider.available ? "Provider pronto" : "Provider non disponibile"} \xB7 ${thinking}.`;
  }

  // src/core/skill-utils.ts
  function groupSkillsByName(items) {
    const groups = /* @__PURE__ */ new Map();
    for (const item of items ?? []) {
      const name = item.name.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(item);
        if (!existing.description && item.description) existing.description = item.description;
      } else {
        groups.set(key, { name, description: item.description ?? "", items: [item] });
      }
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  // src/ui/screens/rules.ts
  var PROVIDERS = [
    { id: "codex", label: "Codex" },
    { id: "claude", label: "Claude Code" },
    { id: "antigravity", label: "Antigravity" },
    { id: "copilot", label: "GitHub Copilot" }
  ];
  function renderRules(runtime2) {
    const state = runtime2.state;
    const local = runtime2;
    const activeTab = local.rulesTab === "skills" ? "skills" : "rules";
    const skillGroups = groupSkillsByName(state.skills?.items ?? []);
    const page = el("section", "content-page content-page--rules rules-studio");
    const selected = runtime2.ruleDraft ?? (runtime2.selectedRuleId ? state.rules.find((rule) => rule.id === runtime2.selectedRuleId) : void 0);
    const header = el("header", "page-header rules-header rules-header--compact");
    const copy = el("div");
    copy.append(el("span", "eyebrow", "Governance"), el("h1", "", activeTab === "skills" ? "Skill Provider" : "Regole & System Prompts"));
    copy.append(el("p", "", activeTab === "skills" ? "Sfoglia le skill native rilevate nei provider. Relay modifica soltanto quelle con marcatore gestito." : "Le regole restano la fonte di verit\xE0 e possono essere pubblicate come skill native dei provider."));
    const actions = el("div", "rules-header__actions");
    const sync = button("button button--secondary");
    sync.append(icon("refresh", 15), el("span", "", "Sincronizza skill"));
    sync.addEventListener("click", () => runtime2.post({ type: "syncSkills" }));
    actions.append(sync);
    if (activeTab === "rules") {
      const add = button("button button--primary");
      add.append(icon("plus", 15), el("span", "", "Nuova regola"));
      add.addEventListener("click", () => {
        runtime2.ruleDraft = draftRule(state.workspace.id);
        delete runtime2.selectedRuleId;
        runtime2.render();
      });
      actions.append(add);
    }
    header.append(copy, actions);
    page.append(header);
    const tabs = el("div", "rules-tabs");
    for (const [id, label] of [["rules", `Regole Relay (${state.rules.length})`], ["skills", `Skill trovate (${skillGroups.length})`]]) {
      const tab = button(`rules-tab ${activeTab === id ? "is-active" : ""}`);
      tab.append(el("span", "", label));
      tab.addEventListener("click", () => {
        local.rulesTab = id;
        runtime2.render();
      });
      tabs.append(tab);
    }
    page.append(tabs);
    if (activeTab === "skills") {
      page.append(renderSkillBrowser(runtime2));
      return page;
    }
    const layout = el("div", `rules-layout ${selected ? "has-selection" : ""}`);
    layout.append(renderRuleLibrary(runtime2, selected?.id));
    layout.append(selected ? renderRuleEditor(runtime2, selected) : renderRulesWelcome(runtime2));
    page.append(layout);
    return page;
  }
  function renderRuleLibrary(runtime2, selectedId) {
    const state = runtime2.state;
    const panel = el("aside", "rules-library-panel");
    const heading = el("div", "rules-library-heading");
    const counts = `${state.rules.filter((rule) => rule.enabled).length} attive \xB7 ${state.rules.length} totali`;
    heading.append(el("strong", "", "Regole configurate"), el("span", "", counts));
    panel.append(heading);
    const list = el("div", "rules-library-list rules-library-list--studio");
    const rules = [...state.rules].sort((a, b) => {
      if (a.scope !== b.scope) return a.scope === "project" ? -1 : 1;
      return (a.priority ?? 100) - (b.priority ?? 100) || a.name.localeCompare(b.name);
    });
    if (!rules.length) {
      const empty = el("div", "rules-library-empty");
      empty.append(icon("rules", 22), el("strong", "", "Nessuna regola"), el("span", "", "Creane una per guidare gli agenti in modo coerente."));
      list.append(empty);
    }
    for (const rule of rules) {
      const row = el("article", `rule-library-row ${rule.id === selectedId ? "is-active" : ""}`);
      const open = button("rule-library-row__main");
      open.addEventListener("click", () => {
        delete runtime2.ruleDraft;
        runtime2.selectedRuleId = rule.id;
        runtime2.render();
      });
      const stateDot = el("span", `rule-state ${rule.enabled ? "is-enabled" : ""}`);
      const text = el("span", "rule-library-row__copy");
      text.append(el("strong", "", rule.name));
      text.append(el("small", "", `${scopeLabel(rule, state.workspace.name)} \xB7 ${providerSummary(rule.providers)} \xB7 P${rule.priority ?? 100}`));
      if (rule.skillPublication?.enabled) {
        const badges = el("span", "rule-skill-badges");
        for (const provider of rule.skillPublication.providers) {
          const badge = el("span", `rule-skill-badge rule-skill-badge--${provider}`);
          badge.title = `Pubblicata come skill per ${PROVIDERS.find((entry) => entry.id === provider)?.label ?? provider}`;
          badge.append(providerGlyph(provider), icon("check", 10));
          badges.append(badge);
        }
        text.append(badges);
      }
      open.append(stateDot, text, icon("chevronDown", 14));
      const toggle = el("label", "rule-library-toggle");
      toggle.title = rule.enabled ? "Disattiva regola" : "Attiva regola";
      const input = el("input");
      input.type = "checkbox";
      input.checked = rule.enabled;
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("change", () => runtime2.post({ type: "toggleRule", payload: { id: rule.id, enabled: input.checked } }));
      toggle.append(input, el("span"));
      row.append(open, toggle);
      list.append(row);
    }
    panel.append(list);
    return panel;
  }
  function renderRulesWelcome(runtime2) {
    const state = runtime2.state;
    const welcome = el("section", "rules-welcome");
    const visual = el("div", "rules-welcome__icon");
    visual.append(icon("rules", 28));
    welcome.append(visual);
    welcome.append(el("h2", "", state.rules.length ? "Seleziona una regola" : "Crea la prima regola"));
    welcome.append(el("p", "", state.rules.length ? "Apri una regola dalla lista per modificarne ambito, priorit\xE0, provider e istruzioni." : "Le regole vengono applicate agli agenti prima del task e possono essere globali oppure specifiche del progetto."));
    const add = button("button button--primary", "Nuova regola");
    add.addEventListener("click", () => {
      runtime2.ruleDraft = draftRule(state.workspace.id);
      runtime2.render();
    });
    welcome.append(add);
    return welcome;
  }
  function renderRuleEditor(runtime2, selected) {
    const state = runtime2.state;
    const form = el("form", "rule-editor rule-editor--studio rule-editor--usable");
    const editorHeader = el("header", "rule-editor__topbar");
    const editorTitle = el("div");
    editorTitle.append(el("span", "eyebrow", selected.id.startsWith("draft:") ? "Nuova regola" : "Modifica regola"));
    editorTitle.append(el("strong", "", selected.name || "Senza nome"));
    const close = iconButton("close", "Chiudi regola", "icon-button rule-editor__close");
    close.addEventListener("click", () => {
      delete runtime2.ruleDraft;
      delete runtime2.selectedRuleId;
      runtime2.render();
    });
    editorHeader.append(editorTitle, close);
    form.append(editorHeader);
    const hero = el("div", "rule-editor__hero");
    const identity = el("div", "rule-editor__identity");
    const name = el("input", "rule-name");
    name.value = selected.name;
    name.placeholder = "Nome della regola";
    const description = el("input", "rule-description");
    description.value = selected.description ?? "";
    description.placeholder = "Descrizione breve, facoltativa";
    identity.append(name, description);
    const active = el("label", "rule-active-toggle");
    const activeInput = el("input");
    activeInput.type = "checkbox";
    activeInput.checked = selected.enabled;
    active.append(activeInput, el("span", "", "Attiva"));
    hero.append(identity, active);
    form.append(hero);
    const advanced = el("details", "rule-advanced");
    advanced.open = runtime2.expandedPanels.has("rule:advanced");
    const advancedSummary = el("summary", "rule-advanced__summary");
    advancedSummary.append(el("span", "", "Opzioni avanzate"), el("small", "", "Ambito, priorit\xE0, obbligatoriet\xE0 e provider"), icon("chevronDown", 15));
    advanced.append(advancedSummary);
    const advancedBody = el("div", "rule-advanced__body");
    advanced.addEventListener("toggle", () => {
      if (advanced.open) runtime2.expandedPanels.add("rule:advanced");
      else runtime2.expandedPanels.delete("rule:advanced");
    });
    const controls = el("div", "rule-config-grid");
    const scope = segmentedField("Ambito", [
      { value: "global", label: "Globale" },
      { value: "project", label: "Progetto" }
    ], selected.scope);
    controls.append(scope.field);
    const priority = el("input", "rule-priority");
    priority.type = "number";
    priority.min = "0";
    priority.max = "999";
    priority.value = String(selected.priority ?? 100);
    const priorityField = configField("Priorit\xE0", "0 prima \xB7 999 dopo");
    priorityField.append(priority);
    controls.append(priorityField);
    const mandatory = el("label", "rule-mandatory");
    const mandatoryInput = el("input");
    mandatoryInput.type = "checkbox";
    mandatoryInput.checked = Boolean(selected.mandatory);
    mandatory.append(mandatoryInput, el("span", "", "Obbligatoria"), el("small", "", "Le richieste successive non possono indebolirla"));
    controls.append(mandatory);
    advancedBody.append(controls);
    const providerSection = el("section", "rule-provider-targets");
    const providerTitle = el("div", "rule-section-heading");
    providerTitle.append(el("strong", "", "Provider"), el("span", "", "Uno, pi\xF9 provider oppure tutti"));
    providerSection.append(providerTitle);
    const providers = el("div", "provider-target-grid");
    const selectedProviders = new Set(selected.providers?.length ? selected.providers : ["codex", "claude", "antigravity", "copilot"]);
    for (const provider of PROVIDERS) {
      const label = el("label", `provider-target ${selectedProviders.has(provider.id) ? "is-selected" : ""}`);
      const checkbox = el("input");
      checkbox.type = "checkbox";
      checkbox.value = provider.id;
      checkbox.checked = selectedProviders.has(provider.id);
      checkbox.addEventListener("change", () => label.classList.toggle("is-selected", checkbox.checked));
      label.append(checkbox, providerGlyph(provider.id), el("span", "", provider.label));
      providers.append(label);
    }
    providerSection.append(providers);
    advancedBody.append(providerSection);
    advanced.append(advancedBody);
    form.append(advanced);
    const publicationSection = el("section", "rule-publication-section");
    const publicationHeading = el("div", "rule-section-heading");
    publicationHeading.append(el("strong", "", "Pubblicazione skill"), el("span", "", "Materializza SKILL.md nativi mantenendo Relay come fonte di verit\xE0"));
    publicationSection.append(publicationHeading);
    const publicationIntro = el("div", "rule-skill-explainer");
    publicationIntro.append(icon("sparkle", 18), el("span", "", "Le skill sono la versione nativa delle tue regole: il provider le carica automaticamente quando servono."));
    publicationSection.append(publicationIntro);
    const publishToggle = el("label", "rule-publish-toggle");
    const publishInput = el("input");
    publishInput.type = "checkbox";
    publishInput.checked = Boolean(selected.skillPublication?.enabled);
    publishToggle.append(publishInput, el("span", "", "Pubblica come skill"));
    publicationSection.append(publishToggle);
    const skillTargets = el("div", "provider-target-grid rule-skill-targets");
    const publishedProviders = new Set(selected.skillPublication?.providers ?? []);
    const support = new Map((state.skills?.providers ?? []).map((entry) => [entry.provider, entry]));
    for (const provider of PROVIDERS) {
      const available = support.get(provider.id)?.available !== false;
      const label = el("label", `provider-target ${publishedProviders.has(provider.id) ? "is-selected" : ""} ${available ? "" : "is-disabled"}`);
      const checkbox = el("input");
      checkbox.type = "checkbox";
      checkbox.value = provider.id;
      checkbox.checked = publishedProviders.has(provider.id);
      checkbox.disabled = !available;
      checkbox.addEventListener("change", () => label.classList.toggle("is-selected", checkbox.checked));
      label.append(checkbox, providerGlyph(provider.id), el("span", "", provider.label));
      if (!available) label.title = support.get(provider.id)?.note ?? "Skill non supportate in questa installazione.";
      skillTargets.append(label);
    }
    publicationSection.append(skillTargets);
    const codexSupport = support.get("codex");
    if (codexSupport?.featureEnabled === false) {
      const codexFlag = el("div", "rule-codex-flag");
      codexFlag.append(el("span", "", codexSupport.note ?? "Codex potrebbe richiedere l\u2019abilitazione delle skill."));
      const enable = button("button button--secondary button--small", "Abilita skill Codex");
      enable.addEventListener("click", () => runtime2.post({ type: "enableCodexSkills" }));
      codexFlag.append(enable);
      publicationSection.append(codexFlag);
    }
    form.append(publicationSection);
    const contentSection = el("section", "rule-content-section");
    const contentHeading = el("div", "rule-section-heading");
    contentHeading.append(el("strong", "", "Istruzioni"), el("span", "", "Markdown semplice e operativo"));
    const content = el("textarea", "rule-content");
    content.value = selected.content;
    content.spellcheck = false;
    content.placeholder = "Esempio: analizza la codebase prima di modificare file; limita le modifiche al task richiesto\u2026";
    contentSection.append(contentHeading, content);
    form.append(contentSection);
    const footer = el("footer", "rule-editor__footer");
    const meta = el("div", "rule-editor__meta");
    meta.append(el("span", "", selected.scope === "project" ? state.workspace.name : "Tutti i progetti"));
    footer.append(meta);
    const footerActions = el("div", "rule-editor__actions");
    if (!selected.id.startsWith("draft:")) {
      const remove = button("button button--danger-ghost");
      remove.append(icon("trash", 15), el("span", "", "Elimina"));
      remove.addEventListener("click", () => runtime2.post({ type: "deleteRule", payload: { id: selected.id } }));
      footerActions.append(remove);
    }
    const save = button("button button--primary");
    save.type = "submit";
    save.append(icon("check", 15), el("span", "", "Salva"));
    footerActions.append(save);
    footer.append(footerActions);
    form.append(footer);
    const syncDraft = () => {
      const targets = Array.from(providers.querySelectorAll("input:checked")).map((input) => input.value);
      runtime2.ruleDraft = {
        ...selected,
        name: name.value,
        ...description.value ? { description: description.value } : {},
        scope: scope.value(),
        providers: targets,
        priority: Number(priority.value || 100),
        mandatory: mandatoryInput.checked,
        enabled: activeInput.checked,
        content: content.value,
        skillPublication: {
          enabled: publishInput.checked,
          providers: Array.from(skillTargets.querySelectorAll("input:checked")).map((input) => input.value)
        }
      };
      if (!description.value) delete runtime2.ruleDraft.description;
    };
    for (const control of [name, description, priority, activeInput, mandatoryInput, content]) {
      const inputControl = control.tagName === "INPUT" ? control : void 0;
      control.addEventListener(inputControl && (inputControl.type === "checkbox" || inputControl.type === "number") ? "change" : "input", syncDraft);
    }
    providers.addEventListener("change", syncDraft);
    skillTargets.addEventListener("change", syncDraft);
    publishInput.addEventListener("change", syncDraft);
    scope.field.addEventListener("click", () => queueMicrotask(syncDraft));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const targets = Array.from(providers.querySelectorAll("input:checked")).map((input) => input.value);
      if (!name.value.trim() || !content.value.trim()) {
        runtime2.post({ type: "showNotice", payload: { level: "warning", message: "Inserisci nome e istruzioni della regola." } });
        return;
      }
      if (!targets.length) {
        runtime2.post({ type: "showNotice", payload: { level: "warning", message: "Seleziona almeno un provider." } });
        return;
      }
      const skillProviders = Array.from(skillTargets.querySelectorAll("input:checked")).map((input) => input.value);
      if (publishInput.checked && !description.value.trim()) {
        runtime2.post({ type: "showNotice", payload: { level: "warning", message: "Inserisci una descrizione: serve ai provider per caricare automaticamente la skill." } });
        return;
      }
      if (publishInput.checked && !skillProviders.length) {
        runtime2.post({ type: "showNotice", payload: { level: "warning", message: "Seleziona almeno un provider per la pubblicazione skill." } });
        return;
      }
      runtime2.post({
        type: "saveRule",
        payload: {
          ...selected.id.startsWith("draft:") ? {} : { id: selected.id },
          name: name.value.trim(),
          description: description.value.trim(),
          scope: scope.value(),
          providers: targets,
          priority: Number(priority.value || 100),
          mandatory: mandatoryInput.checked,
          enabled: activeInput.checked,
          content: content.value,
          skillPublication: { enabled: publishInput.checked, providers: skillProviders }
        }
      });
      delete runtime2.ruleDraft;
    });
    return form;
  }
  function renderSkillBrowser(runtime2) {
    const state = runtime2.state;
    const browser = el("section", "skill-browser");
    const providerSummaryNode = el("div", "skill-provider-summary");
    for (const provider of state.skills?.providers ?? []) {
      const card = el("article", `skill-provider-card ${provider.available ? "is-ready" : "is-unavailable"}`);
      card.append(providerGlyph(provider.provider));
      const copy = el("div");
      copy.append(el("strong", "", PROVIDERS.find((entry) => entry.id === provider.provider)?.label ?? provider.provider));
      copy.append(el("span", "", provider.available ? "Directory skill rilevata" : provider.note ?? "Non disponibile"));
      card.append(copy, el("span", `status-pill ${provider.available ? "is-ready" : "is-muted"}`, provider.available ? "Pronto" : "Escluso"));
      providerSummaryNode.append(card);
    }
    browser.append(providerSummaryNode);
    const skillGroups = groupSkillsByName(state.skills?.items ?? []);
    if (!skillGroups.length) {
      const empty = el("div", "rules-library-empty skill-browser-empty");
      empty.append(icon("sparkle", 24), el("strong", "", "Nessuna skill rilevata"), el("span", "", "Pubblica una regola oppure crea una skill direttamente nel provider."));
      browser.append(empty);
      return browser;
    }
    const list = el("div", "skill-browser-list");
    for (const group of skillGroups) {
      const item = group.items[0];
      const managed = group.items.find((entry) => entry.managed && entry.ruleId);
      const providers = [...new Set(group.items.map((entry) => entry.provider))];
      const row = el("article", "skill-browser-row");
      const copy = el("div", "skill-browser-row__copy");
      const title = el("div", "skill-browser-row__title");
      title.append(providerGlyph(item.provider), el("strong", "", group.name));
      copy.append(title);
      copy.append(el("span", "", group.description || "Nessuna descrizione"));
      const meta = el("div", "skill-browser-row__meta");
      const providerBadges = el("div", "skill-browser-provider-badges");
      for (const provider of providers) {
        const badge = el("span", "skill-browser-provider-badge");
        badge.append(providerGlyph(provider), el("span", "", PROVIDERS.find((entry) => entry.id === provider)?.label ?? provider));
        providerBadges.append(badge);
      }
      meta.append(providerBadges, el("span", `skill-browser-origin ${managed ? "is-managed" : "is-manual"}`, managed ? "Gestita da Relay" : "Manuale"));
      copy.append(meta);
      const actions = el("div", "skill-browser-row__actions");
      const open = button("button button--secondary button--small", "Apri file");
      open.addEventListener("click", () => runtime2.post({ type: "openSkillFile", payload: { path: item.filePath } }));
      actions.append(open);
      if (managed?.ruleId) {
        const remove = button("button button--danger-ghost button--small", "Elimina");
        remove.addEventListener("click", () => runtime2.post({ type: "deleteManagedSkill", payload: { ruleId: managed.ruleId } }));
        actions.append(remove);
      }
      row.append(copy, actions);
      list.append(row);
    }
    browser.append(list);
    const report = state.skills?.lastReport;
    if (report) browser.append(el("div", "skill-sync-report", `Ultimo sync: ${report.created} create \xB7 ${report.updated} aggiornate \xB7 ${report.removed} rimosse \xB7 ${report.skipped} saltate`));
    return browser;
  }
  function configField(label, hint) {
    const node = el("label", "rule-config-field");
    node.append(el("span", "", label));
    if (hint) node.append(el("small", "", hint));
    return node;
  }
  function segmentedField(label, options, initial) {
    let current = initial;
    const field = configField(label);
    const group = el("div", "rule-segmented");
    for (const option of options) {
      const item = button(`rule-segmented__item ${option.value === current ? "is-active" : ""}`, option.label);
      item.addEventListener("click", () => {
        current = option.value;
        for (const child of Array.from(group.children)) child.classList.remove("is-active");
        item.classList.add("is-active");
      });
      group.append(item);
    }
    field.append(group);
    return { field, value: () => current };
  }
  function draftRule(projectId) {
    return {
      id: `draft:${Date.now()}`,
      name: "",
      description: "",
      scope: "project",
      projectId,
      providers: ["codex", "claude", "antigravity", "copilot"],
      priority: 100,
      enabled: true,
      path: "",
      content: "",
      skillPublication: { enabled: false, providers: [] }
    };
  }
  function providerSummary(providers) {
    if (providers.length === 4) return "Tutti";
    return providers.map((provider) => provider === "claude" ? "Claude" : provider === "antigravity" ? "Antigravity" : provider === "copilot" ? "Copilot" : "Codex").join(" + ");
  }
  function scopeLabel(rule, projectName) {
    return rule.scope === "project" ? projectName : "Globale";
  }

  // src/ui/screens/mcp.ts
  var PROVIDERS2 = [
    { id: "claude", label: "Claude Code" },
    { id: "codex", label: "Codex" },
    { id: "copilot", label: "GitHub Copilot" },
    { id: "antigravity", label: "Antigravity" }
  ];
  function renderMcp(runtime2) {
    const state = runtime2.state;
    const local = runtime2;
    const page = el("section", "content-page mcp-page");
    const header = el("header", "page-header mcp-header");
    const copy = el("div");
    copy.append(el("span", "eyebrow", "Context protocol"), el("h1", "", "MCP"));
    copy.append(el("p", "", "Inventario unificato dei server MCP configurati nei provider. Toggle reversibili e definizioni tradotte senza esporre segreti."));
    const actions = el("div", "mcp-header__actions");
    const refresh = button("button button--secondary");
    refresh.append(icon("refresh", 15), el("span", "", "Aggiorna"));
    refresh.addEventListener("click", () => runtime2.post({ type: "refreshMcp" }));
    const add = button("button button--primary");
    add.append(icon("plus", 15), el("span", "", "Aggiungi server"));
    add.addEventListener("click", () => {
      local.mcpEditorDraft = emptyDraft();
      runtime2.render();
    });
    actions.append(refresh, add);
    header.append(copy, actions);
    page.append(header);
    if (state.mcp.errors.length) {
      const warning = el("section", "mcp-warning");
      warning.append(icon("warning", 17));
      const warningCopy = el("div");
      warningCopy.append(el("strong", "", "Alcuni provider non hanno restituito l\u2019inventario"));
      for (const item of state.mcp.errors) warningCopy.append(el("span", "", `${providerName(item.provider)}: ${item.message}`));
      warning.append(warningCopy);
      page.append(warning);
    }
    if (local.mcpEditorDraft) page.append(renderMcpEditor(runtime2, local.mcpEditorDraft));
    const servers = state.mcp.servers;
    if (!servers.length) {
      const empty = el("section", "mcp-empty");
      empty.append(icon("workflow", 28), el("h2", "", "Nessun server MCP"), el("p", "", "Aggiungi un server stdio o HTTP e pubblicalo su uno o pi\xF9 provider."));
      page.append(empty);
      return page;
    }
    const groups = el("div", "mcp-groups");
    for (const provider of PROVIDERS2) {
      const providerServers = servers.filter((server) => server.provider === provider.id);
      const status = state.providers.find((entry) => entry.id === provider.id);
      if (!status?.available && !providerServers.length) continue;
      const section = el("section", "mcp-provider-group");
      const groupHeader = el("header", "mcp-provider-group__header");
      groupHeader.append(providerGlyph(provider.id));
      const headingCopy = el("div");
      headingCopy.append(el("strong", "", provider.label), el("span", "", `${providerServers.length} server \xB7 ${status?.available ? "provider disponibile" : "provider non disponibile"}`));
      groupHeader.append(headingCopy, el("span", `status-pill ${status?.available ? "is-ready" : "is-muted"}`, status?.available ? "Pronto" : "Offline"));
      section.append(groupHeader);
      const list = el("div", "mcp-server-list");
      for (const server of providerServers) list.append(renderMcpCard(runtime2, server));
      if (!providerServers.length) list.append(el("div", "mcp-provider-empty", "Nessun server configurato per questo provider."));
      section.append(list);
      groups.append(section);
    }
    page.append(groups);
    return page;
  }
  function renderMcpCard(runtime2, server) {
    const local = runtime2;
    const card = el("article", `mcp-card ${server.enabled ? "" : "is-disabled"}`);
    const main = el("div", "mcp-card__main");
    const status = el("span", `mcp-status-dot is-${server.status ?? "unknown"}`);
    status.title = server.status === "connected" ? "Connesso" : server.status === "failed" ? "Connessione fallita" : "Stato non esposto";
    const copy = el("div", "mcp-card__copy");
    copy.append(el("strong", "", server.name));
    copy.append(el("span", "", server.target));
    const meta = el("div", "mcp-card__meta");
    meta.append(el("span", "mcp-badge", server.transport.toUpperCase()));
    meta.append(el("span", "mcp-badge", server.scope === "global" ? "Globale" : "Progetto"));
    if (server.statusDetail) meta.append(el("span", "mcp-status-detail", server.statusDetail));
    copy.append(meta);
    main.append(status, copy);
    const toggle = el("label", "mcp-toggle");
    const input = el("input");
    input.type = "checkbox";
    input.checked = server.enabled;
    input.addEventListener("change", () => runtime2.post({
      type: "toggleMcp",
      payload: { provider: server.provider, name: server.name, scope: server.scope, enabled: input.checked }
    }));
    toggle.append(input, el("span"));
    main.append(toggle);
    const menu = el("details", "mcp-menu");
    const trigger = el("summary", "mcp-menu__trigger");
    trigger.append(icon("more", 16));
    menu.append(trigger);
    const popover = el("div", "mcp-menu__popover");
    popover.append(menuAction("edit", "Modifica", () => {
      local.mcpEditorDraft = { ...server, providers: [server.provider], envText: mapToLines(server.env), headersText: mapToLines(server.headers), argsText: (server.args ?? []).join("\n") };
      runtime2.render();
    }));
    const copyDetails = el("details", "mcp-copy-details");
    const copySummary = el("summary", "mcp-menu__item");
    copySummary.append(icon("copy", 14), el("span", "", "Copia su altro provider"));
    copyDetails.append(copySummary);
    const targets = el("div", "mcp-copy-targets");
    const checkboxes = [];
    for (const provider of PROVIDERS2.filter((entry) => entry.id !== server.provider && runtime2.state.providers.some((status2) => status2.id === entry.id && status2.available))) {
      const label = el("label");
      const checkbox = el("input");
      checkbox.type = "checkbox";
      checkbox.value = provider.id;
      checkboxes.push(checkbox);
      label.append(checkbox, providerGlyph(provider.id), el("span", "", provider.label));
      targets.append(label);
    }
    const confirm = button("button button--primary button--small", "Copia");
    confirm.addEventListener("click", () => {
      const providers = checkboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
      if (!providers.length) return;
      runtime2.post({ type: "copyMcp", payload: { provider: server.provider, name: server.name, scope: server.scope, providers } });
    });
    targets.append(confirm);
    copyDetails.append(targets);
    popover.append(copyDetails);
    popover.append(menuAction("trash", "Rimuovi", () => runtime2.post({ type: "removeMcp", payload: { provider: server.provider, name: server.name, scope: server.scope } }), true));
    menu.append(popover);
    card.append(main, menu);
    return card;
  }
  function renderMcpEditor(runtime2, draft) {
    const local = runtime2;
    const form = el("form", "mcp-editor");
    const top = el("header", "mcp-editor__header");
    const copy = el("div");
    copy.append(el("span", "eyebrow", draft.provider ? "Modifica MCP" : "Nuovo MCP"), el("strong", "", draft.name || "Definizione server"));
    const close = iconButton("close", "Chiudi");
    close.addEventListener("click", () => {
      delete local.mcpEditorDraft;
      runtime2.render();
    });
    top.append(copy, close);
    form.append(top);
    const grid = el("div", "mcp-editor__grid");
    const name = fieldInput("Nome", draft.name ?? "", "es. github");
    const transport = fieldSelect("Trasporto", draft.transport ?? "stdio", [{ value: "stdio", label: "stdio" }, { value: "http", label: "HTTP" }]);
    const scope = fieldSelect("Ambito", draft.scope ?? "project", [{ value: "project", label: "Progetto" }, { value: "global", label: "Globale" }]);
    const target = fieldInput("Comando o URL", draft.target ?? "", draft.transport === "http" ? "https://\u2026" : "npx / percorso eseguibile");
    grid.append(name.field, transport.field, scope.field, target.field);
    form.append(grid);
    const providers = el("div", "mcp-editor__providers");
    providers.append(el("strong", "", "Provider di destinazione"));
    const selected = new Set(draft.providers ?? (draft.provider ? [draft.provider] : []));
    const providerInputs = [];
    const providerGrid = el("div", "provider-target-grid");
    for (const provider of PROVIDERS2) {
      const status = runtime2.state.providers.find((entry) => entry.id === provider.id);
      const label = el("label", `provider-target ${selected.has(provider.id) ? "is-selected" : ""} ${status?.available ? "" : "is-disabled"}`);
      const input = el("input");
      input.type = "checkbox";
      input.value = provider.id;
      input.checked = selected.has(provider.id);
      input.disabled = !status?.available;
      input.addEventListener("change", () => label.classList.toggle("is-selected", input.checked));
      providerInputs.push(input);
      label.append(input, providerGlyph(provider.id), el("span", "", provider.label));
      providerGrid.append(label);
    }
    providers.append(providerGrid);
    form.append(providers);
    const advanced = el("details", "mcp-editor__advanced");
    advanced.open = true;
    const summary = el("summary");
    summary.append(el("span", "", "Argomenti e variabili"), icon("chevronDown", 14));
    advanced.append(summary);
    const args = fieldTextarea("Argomenti", draft.argsText ?? (draft.args ?? []).join("\n"), "Un argomento per riga");
    const env = fieldTextarea("Variabili env", draft.envText ?? mapToLines(draft.env), "KEY=VALUE, una per riga");
    env.input.classList.add("is-secret-masked");
    const reveal = button("button button--secondary button--small", "Mostra valori");
    reveal.addEventListener("click", () => {
      env.input.classList.toggle("is-secret-masked");
      reveal.textContent = env.input.classList.contains("is-secret-masked") ? "Mostra valori" : "Nascondi valori";
    });
    env.field.append(reveal);
    const headers = fieldTextarea("Header HTTP", draft.headersText ?? mapToLines(draft.headers), "Authorization=Bearer \u2026");
    headers.input.classList.add("is-secret-masked");
    const bearer = fieldInput("Bearer token env var", draft.bearerTokenEnvVar ?? "", "es. GITHUB_TOKEN");
    advanced.append(args.field, env.field, headers.field, bearer.field);
    form.append(advanced);
    const footer = el("footer", "mcp-editor__footer");
    footer.append(el("span", "", "I file toccati vengono salvati anche come .relay-bak. I segreti non compaiono nei diagnostici."));
    const save = button("button button--primary", draft.provider ? "Salva modifiche" : "Aggiungi e verifica");
    save.type = "submit";
    footer.append(save);
    form.append(footer);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const targets = providerInputs.filter((input) => input.checked).map((input) => input.value);
      if (!name.input.value.trim() || !target.input.value.trim() || !targets.length) {
        runtime2.post({ type: "showNotice", payload: { level: "warning", message: "Nome, destinazione e almeno un provider sono obbligatori." } });
        return;
      }
      runtime2.post({
        type: "addMcp",
        payload: {
          name: name.input.value.trim(),
          transport: transport.input.value,
          target: target.input.value.trim(),
          scope: scope.input.value,
          providers: targets,
          args: args.input.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
          env: parseMapLines(env.input.value),
          headers: parseMapLines(headers.input.value),
          bearerTokenEnvVar: bearer.input.value.trim()
        }
      });
      delete local.mcpEditorDraft;
    });
    return form;
  }
  function menuAction(iconName, label, action, danger = false) {
    const item = button(`mcp-menu__item ${danger ? "is-danger" : ""}`);
    item.append(icon(iconName, 14), el("span", "", label));
    item.addEventListener("click", (event) => {
      event.preventDefault();
      action();
    });
    return item;
  }
  function fieldInput(label, value, placeholder = "") {
    const field = el("label", "mcp-field");
    field.append(el("span", "", label));
    const input = el("input");
    input.value = value;
    input.placeholder = placeholder;
    input.autocomplete = "off";
    field.append(input);
    return { field, input };
  }
  function fieldTextarea(label, value, placeholder = "") {
    const field = el("label", "mcp-field");
    field.append(el("span", "", label));
    const input = el("textarea");
    input.value = value;
    input.placeholder = placeholder;
    input.spellcheck = false;
    field.append(input);
    return { field, input };
  }
  function fieldSelect(label, value, options) {
    const field = el("label", "mcp-field");
    field.append(el("span", "", label));
    const input = el("select");
    for (const option of options) {
      const item = el("option");
      item.value = option.value;
      item.textContent = option.label;
      item.selected = option.value === value;
      input.append(item);
    }
    field.append(input);
    return { field, input };
  }
  function emptyDraft() {
    return { name: "", transport: "stdio", target: "", scope: "project", providers: [], argsText: "", envText: "", headersText: "" };
  }
  function providerName(id) {
    return PROVIDERS2.find((entry) => entry.id === id)?.label ?? id;
  }
  function mapToLines(value) {
    return Object.entries(value ?? {}).map(([key, item]) => `${key}=${item}`).join("\n");
  }
  function parseMapLines(value) {
    return Object.fromEntries(value.split(/\r?\n/).map((line) => {
      const index = line.indexOf("=");
      return index > 0 ? [line.slice(0, index).trim(), line.slice(index + 1)] : ["", ""];
    }).filter(([key]) => key));
  }

  // src/services/automation-scheduler.ts
  var MAX_TIMER_MS = 6 * 60 * 60 * 1e3;
  var DAY_NAMES = ["domenica", "luned\xEC", "marted\xEC", "mercoled\xEC", "gioved\xEC", "venerd\xEC", "sabato"];
  function describeSchedule(schedule) {
    const period = schedule.activeFrom || schedule.activeTo ? ` \xB7 periodo ${schedule.activeFrom ? shortDate(schedule.activeFrom) : "subito"}\u2013${schedule.activeTo ? shortDate(schedule.activeTo) : "senza fine"}` : "";
    if (schedule.kind === "interval") return `Ogni ${schedule.everyMinutes} minuti${period}`;
    if (schedule.kind === "daily") return `Ogni giorno alle ${schedule.time}${period}`;
    if (schedule.kind === "once") return `Una volta il ${new Date(schedule.at).toLocaleString("it-IT")}${period}`;
    const days = schedule.days.map((day) => DAY_NAMES[day]).filter(Boolean);
    return `Ogni ${joinNatural(days)} alle ${schedule.time}${period}`;
  }
  function joinNatural(values) {
    return values.length <= 1 ? values[0] ?? "" : `${values.slice(0, -1).join(", ")} e ${values.at(-1)}`;
  }
  function shortDate(value) {
    return new Date(value).toLocaleDateString("it-IT");
  }

  // src/ui/screens/automations.ts
  var DAY_LABELS = ["D", "L", "M", "M", "G", "V", "S"];
  function renderAutomations(runtime2) {
    const state = runtime2.state;
    const local = runtime2;
    const page = el("section", "content-page automations-page");
    const header = el("header", "page-header automations-header");
    const copy = el("div");
    copy.append(el("span", "eyebrow", "Scheduler locale"), el("h1", "", "Automazioni"));
    copy.append(el("p", "", "Task programmati che usano provider, agenti e permessi Relay. Girano quando l\u2019editor \xE8 aperto; i risultati restano leggibili anche dal telefono."));
    const add = button("button button--primary");
    add.append(icon("plus", 15), el("span", "", "Nuova automazione"));
    add.addEventListener("click", () => {
      local.automationDraft = emptyDraft2(state.workspace.id);
      runtime2.render();
    });
    header.append(copy, add);
    page.append(header);
    if (!state.automations.length && !local.automationDraft) page.append(onboarding(runtime2));
    if (local.automationDraft) page.append(renderEditor(runtime2, local.automationDraft));
    const list = el("div", "automation-list");
    for (const automation of state.automations) list.append(renderCard(runtime2, automation));
    page.append(list);
    return page;
  }
  function onboarding(runtime2) {
    const card = el("section", "automation-onboarding");
    const copy = el("div");
    copy.append(icon("workflow", 28), el("h2", "", "Programma Relay"), el("p", "", "Report mattutini, check periodici e task ricorrenti. L\u2019editor deve restare aperto; con Relay Remoto controlli i risultati dal telefono."));
    card.append(copy);
    const templates = el("div", "automation-templates");
    templates.append(templateButton(runtime2, "Riepilogo giornaliero del repo", "Analizza le modifiche recenti del repository, segnala rischi e prepara un riepilogo operativo.", { kind: "daily", time: "09:00" }));
    templates.append(templateButton(runtime2, "Controlla i TODO ogni ora", "Cerca TODO e FIXME nel progetto, raggruppali per priorit\xE0 e segnala quelli nuovi o bloccanti.", { kind: "interval", everyMinutes: 60 }));
    card.append(templates);
    return card;
  }
  function templateButton(runtime2, name, prompt, schedule) {
    const control = button("automation-template");
    control.append(el("strong", "", name), el("span", "", describeSchedule(schedule)));
    control.addEventListener("click", () => {
      runtime2.automationDraft = { ...emptyDraft2(runtime2.state.workspace.id), name, prompt, schedule };
      runtime2.render();
    });
    return control;
  }
  function renderCard(runtime2, automation) {
    const local = runtime2;
    const card = el("article", `automation-card ${automation.enabled ? "" : "is-disabled"}`);
    const top = el("div", "automation-card__top");
    const copy = el("div", "automation-card__copy");
    copy.append(el("strong", "", automation.name), el("span", "", describeSchedule(automation.schedule)));
    const meta = el("div", "automation-card__meta");
    const provider = automation.agentId ? runtime2.state.agents.find((agent) => agent.id === automation.agentId)?.name ?? "Agente" : providerLabel(automation.provider ?? runtime2.state.preferences.defaultProvider);
    meta.append(el("span", "automation-badge", provider));
    if (automation.nextRunAt && automation.enabled) meta.append(el("span", "automation-badge", `Prossima ${formatRelativeFuture(automation.nextRunAt)}`));
    if (automation.lastRun) meta.append(el("span", `automation-outcome is-${automation.lastRun.outcome}`, lastOutcome(automation)));
    copy.append(meta);
    const toggle = el("label", "automation-toggle");
    const input = el("input");
    input.type = "checkbox";
    input.checked = automation.enabled;
    input.addEventListener("change", () => runtime2.post({ type: "toggleAutomation", payload: { id: automation.id, enabled: input.checked } }));
    toggle.append(input, el("span"));
    top.append(copy, toggle);
    const actions = el("div", "automation-card__actions");
    const run = button("button button--primary button--small");
    run.append(icon("arrowUp", 14), el("span", "", "Esegui ora"));
    run.addEventListener("click", () => runtime2.post({ type: "runAutomationNow", payload: { id: automation.id } }));
    const menu = el("details", "automation-menu");
    const summary = el("summary");
    summary.append(icon("more", 16));
    const popover = el("div", "automation-menu__popover");
    popover.append(menuAction2("edit", "Modifica", () => {
      local.automationDraft = structuredClone(automation);
      runtime2.render();
    }));
    popover.append(menuAction2("copy", "Duplica", () => runtime2.post({ type: "duplicateAutomation", payload: { id: automation.id } })));
    popover.append(menuAction2("trash", "Elimina", () => {
      if (local.confirmAutomationDelete === automation.id) runtime2.post({ type: "deleteAutomation", payload: { id: automation.id } });
      else {
        local.confirmAutomationDelete = automation.id;
        runtime2.render();
      }
    }, true, local.confirmAutomationDelete === automation.id ? "Conferma elimina" : "Elimina"));
    menu.append(summary, popover);
    actions.append(run, menu);
    card.append(top, actions);
    if (automation.lastRun?.detail) card.append(el("div", "automation-card__detail", automation.lastRun.detail));
    return card;
  }
  function renderEditor(runtime2, draft) {
    const local = runtime2;
    const form = el("form", "automation-editor");
    const header = el("header", "automation-editor__header");
    const copy = el("div");
    copy.append(el("span", "eyebrow", draft.id ? "Modifica" : "Nuova"), el("strong", "", draft.name || "Automazione"));
    const close = iconButton("close", "Chiudi");
    close.addEventListener("click", () => {
      delete local.automationDraft;
      runtime2.render();
    });
    header.append(copy, close);
    form.append(header);
    const name = inputField("Nome", draft.name ?? "", "es. Report mattutino");
    const prompt = textareaField("Prompt", draft.prompt ?? "", 'Descrivi il task. Puoi usare @provider, @"Nome agente", @file[\u2026] e @dir[\u2026].');
    form.append(name.field, prompt.field);
    const execution = el("div", "automation-editor__grid");
    const project = selectField2("Progetto", draft.projectId ?? "", [{ value: "", label: "Progetto aperto al momento" }, ...runtime2.state.projects.map((item) => ({ value: item.id, label: item.name }))]);
    const provider = selectField2("Provider", draft.provider ?? "", [{ value: "", label: "Predefinito Relay" }, ...runtime2.state.providers.filter((item) => item.available).map((item) => ({ value: item.id, label: item.label }))]);
    const agent = selectField2("Agente", draft.agentId ?? "", [{ value: "", label: "Nessun agente" }, ...runtime2.state.agents.filter((item) => item.enabled).map((item) => ({ value: item.id, label: item.name }))]);
    const permission = selectField2("Permessi", draft.permission ?? "workspace-write", [
      { value: "read-only", label: "Sola lettura" },
      { value: "workspace-write", label: "Workspace" },
      { value: "danger-full-access", label: "Accesso completo" }
    ]);
    const delegation = selectField2("Deleghe", draft.delegationPolicy ?? "confirm", [
      { value: "confirm", label: "Conferma" },
      { value: "automatic", label: "Automatiche" },
      { value: "disabled", label: "Disabilitate" }
    ]);
    execution.append(project.field, provider.field, agent.field, permission.field, delegation.field);
    form.append(execution);
    const scheduleBox = el("section", "automation-schedule");
    scheduleBox.append(el("strong", "", "Pianificazione"));
    const current = normalizeDraftSchedule(draft.schedule);
    const kinds = el("div", "automation-kind-chips");
    for (const item of [{ id: "interval", label: "Intervallo" }, { id: "daily", label: "Giornaliera" }, { id: "weekly", label: "Settimanale" }, { id: "once", label: "Una volta" }]) {
      const control = button(`automation-kind ${current.kind === item.id ? "is-active" : ""}`, item.label);
      control.addEventListener("click", () => {
        draft.schedule = defaultSchedule(item.id);
        runtime2.render();
      });
      kinds.append(control);
    }
    scheduleBox.append(kinds);
    const scheduleInputs = el("div", "automation-schedule__inputs");
    if (current.kind === "interval") scheduleInputs.append(numberField("Ogni minuti", current.everyMinutes, 5).field);
    if (current.kind === "daily" || current.kind === "weekly") scheduleInputs.append(timeField("Orario", current.time).field);
    if (current.kind === "weekly") {
      const days = el("div", "automation-days");
      const selected = new Set(current.days);
      DAY_LABELS.forEach((label, index) => {
        const control = button(`automation-day ${selected.has(index) ? "is-active" : ""}`, label);
        control.dataset.day = String(index);
        control.addEventListener("click", () => {
          control.classList.toggle("is-active");
          updateSchedulePreview();
        });
        days.append(control);
      });
      scheduleInputs.append(days);
    }
    if (current.kind === "once") scheduleInputs.append(datetimeField("Data e ora", isoForInput(current.at)).field);
    const activeFrom = datetimeField("Valida da", current.activeFrom ? isoForInput(current.activeFrom) : "");
    const activeTo = datetimeField("Valida fino a", current.activeTo ? isoForInput(current.activeTo) : "");
    scheduleInputs.append(activeFrom.field, activeTo.field);
    const preview = el("div", "automation-schedule__preview", describeSchedule(current));
    const updateSchedulePreview = () => {
      try {
        preview.textContent = describeSchedule(collectSchedule(form, current.kind));
        preview.classList.remove("is-invalid");
      } catch {
        preview.textContent = "Completa data, ora e periodo per vedere la pianificazione.";
        preview.classList.add("is-invalid");
      }
    };
    for (const input of scheduleInputs.querySelectorAll("input")) {
      input.addEventListener("input", updateSchedulePreview);
      input.addEventListener("change", updateSchedulePreview);
    }
    scheduleBox.append(scheduleInputs, preview);
    form.append(scheduleBox);
    const missed = selectField2("Se l\u2019editor era chiuso", draft.missedPolicy ?? "skip", [
      { value: "skip", label: "Salta e riallinea (predefinito)" },
      { value: "catchUpOnce", label: "Recupera una volta alla riapertura" }
    ]);
    form.append(missed.field, el("p", "automation-honesty", "Le automazioni girano solo quando l\u2019editor con Relay \xE8 aperto. Nessun servizio di sistema viene installato."));
    const footer = el("footer", "automation-editor__footer");
    const save = button("button button--primary", "Salva automazione");
    save.type = "submit";
    footer.append(save);
    form.append(footer);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const schedule = collectSchedule(form, current.kind);
      runtime2.post({ type: "saveAutomation", payload: {
        ...draft.id ? { id: draft.id } : {},
        name: name.input.value,
        prompt: prompt.input.value,
        projectId: project.input.value || null,
        provider: provider.input.value || void 0,
        agentId: agent.input.value || void 0,
        permission: permission.input.value,
        delegationPolicy: delegation.input.value,
        schedule,
        enabled: draft.enabled !== false,
        missedPolicy: missed.input.value
      } });
      delete local.automationDraft;
    });
    return form;
  }
  function collectSchedule(form, kind) {
    const value = (name) => form.querySelector(`[name="${name}"]`)?.value ?? "";
    const activeFrom = value("activeFrom") ? new Date(value("activeFrom")).toISOString() : void 0;
    const activeTo = value("activeTo") ? new Date(value("activeTo")).toISOString() : void 0;
    const period = { ...activeFrom ? { activeFrom } : {}, ...activeTo ? { activeTo } : {} };
    if (kind === "interval") return { kind, everyMinutes: Math.max(5, Number(value("everyMinutes")) || 5), ...period };
    if (kind === "daily") return { kind, time: value("time") || "09:00", ...period };
    if (kind === "weekly") return { kind, days: [...form.querySelectorAll(".automation-day.is-active")].map((node) => Number(node.dataset.day)), time: value("time") || "09:00", ...period };
    return { kind, at: new Date(value("onceAt")).toISOString(), ...period };
  }
  function emptyDraft2(projectId) {
    return { name: "", prompt: "", projectId, permission: "workspace-write", delegationPolicy: "confirm", schedule: { kind: "daily", time: "09:00" }, enabled: true, missedPolicy: "skip" };
  }
  function normalizeDraftSchedule(value) {
    return value ?? { kind: "daily", time: "09:00" };
  }
  function defaultSchedule(kind) {
    if (kind === "interval") return { kind, everyMinutes: 60 };
    if (kind === "weekly") return { kind, days: [1], time: "09:00" };
    if (kind === "once") return { kind, at: new Date(Date.now() + 60 * 6e4).toISOString() };
    return { kind: "daily", time: "09:00" };
  }
  function lastOutcome(item) {
    const run = item.lastRun;
    return run.outcome === "ok" ? `\u2713 ${formatRelativeTime(run.at)}` : run.outcome === "error" ? `Errore ${formatRelativeTime(run.at)}` : `Saltata ${formatRelativeTime(run.at)}`;
  }
  function formatRelativeFuture(value) {
    const ms = new Date(value).getTime() - Date.now();
    if (ms <= 0) return "ora";
    const minutes = Math.ceil(ms / 6e4);
    if (minutes < 60) return `tra ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `tra ${hours}h${rest ? ` ${rest}m` : ""}`;
  }
  function isoForInput(value) {
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 6e4);
    return local.toISOString().slice(0, 16);
  }
  function menuAction2(iconName, label, handler, danger = false, override) {
    const control = button(`automation-menu__item ${danger ? "is-danger" : ""}`);
    control.append(icon(iconName, 14), el("span", "", override ?? label));
    control.addEventListener("click", handler);
    return control;
  }
  function inputField(label, value, placeholder = "") {
    const field = el("label", "automation-field");
    field.append(el("span", "", label));
    const input = el("input");
    input.value = value;
    input.placeholder = placeholder;
    field.append(input);
    return { field, input };
  }
  function textareaField(label, value, placeholder = "") {
    const field = el("label", "automation-field automation-field--wide");
    field.append(el("span", "", label));
    const input = el("textarea");
    input.value = value;
    input.placeholder = placeholder;
    input.rows = 6;
    field.append(input);
    return { field, input };
  }
  function selectField2(label, value, options) {
    const field = el("label", "automation-field");
    field.append(el("span", "", label));
    const input = select(value, options);
    field.append(input);
    return { field, input };
  }
  function numberField(label, value, min) {
    const result = inputField(label, String(value));
    result.input.type = "number";
    result.input.min = String(min);
    result.input.name = "everyMinutes";
    return result;
  }
  function timeField(label, value) {
    const result = inputField(label, value);
    result.input.type = "time";
    result.input.name = "time";
    return result;
  }
  function datetimeField(label, value) {
    const result = inputField(label, value);
    result.input.type = "datetime-local";
    result.input.name = label === "Valida da" ? "activeFrom" : label === "Valida fino a" ? "activeTo" : "onceAt";
    return result;
  }

  // src/ui/screens/settings.ts
  function renderSettings(runtime2) {
    const state = runtime2.state;
    const page = el("section", "content-page");
    const header = el("header", "page-header");
    const copy = el("div");
    copy.append(el("span", "eyebrow", "Preferences"));
    copy.append(el("h1", "", "Impostazioni"));
    copy.append(el("p", "", "Default coerenti, senza toglierti libert\xE0 nella singola chat."));
    header.append(copy);
    page.append(header);
    const general = accordionSection(runtime2, "settings:general", "Generali", "Comportamento predefinito delle nuove conversazioni.");
    const generalGrid = el("div", "settings-grid");
    const defaultProvider = select(state.preferences.defaultProvider, state.providers.map((provider) => ({
      value: provider.id,
      label: provider.label,
      disabled: !provider.available
    })), "premium-select");
    defaultProvider.addEventListener("change", () => runtime2.post({ type: "updatePreferences", payload: { defaultProvider: defaultProvider.value } }));
    generalGrid.append(settingField("Agente iniziale", "Usato quando crei una nuova chat.", wrapSelect2(defaultProvider)));
    const permissions = Object.values(state.preferences.providerDefaults).map((entry) => entry.permission);
    const commonPermission = permissions.every((entry) => entry === permissions[0]) ? permissions[0] : "mixed";
    const defaultPermission = select(commonPermission, [
      { value: "mixed", label: "Personalizzato per provider", disabled: true },
      { value: "read-only", label: "Sola lettura" },
      { value: "workspace-write", label: "Workspace" },
      { value: "danger-full-access", label: "Accesso completo" }
    ], "premium-select");
    defaultPermission.addEventListener("change", () => {
      if (defaultPermission.value === "mixed") return;
      runtime2.post({ type: "updateAllProviderPermissions", payload: { permission: defaultPermission.value } });
    });
    generalGrid.append(settingField(
      "Accesso iniziale globale",
      "Imposta in un colpo solo il permesso predefinito delle nuove chat per tutti i provider.",
      wrapSelect2(defaultPermission)
    ));
    const delegation = select(state.preferences.delegationPolicy, [
      { value: "confirm", label: "Chiedi conferma" },
      { value: "automatic", label: "Automatica" },
      { value: "disabled", label: "Disabilitata" }
    ], "premium-select");
    delegation.addEventListener("change", () => runtime2.post({ type: "updatePreferences", payload: { delegationPolicy: delegation.value } }));
    generalGrid.append(settingField("Deleghe", "Policy iniziale; potr\xE0 essere cambiata dalla chat.", wrapSelect2(delegation)));
    const exposeUsage = switchControl(
      state.preferences.exposeUsageToAgents,
      (checked) => runtime2.post({ type: "updatePreferences", payload: { exposeUsageToAgents: checked } })
    );
    generalGrid.append(settingField(
      "Quote nel contesto agente",
      "Condivide disponibilit\xE0 e reset dei provider per decisioni di delega pi\xF9 responsabili.",
      exposeUsage
    ));
    const privacyTools = el("div", "privacy-shield-tools");
    if (state.privacyShieldSetup.provisioned) {
      privacyTools.append(switchControl(
        state.preferences.privacyShield,
        (checked) => runtime2.post({ type: "updatePreferences", payload: { privacyShield: checked } })
      ));
    } else {
      const privacyEnable = button(
        "button button--primary button--small",
        state.privacyShieldSetup.phase === "checking" ? "Verifica in corso\u2026" : "Abilita"
      );
      privacyEnable.disabled = state.privacyShieldSetup.phase === "checking";
      privacyEnable.addEventListener("click", () => runtime2.post({ type: "enablePrivacyShield" }));
      privacyTools.append(privacyEnable);
      if (state.privacyShieldSetup.detail) {
        privacyTools.append(el("span", `privacy-shield-status is-${state.privacyShieldSetup.phase}`, state.privacyShieldSetup.detail));
      }
    }
    generalGrid.append(settingField(
      "Privacy Shield",
      "Anonimizza localmente il testo prima che lasci Relay.",
      privacyTools
    ));
    const warning = select(String(Math.round(state.preferences.quotaWarningThreshold * 100)), [
      { value: "20", label: "20%" },
      { value: "25", label: "25%" },
      { value: "35", label: "35%" },
      { value: "50", label: "50%" }
    ], "premium-select");
    warning.addEventListener("change", () => runtime2.post({ type: "updatePreferences", payload: { quotaWarningThreshold: Number(warning.value) / 100 } }));
    generalGrid.append(settingField("Soglia quota bassa", "Segnala al modello quando \xE8 preferibile preservare il provider.", wrapSelect2(warning)));
    const critical = select(String(Math.round(state.preferences.quotaCriticalThreshold * 100)), [
      { value: "5", label: "5%" },
      { value: "10", label: "10%" },
      { value: "15", label: "15%" },
      { value: "20", label: "20%" }
    ], "premium-select");
    critical.addEventListener("change", () => runtime2.post({ type: "updatePreferences", payload: { quotaCriticalThreshold: Number(critical.value) / 100 } }));
    generalGrid.append(settingField("Soglia critica", "Richiede particolare cautela prima di avviare task costosi.", wrapSelect2(critical)));
    general.body.append(generalGrid);
    page.append(general.section);
    const providerSection = accordionSection(runtime2, "settings:providers", "Provider e deleghe", "Default delle chat e modello usato quando Relay assegna una delega.");
    const list = el("div", "agent-settings-list");
    for (const provider of state.providers) {
      const defaults = state.preferences.providerDefaults[provider.id];
      const expandKey = `settings:provider:${provider.id}`;
      const isExpanded = runtime2.expandedPanels.has(expandKey);
      const row = el("details", `agent-settings-row agent-settings-row--collapsible is-health-${provider.healthState ?? (provider.available ? "ready" : "unavailable")} ${provider.connected === false ? "is-disconnected" : provider.available ? "is-connected" : "is-unavailable"}`);
      row.open = isExpanded;
      row.addEventListener("toggle", () => {
        if (row.open) runtime2.expandedPanels.add(expandKey);
        else runtime2.expandedPanels.delete(expandKey);
      });
      const rowSummary = el("summary", "agent-settings-summary");
      const identity = el("div", "agent-settings-identity");
      identity.append(providerGlyph(provider.id));
      const idCopy = el("div");
      const cliMissing = provider.id === "antigravity" && provider.nativeBridgeAvailable && provider.cliAvailable === false;
      idCopy.append(el("strong", "", provider.label));
      const providerStatus = provider.connected === false ? "Scollegato da Relay \xB7 account e CLI invariati" : provider.setupProgress ?? (cliMissing ? "Bridge IDE pronto \xB7 AGY CLI da installare" : providerHealthLabel(provider.healthState, provider.version));
      idCopy.append(el("span", provider.setupError ? "provider-setup-error" : "", providerStatus));
      if (provider.setupError) idCopy.append(el("small", "provider-setup-error__detail", provider.setupError));
      identity.append(idCopy);
      const authUnknown = provider.id === "copilot" && provider.available && provider.authenticated === void 0;
      if (provider.connected === false) {
        const reconnect = button("button button--primary button--small agent-install-button");
        reconnect.append(icon("workflow", 14), el("span", "", "Ricollega"));
        reconnect.title = "Rende nuovamente disponibile il provider dentro Relay senza eseguire login.";
        reconnect.addEventListener("click", () => runtime2.post({ type: "connectProvider", payload: { provider: provider.id } }));
        identity.append(reconnect);
      } else if (provider.setupInProgress || provider.setupError || cliMissing || !provider.available || provider.authenticated === false || authUnknown) {
        const setup = button("button button--secondary button--small agent-install-button");
        const installing = cliMissing || !provider.available;
        setup.disabled = Boolean(provider.setupInProgress);
        const label = provider.setupInProgress ? "In corso\u2026" : provider.setupError ? "Riprova" : installing ? "Installa CLI" : authUnknown ? "Gestisci accesso" : "Accedi";
        setup.append(icon(provider.setupInProgress ? "refresh" : installing ? "import" : "arrowUp", 14), el("span", "", label));
        setup.addEventListener("click", () => runtime2.post({
          type: installing ? "installProvider" : "openProviderSetup",
          payload: { provider: provider.id }
        }));
        identity.append(setup);
      }
      const summaryTools = el("div", "provider-summary-tools");
      if (provider.available && provider.connected !== false) {
        const upgrade = button("provider-icon-action");
        upgrade.append(icon("refresh", 15));
        upgrade.setAttribute("aria-label", `Aggiorna ${provider.label}`);
        upgrade.title = `Aggiorna ${provider.label}`;
        upgrade.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          runtime2.post({ type: "upgradeProvider", payload: { provider: provider.id } });
        });
        const disconnect = button("provider-icon-action provider-icon-action--danger");
        disconnect.append(icon("close", 15));
        disconnect.setAttribute("aria-label", `Scollega ${provider.label}`);
        disconnect.title = `Scollega ${provider.label} solo da Relay`;
        disconnect.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          runtime2.post({ type: "disconnectProvider", payload: { provider: provider.id } });
        });
        summaryTools.append(upgrade, disconnect);
      }
      summaryTools.append(icon("chevronDown", 14));
      rowSummary.append(identity, summaryTools);
      row.append(rowSummary);
      const controls = el("div", "agent-settings-controls");
      controls.append(renderProviderHealth(provider));
      const visibleModels = provider.models.filter((entry) => entry.id !== "auto" && !entry.hidden);
      const model = select(defaults.model, [
        { value: "auto", label: "Automatico del provider" },
        ...visibleModels.map((entry) => ({ value: entry.id, label: entry.label }))
      ], "premium-select");
      const selected = provider.models.find((entry) => entry.id === model.value) ?? provider.models.find((entry) => entry.isDefault);
      const reasoning = select(defaults.reasoning, [
        { value: "auto", label: "Automatico" },
        ...(selected?.reasoning ?? []).map((entry) => ({ value: entry.id, label: entry.label }))
      ], "premium-select");
      const permission = select(defaults.permission, [
        { value: "read-only", label: "Sola lettura" },
        { value: "workspace-write", label: "Workspace" },
        { value: "danger-full-access", label: "Accesso completo" }
      ], "premium-select");
      const delegationValue = defaults.delegationModel === "relay-auto" || defaults.delegationModel === "auto" || visibleModels.some((entry) => entry.id === defaults.delegationModel) ? defaults.delegationModel : "relay-auto";
      const delegationModel = select(delegationValue, [
        { value: "relay-auto", label: "Relay sceglie per ogni task" },
        { value: "auto", label: "Automatico del provider" },
        ...visibleModels.map((entry) => ({ value: entry.id, label: entry.label }))
      ], "premium-select");
      const providerControlsDisabled = provider.connected === false;
      model.disabled = providerControlsDisabled;
      reasoning.disabled = providerControlsDisabled || (selected?.reasoning.length ?? 0) === 0;
      permission.disabled = providerControlsDisabled;
      delegationModel.disabled = providerControlsDisabled;
      model.addEventListener("change", () => runtime2.post({ type: "updateProviderDefaults", payload: { provider: provider.id, model: model.value, reasoning: "auto" } }));
      reasoning.addEventListener("change", () => runtime2.post({ type: "updateProviderDefaults", payload: { provider: provider.id, reasoning: reasoning.value } }));
      permission.addEventListener("change", () => runtime2.post({ type: "updateProviderDefaults", payload: { provider: provider.id, permission: permission.value } }));
      delegationModel.addEventListener("change", () => runtime2.post({ type: "updateProviderDefaults", payload: { provider: provider.id, delegationModel: delegationModel.value } }));
      controls.append(
        providerControlField("Chat", "Modello predefinito", model),
        providerControlField("Thinking", "Per le nuove chat", reasoning),
        providerControlField("Accesso", "Permessi iniziali", permission),
        providerControlField("Deleghe", delegationValue === "relay-auto" ? "Scelta intelligente per task" : "Modello fissato", delegationModel)
      );
      if (provider.connected !== false && provider.healthState !== "ready" && provider.healthState !== "detecting") {
        const recovery = el("div", "provider-recovery-actions");
        const retry = button("button button--secondary button--small");
        retry.append(icon("refresh", 13), el("span", "", "Riprova"));
        retry.addEventListener("click", () => runtime2.post({ type: "refreshProviders" }));
        const copyDiagnostics = button("button button--ghost button--small");
        copyDiagnostics.append(icon("copy", 13), el("span", "", "Copia diagnostica"));
        copyDiagnostics.addEventListener("click", () => runtime2.post({ type: "copyProviderDiagnostics", payload: { provider: provider.id } }));
        const recover = button("button button--primary button--small");
        recover.append(icon("sparkle", 13), el("span", "", "Ripara con altro agente"));
        recover.addEventListener("click", () => runtime2.post({ type: "recoverProvider", payload: { provider: provider.id } }));
        const config = button("button button--ghost button--small");
        config.append(icon("settings", 13), el("span", "", "Configura percorso"));
        config.addEventListener("click", () => runtime2.post({ type: "openSettings" }));
        const logs = button("button button--ghost button--small");
        logs.append(icon("diagnostics", 13), el("span", "", "Apri log"));
        logs.addEventListener("click", () => runtime2.setSection("diagnostics"));
        recovery.append(retry, copyDiagnostics, recover, config, logs);
        controls.append(recovery);
      }
      row.append(controls);
      list.append(row);
    }
    providerSection.body.append(list);
    providerSection.body.append(el("p", "provider-defaults-note", 'Con "Relay sceglie per ogni task" il modello viene deciso usando complessit\xE0, capacit\xE0 dichiarate e quota disponibile. Una scelta esplicita blocca quel provider sul modello indicato solo nelle deleghe.'));
    page.append(providerSection.section);
    const advanced = accordionSection(runtime2, "settings:environment", "Ambiente locale", "Controlli essenziali e percorsi avanzati.", true);
    const doctor = el("button", "system-doctor-card");
    doctor.type = "button";
    const doctorIcon = el("span", "system-doctor-card__icon");
    doctorIcon.append(icon("diagnostics", 17));
    const doctorCopy = el("span", "system-doctor-card__copy");
    doctorCopy.append(el("strong", "", "System Doctor"));
    doctorCopy.append(el("small", "", "Verifica CLI, accessi, Git e quote"));
    const ready = state.providers.filter((provider) => provider.available && provider.authenticated !== false).length;
    const doctorMeta = el("span", "system-doctor-card__meta");
    doctorMeta.append(el("span", "system-doctor-card__status", `${ready}/${state.providers.length} agenti`));
    doctorMeta.append(icon("arrowUp", 14));
    doctor.append(doctorIcon, doctorCopy, doctorMeta);
    doctor.addEventListener("click", () => runtime2.post({ type: "runSystemDoctor" }));
    advanced.body.append(doctor);
    const note = button("advanced-settings-link");
    note.append(icon("settings", 14), el("span", "", "Percorsi CLI e worktree"), icon("arrowUp", 13));
    note.addEventListener("click", () => runtime2.post({ type: "openSettings" }));
    advanced.body.append(note);
    page.append(advanced.section);
    const data = accordionSection(runtime2, "settings:data", "Dati e ripristino", "Backup portabile e cancellazione protetta dei dati locali di Relay.", true);
    const dataActions = el("div", "settings-data-actions");
    const exportButton = button("button button--secondary");
    exportButton.append(icon("external", 15), el("span", "", "Esporta backup"));
    exportButton.addEventListener("click", () => runtime2.post({ type: "exportBackup" }));
    const importButton = button("button button--secondary");
    importButton.append(icon("import", 15), el("span", "", "Ripristina backup"));
    importButton.addEventListener("click", () => runtime2.post({ type: "importBackup" }));
    const resetButton = button("button button--danger-ghost");
    resetButton.append(icon("trash", 15), el("span", "", "Cancella dati Relay"));
    resetButton.addEventListener("click", () => runtime2.post({ type: "resetAllData" }));
    dataActions.append(exportButton, importButton, resetButton);
    data.body.append(dataActions);
    data.body.append(el("p", "settings-data-note", "Il reset non rimuove le CLI installate, i file dei progetti o i worktree. La conferma richiede due passaggi."));
    page.append(data.section);
    return page;
  }
  function providerHealthLabel(state, version) {
    if (state === "detecting") return "Rilevamento in corso\u2026";
    if (state === "ready") return `Pronto \xB7 ${compactProviderVersion(version)}`;
    if (state === "launchable") return "CLI avviabile \xB7 controlli in corso";
    if (state === "installed") return "Installato \xB7 avvio da verificare";
    if (state === "needs-login") return "Accesso richiesto";
    if (state === "rate-limited") return "Rate limit attivo";
    if (state === "degraded") return "Degradato \xB7 apri i dettagli";
    if (state === "not-installed") return "CLI non rilevata";
    if (state === "disconnected") return "Scollegato da Relay";
    return "Non operativo";
  }
  function renderProviderHealth(provider) {
    const panel = el("section", "provider-health-panel");
    const probes = new Map((provider.probes ?? []).map((probe) => [probe.id, probe]));
    const row = (label, value, ok, detail) => {
      const item = el("div", `provider-health-row ${ok === true ? "is-ok" : ok === false ? "is-error" : "is-pending"}`);
      item.append(el("strong", "", label), el("span", "", value));
      if (detail) item.title = detail;
      return item;
    };
    const resolve = probes.get("resolve");
    const launch = probes.get("launch");
    const auth = probes.get("authentication");
    const models = probes.get("models");
    panel.append(
      row("CLI", resolve?.ok ? "Rilevata" : provider.healthState === "detecting" ? "Rilevamento\u2026" : "Non rilevata", resolve?.ok, resolve?.detail),
      row("Avvio", launch?.ok ? "OK" : provider.healthState === "detecting" ? "In corso" : "Errore", launch?.ok, launch?.detail),
      row("Account", auth?.ok ? "Connesso" : provider.authenticated === false ? "Accesso richiesto" : "Non verificato", auth?.ok, auth?.detail),
      row("Modelli", models?.ok ? `${provider.models.length} disponibili` : provider.healthState === "detecting" ? "Caricamento\u2026" : "Non caricati", models?.ok, models?.detail),
      row("Operativit\xE0", provider.healthState === "ready" ? "Pronto" : providerHealthLabel(provider.healthState), provider.healthState === "ready", provider.failure?.technicalDetail ?? provider.detail)
    );
    if (provider.detail || provider.failure?.message) panel.append(el("p", "provider-health-reason", provider.failure?.message ?? provider.detail));
    return panel;
  }
  function accordionSection(runtime2, key, title, description, compact = false) {
    const section = el("details", `settings-section settings-accordion ${compact ? "settings-section--compact" : ""}`);
    section.open = runtime2.expandedPanels.has(key) || !runtime2.expandedPanels.has("settings:touched") && key === "settings:general";
    const summary = el("summary", "settings-accordion__summary");
    const copy = el("div", "settings-section__title");
    copy.append(el("h2", "", title), el("p", "", description));
    summary.append(copy, icon("chevronDown", 16));
    section.append(summary);
    const body = el("div", "settings-accordion__body");
    section.append(body);
    section.addEventListener("toggle", () => {
      runtime2.expandedPanels.add("settings:touched");
      if (section.open) runtime2.expandedPanels.add(key);
      else runtime2.expandedPanels.delete(key);
    });
    return { section, body };
  }
  function settingField(title, description, control) {
    const field = el("div", "setting-field");
    const copy = el("div");
    copy.append(el("strong", "", title), el("span", "", description));
    field.append(copy, control);
    return field;
  }
  function providerControlField(label, hint, control) {
    const field = el("label", "provider-default-field");
    const copy = el("span", "provider-default-field__copy");
    copy.append(el("strong", "", label), el("small", "", hint));
    field.append(copy, wrapSelect2(control));
    return field;
  }
  function wrapSelect2(node) {
    const wrapper = el("div", "select-shell");
    wrapper.append(node, icon("chevronDown", 15));
    return wrapper;
  }
  function switchControl(checked, onChange) {
    const label = el("label", "switch-field switch-field--standalone");
    const input = el("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    label.append(input, el("span", "switch"));
    return label;
  }

  // src/ui/screens/diagnostics.ts
  var PAGE_SIZE2 = 30;
  function renderDiagnostics(runtime2) {
    const state = runtime2.state;
    const local = runtime2;
    const page = el("section", "content-page diagnostics-page diagnostics-page--compact");
    const header = el("header", "page-header diagnostics-header");
    const copy = el("div");
    copy.append(el("span", "eyebrow", "Supporto tecnico"));
    copy.append(el("h1", "", "Diagnostica"));
    copy.append(el("p", "", "Compatibilit\xE0, stato operativo e log recenti senza sovraccaricare la schermata."));
    const actions = el("div", "diagnostics-actions diagnostics-actions--icons");
    actions.append(
      diagnosticIconAction("check", "System Doctor", () => runtime2.post({ type: "runSystemDoctor" })),
      diagnosticIconAction("diagnostics", "Apri output live", () => runtime2.post({ type: "openDiagnostics" })),
      diagnosticIconAction("copy", "Copia log", () => runtime2.post({ type: "copyDiagnostics" })),
      diagnosticIconAction("arrowUp", "Esporta diagnostica", () => runtime2.post({ type: "exportDiagnostics" }), true)
    );
    header.append(copy, actions);
    page.append(header);
    const errorCount = state.diagnostics.filter((entry) => entry.level === "error").length;
    const warningCount = state.diagnostics.filter((entry) => entry.level === "warning").length;
    const summary = el("div", "diagnostics-summary diagnostics-summary--compact");
    summary.append(summaryItem("Eventi", String(state.diagnostics.length)));
    summary.append(summaryItem("Errori", String(errorCount), errorCount ? "is-error" : ""));
    summary.append(summaryItem("Avvisi", String(warningCount), warningCount ? "is-warning" : ""));
    summary.append(summaryItem("Run", String(state.activeRuns.length)));
    page.append(summary);
    const readiness = state.systemReadiness;
    if (readiness) page.append(renderReadiness(runtime2, readiness));
    const allEntries = [...state.diagnostics].reverse();
    const limit = Math.max(PAGE_SIZE2, Number(local.diagnosticsLimit ?? PAGE_SIZE2));
    const visibleEntries = allEntries.slice(0, limit);
    const logSection = el("section", "diagnostics-log-section");
    const logHeader = el("div", "diagnostics-log-header");
    const logCopy = el("div");
    logCopy.append(el("strong", "", "Log recenti"), el("small", "", `${visibleEntries.length} di ${allEntries.length} eventi`));
    const resetPage = button("diagnostics-log-reset");
    resetPage.append(icon("refresh", 14));
    resetPage.title = "Torna agli eventi pi\xF9 recenti";
    resetPage.setAttribute("aria-label", resetPage.title);
    resetPage.addEventListener("click", () => {
      local.diagnosticsLimit = PAGE_SIZE2;
      runtime2.render();
    });
    logHeader.append(logCopy, resetPage);
    logSection.append(logHeader);
    const list = el("div", "diagnostics-list diagnostics-list--compact");
    for (const entry of visibleEntries) {
      const row = el("details", `diagnostic-entry diagnostic-entry--compact is-${entry.level}`);
      const summaryNode = el("summary", "diagnostic-entry__summary");
      const level = el("span", `diagnostic-entry__level is-${entry.level}`);
      const main = el("span", "diagnostic-entry__main");
      main.append(el("strong", "", entry.message));
      main.append(el("small", "", [entry.scope, entry.provider, entry.runId ? `run ${entry.runId.slice(0, 8)}` : "", formatClock(entry.timestamp ?? entry.createdAt ?? (/* @__PURE__ */ new Date()).toISOString())].filter(Boolean).join(" \xB7 ")));
      summaryNode.append(level, main, icon("chevronDown", 13));
      row.append(summaryNode);
      if (entry.detail) row.append(el("pre", "diagnostic-entry__detail", entry.detail));
      list.append(row);
    }
    if (!allEntries.length) list.append(el("div", "empty-panel", "Nessun evento diagnostico registrato in questa sessione."));
    logSection.append(list);
    if (visibleEntries.length < allEntries.length) {
      const more = button("button button--secondary diagnostics-load-more", `Carica altri ${Math.min(PAGE_SIZE2, allEntries.length - visibleEntries.length)}`);
      more.addEventListener("click", () => {
        local.diagnosticsLimit = limit + PAGE_SIZE2;
        runtime2.render();
      });
      logSection.append(more);
    }
    page.append(logSection);
    return page;
  }
  function diagnosticIconAction(name, label, handler, primary = false) {
    const node = button(`diagnostics-icon-action ${primary ? "is-primary" : ""}`.trim());
    node.append(icon(name, 16));
    node.title = label;
    node.setAttribute("aria-label", label);
    node.addEventListener("click", handler);
    return node;
  }
  function summaryItem(label, value, className = "") {
    const item = el("div", `diagnostics-summary__item ${className}`.trim());
    item.append(el("strong", "", value), el("span", "", label));
    return item;
  }
  function renderReadiness(runtime2, readiness) {
    const section = el("details", "readiness-panel readiness-panel--compact");
    section.open = runtime2.expandedPanels.has("diagnostics:readiness");
    section.addEventListener("toggle", () => {
      if (section.open) runtime2.expandedPanels.add("diagnostics:readiness");
      else runtime2.expandedPanels.delete("diagnostics:readiness");
    });
    const summary = el("summary", "readiness-panel__summary");
    const summaryCopy = el("div");
    const components = readiness.components ?? [];
    const readyCount = components.filter((entry) => entry.state === "ready").length;
    summaryCopy.append(el("strong", "", "Componenti e compatibilit\xE0"));
    summaryCopy.append(el("small", "", `${readyCount}/${components.length} pronti \xB7 ${platformLabel(readiness.platform)} ${readiness.arch ?? ""}`));
    const summaryMeta = el("div", "readiness-panel__summary-actions");
    const refresh = button("diagnostics-icon-action");
    refresh.append(icon("refresh", 14));
    refresh.title = "Ricontrolla componenti";
    refresh.setAttribute("aria-label", refresh.title);
    refresh.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      runtime2.post({ type: "refreshSystemReadiness" });
    });
    summaryMeta.append(refresh, icon("chevronDown", 14));
    summary.append(summaryCopy, summaryMeta);
    section.append(summary);
    const body = el("div", "readiness-panel__body");
    const features = el("div", "readiness-features readiness-features--compact");
    for (const feature of Object.values(readiness.features ?? {})) {
      const item = el("div", `readiness-feature readiness-feature--compact ${feature.ready ? "is-ready" : "is-warning"}`);
      item.append(icon(feature.ready ? "check" : "warning", 14));
      const text = el("div");
      text.append(el("strong", "", feature.title ?? "Funzione"), el("small", "", feature.detail ?? ""));
      item.append(text);
      features.append(item);
    }
    body.append(features);
    const visibleIds = /* @__PURE__ */ new Set(["runtime", "git", "node", "npm", "curl", "browser", "powershell"]);
    const componentList = el("div", "readiness-components readiness-components--compact");
    for (const component of components.filter((entry) => visibleIds.has(entry.id))) {
      const row = el("div", `readiness-component readiness-component--compact is-${component.state}`);
      const status = el("span", "readiness-component__status");
      status.append(icon(component.state === "ready" ? "check" : component.state === "missing" || component.state === "outdated" ? "warning" : "minus", 13));
      const info = el("div", "readiness-component__copy");
      info.append(el("strong", "", component.label));
      info.append(el("small", "", component.version || component.detail));
      row.append(status, info);
      if ((component.state === "missing" || component.state === "outdated") && component.installable) {
        const install = button("button button--secondary button--small", component.state === "outdated" ? "Aggiorna" : "Installa");
        install.addEventListener("click", () => runtime2.post({ type: "installSystemComponent", payload: { component: component.id } }));
        row.append(install);
      } else {
        row.append(el("span", `readiness-component__badge is-${component.state}`, component.state === "ready" ? "Pronto" : component.state === "outdated" ? "Da aggiornare" : "Opzionale"));
      }
      componentList.append(row);
    }
    body.append(componentList);
    section.append(body);
    return section;
  }
  function platformLabel(value) {
    if (value === "win32") return "Windows";
    if (value === "darwin") return "macOS";
    if (value === "linux") return "Linux";
    return value || "Sistema";
  }

  // src/ui/screens/usage.ts
  function renderUsage(runtime2) {
    const state = runtime2.state;
    const page = el("section", "content-page usage-page");
    const header = el("header", "page-header page-header--compact");
    const copy = el("div");
    copy.append(el("span", "eyebrow", "Capacity"));
    copy.append(el("h1", "", "Utilizzo"));
    copy.append(el("p", "", "Finestre e reset letti dai provider locali."));
    header.append(copy);
    const refresh = button(`button button--secondary usage-refresh ${state.usageRefreshing ? "is-loading" : ""}`);
    refresh.disabled = state.usageRefreshing;
    refresh.append(icon("refresh", 15), el("span", "", state.usageRefreshing ? "Aggiornamento\u2026" : "Aggiorna"));
    refresh.addEventListener("click", () => runtime2.post({ type: "refreshUsage" }));
    header.append(refresh);
    page.append(header);
    const strip = el("div", "usage-policy-strip");
    const policyCopy = el("div");
    policyCopy.append(el("strong", "", "Uso nelle deleghe"), el("span", "", "Relay pu\xF2 considerare la capacit\xE0 residua quando sceglie provider e modelli."));
    const policySelect = select(state.preferences.quotaPolicy, [
      { value: "balanced", label: "Bilanciato" },
      { value: "preserve", label: "Preserva quota" },
      { value: "unrestricted", label: "Senza vincoli" }
    ], "premium-select");
    policySelect.addEventListener("change", () => runtime2.post({ type: "updatePreferences", payload: { quotaPolicy: policySelect.value } }));
    const shell = el("span", "select-shell");
    shell.append(policySelect, icon("chevronDown", 14));
    strip.append(policyCopy, shell);
    page.append(strip);
    const list = el("div", "capacity-list");
    for (const provider of state.providers) {
      list.append(renderCapacityCard(runtime2, provider, state.usage.find((entry) => entry.provider === provider.id)));
    }
    page.append(list);
    const footer = el("p", "capacity-footnote", "Durante un task Relay mantiene l\u2019ultimo dato valido e aggiorna la capacit\xE0 appena il provider torna libero.");
    page.append(footer);
    return page;
  }
  function renderCapacityCard(runtime2, providerStatus, usage) {
    const provider = providerStatus.id;
    const label = providerStatus.label;
    const providerPlan = providerStatus.plan;
    const version = providerStatus.version;
    const modelReference = usageModelReference2(runtime2, providerStatus);
    const displayUsage = withPreferredUsage(provider, usage, modelReference);
    const primaryBucket = preferredUsageBucket(provider, usage?.buckets, modelReference);
    const expandKey = `usage:card:${provider}`;
    const isExpanded = runtime2.expandedPanels.has(expandKey);
    const card = el("details", `capacity-card ${displayUsage?.stale ? "is-stale" : ""} capacity-card--collapsible`);
    card.open = isExpanded;
    card.addEventListener("toggle", () => {
      if (card.open) runtime2.expandedPanels.add(expandKey);
      else runtime2.expandedPanels.delete(expandKey);
    });
    const head = el("summary", "capacity-card__head");
    const identity = el("div", "capacity-card__identity");
    identity.append(providerGlyph(provider));
    const copy = el("div");
    copy.append(el("strong", "", label));
    copy.append(el("span", "", displayUsage?.plan ? displayUsage.plan : providerPlan ? `Piano ${providerPlan}` : compactVersion2(version)));
    if (displayUsage?.available && primaryBucket) copy.append(el("small", "capacity-card__reference", `Riferimento: ${usageReferenceLabel(provider, primaryBucket)}`));
    identity.append(copy);
    head.append(identity);
    const status = el("span", `capacity-card__status ${displayUsage?.available ? usageTone(displayUsage.remainingFraction) : "is-unknown"}`);
    status.textContent = displayUsage?.available ? formatUsageStatus(displayUsage) : "\u2014";
    if (primaryBucket) status.title = usageReferenceLabel(provider, primaryBucket);
    head.append(status, icon("chevronDown", 14));
    card.append(head);
    const buckets = normalizedBuckets(displayUsage);
    if (buckets.length) {
      const rows = el("div", "capacity-windows");
      for (const bucket of buckets) rows.append(renderBucket(bucket));
      card.append(rows);
      if (provider === "antigravity" && antigravityWindowCoverage(buckets) < 4) {
        const partial = el("div", "capacity-partial-warning");
        partial.append(icon("warning", 14), el("span", "", `${antigravityWindowCoverage(buckets)}/4 finestre rilevate. Relay conserva il dato valido e riprova le sorgenti locali.`));
        const retry = button("button button--ghost button--small", "Riprova");
        retry.addEventListener("click", () => runtime2.post({ type: "refreshUsage" }));
        partial.append(retry);
        card.append(partial);
      }
    } else {
      const empty = el("div", "capacity-empty");
      empty.append(el("span", "", displayUsage?.lastError || displayUsage?.detail || "Il provider non espone una quota leggibile."));
      if (provider === "antigravity" && !runtime2.state.antigravityUsageBridge.enabled) {
        const connect = button("button button--secondary button--small", "Collega utilizzo live");
        connect.addEventListener("click", () => runtime2.post({ type: "enableAntigravityUsage" }));
        empty.append(connect);
      } else if (provider === "antigravity" && runtime2.state.antigravityUsageBridge.enabled) {
        empty.append(el("small", "capacity-bridge-hint", "Bridge attivo. I dati arrivano dalla status line durante i task AGY."));
      }
      if (provider === "copilot") {
        const connected = Boolean(providerStatus.capabilities?.billingUsageConfigured);
        const connect = button("button button--secondary button--small", connected ? "Aggiorna token GitHub" : "Collega utilizzo GitHub");
        connect.addEventListener("click", () => runtime2.post({ type: "configureCopilotUsage" }));
        empty.append(connect);
      }
      card.append(empty);
    }
    const meta = el("footer", "capacity-card__meta");
    if (provider === "copilot" && providerStatus.available) card.append(renderCopilotModelAccess(providerStatus, displayUsage));
    const updated = displayUsage?.lastSuccessfulAt ?? displayUsage?.updatedAt;
    meta.append(el("span", "", updated ? `Aggiornato ${formatRelativeTime(updated)}` : "Mai aggiornato"));
    if (displayUsage?.stale) meta.append(el("span", "capacity-stale", "Ultimo dato valido"));
    else if (displayUsage?.confidence === "exact") meta.append(el("span", "", "Dati API"));
    else if (displayUsage?.confidence === "provider-reported") meta.append(el("span", "", "Dato provider"));
    card.append(meta);
    return card;
  }
  function renderBucket(bucket) {
    const row = el("div", "capacity-window");
    const title = el("div", "capacity-window__title");
    title.append(el("strong", "", bucket.group ? `${bucket.group} \xB7 ${bucket.label}` : bucket.label));
    title.append(el("span", "", formatReset(bucket.resetsAt)));
    row.append(title);
    const valueText = bucket.remainingFraction !== void 0 ? formatPercent(bucket.remainingFraction) : formatAbsoluteUsage(bucket);
    const value = el("strong", `capacity-window__value ${usageTone(bucket.remainingFraction)}`, valueText);
    row.append(value);
    if (bucket.remainingFraction !== void 0) {
      const bar = el("div", "capacity-window__bar");
      const fill = el("span", usageTone(bucket.remainingFraction));
      fill.style.width = `${Math.round(bucket.remainingFraction * 100)}%`;
      bar.append(fill);
      row.append(bar);
    } else if (bucket.used !== void 0) {
      row.append(el("div", "capacity-window__absolute", bucket.limit !== void 0 ? `${formatNumber(bucket.used)} su ${formatNumber(bucket.limit)}` : "Consumo account del mese corrente"));
    }
    return row;
  }
  function usageModelReference2(runtime2, providerStatus) {
    const state = runtime2.state;
    const activeAgent = state.conversation.agentId ? state.agents.find((agent) => agent.id === state.conversation.agentId && agent.provider === providerStatus.id) : void 0;
    const configured = activeAgent?.model ?? (state.conversation.provider === providerStatus.id ? state.conversation.model : state.preferences.providerDefaults[providerStatus.id]?.model);
    const model = providerStatus.models.find((entry) => entry.id === configured) ?? providerStatus.models.find((entry) => entry.isDefault);
    if (configured && configured !== "auto") return model?.family ?? model?.label ?? configured;
    return model?.id === "auto" ? void 0 : model?.family ?? model?.label;
  }
  function renderCopilotModelAccess(provider, usage) {
    const section = el("section", "capacity-model-access");
    const visible = provider.models.filter((model) => !model.hidden);
    const explicit = visible.filter((model) => model.id !== "auto");
    const source = String(provider.capabilities?.modelInventorySource ?? "fallback");
    const mode = String(provider.capabilities?.modelAccessMode ?? (explicit.length ? "explicit" : "auto-only"));
    const head = el("div", "capacity-model-access__head");
    head.append(el("strong", "", "Modelli utilizzabili"));
    const inventoryLabel = mode === "auto-only" ? "Solo Automatico: tipico di Copilot Free/Student o di una policy restrittiva" : source === "cli-help" ? `${explicit.length} esposti dalla Copilot CLI locale per account e policy correnti` : `${explicit.length} dal catalogo compatibile Relay \xB7 verifica effettiva al primo utilizzo`;
    head.append(el("span", "", inventoryLabel));
    section.append(head);
    if (usage?.plan) section.append(el("div", "capacity-model-access__plan", usage.plan));
    const chips = el("div", "capacity-model-access__chips");
    const shown = mode === "auto-only" ? visible.filter((model) => model.id === "auto") : explicit;
    for (const model of shown.slice(0, 10)) {
      const chip = el("span", "capacity-model-chip");
      chip.append(el("span", "", model.label));
      if (model.reasoning.length) chip.append(el("small", "", "reasoning"));
      chips.append(chip);
    }
    if (shown.length > 10) chips.append(el("span", "capacity-model-chip is-muted", `+${shown.length - 10}`));
    section.append(chips);
    return section;
  }
  function formatUsageStatus(usage) {
    if (usage.remainingFraction !== void 0) return formatPercent(usage.remainingFraction);
    const absolute = usage.buckets?.find((bucket) => bucket.used !== void 0);
    return absolute ? formatAbsoluteUsage(absolute) : "\u2014";
  }
  function formatAbsoluteUsage(bucket) {
    if (bucket.used === void 0) return "\u2014";
    const suffix = bucket.unit === "credits" ? " cr" : bucket.unit === "requests" ? " req" : "";
    return `${formatNumber(bucket.used)}${suffix}`;
  }
  function formatNumber(value) {
    return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(value);
  }
  function normalizedBuckets(usage) {
    if (usage?.buckets?.length) {
      return [...usage.buckets].sort((a, b) => groupOrder(a) - groupOrder(b) || bucketOrder(a) - bucketOrder(b));
    }
    if (usage?.available && (usage.remainingFraction !== void 0 || usage.usedFraction !== void 0)) {
      return [{
        id: "primary",
        label: "Limite principale",
        kind: "other",
        ...usage.remainingFraction !== void 0 ? { remainingFraction: usage.remainingFraction } : {},
        ...usage.usedFraction !== void 0 ? { usedFraction: usage.usedFraction } : {},
        ...usage.resetsAt ? { resetsAt: usage.resetsAt } : {}
      }];
    }
    return [];
  }
  function antigravityWindowCoverage(buckets) {
    return new Set(buckets.filter((bucket) => bucket.group && (bucket.kind === "weekly" || bucket.kind === "five-hour" || bucket.kind === "session")).map((bucket) => `${bucket.group}:${bucket.kind === "session" ? "five-hour" : bucket.kind}`)).size;
  }
  function groupOrder(bucket) {
    const group = bucket.group?.toLowerCase() ?? "";
    if (group.includes("gemini")) return 0;
    if (group.includes("claude") || group.includes("gpt")) return 1;
    return 0;
  }
  function bucketOrder(bucket) {
    if (bucket.kind === "five-hour" || bucket.kind === "session") return 0;
    if (bucket.kind === "daily") return 1;
    if (bucket.kind === "weekly") return 2;
    return 3;
  }
  function usageTone(remaining) {
    if (remaining === void 0) return "is-unknown";
    if (remaining <= 0.15) return "is-critical";
    if (remaining <= 0.35) return "is-warning";
    return "is-healthy";
  }
  function compactVersion2(value) {
    if (!value) return "Provider locale";
    return value.replace(/\s*\(Claude Code\)\s*/i, "").replace(/^GitHub\s+Copilot(?:\s+CLI)?\s*/i, "").replace(/\.\s*Run ['"]?copilot update['"]?[^.]*\.?/i, "").replace(/\s+/g, " ").trim();
  }

  // src/ui/screens/remote.ts
  function renderRemote(runtime2) {
    const state = runtime2.state;
    const remote = state.remoteAccess ?? { enabled: false, activeSessions: [], sessionHistory: [], platform: "", computerName: "", mode: "lan" };
    const mode = remoteMode(remote.mode ?? state.preferences?.remoteAccessMode);
    const activeCount = remote.activeSessions?.length ?? 0;
    const historyCount = remote.sessionHistory?.length ?? 0;
    const tab = isRemoteTab(runtime2.remoteTab) ? runtime2.remoteTab : "access";
    runtime2.remoteTab = tab;
    const page = el("section", "content-page remote-page remote-v2");
    const header = el("header", "page-header remote-header");
    const copy = el("div");
    copy.append(el("span", "eyebrow", "Relay Ovunque"), el("h1", "", "Remoto"));
    copy.append(el("p", "", "Usa Relay sulla rete locale, da Internet o soltanto nel tuo tailnet privato."));
    const refresh = button("icon-button remote-header-action");
    refresh.title = "Ricontrolla accesso remoto";
    refresh.setAttribute("aria-label", "Ricontrolla accesso remoto");
    refresh.append(icon("refresh", 17));
    refresh.addEventListener("click", () => runtime2.post({ type: "detectRemoteTunnel" }));
    header.append(copy, refresh);
    page.append(header);
    page.append(renderModeCards(runtime2, mode));
    page.append(renderStatusStrip(remote, mode));
    page.append(renderTabs(runtime2, tab, activeCount, historyCount));
    const content = el("div", "remote-tab-content");
    if (tab === "access") content.append(renderAccess(runtime2, remote, state.systemReadiness, mode));
    if (tab === "sessions") content.append(renderSessions(runtime2, remote));
    if (tab === "history") content.append(renderHistory(runtime2, remote));
    if (tab === "network") content.append(renderNetwork(runtime2, remote, state.systemReadiness));
    page.append(content);
    if (remote.lastError) page.append(inlineError(remote.lastError));
    return page;
  }
  function renderModeCards(runtime2, current) {
    const section = el("section", "remote-mode-section");
    section.append(el("div", "remote-section-heading", "Accesso"));
    const grid = el("div", "remote-mode-grid");
    const modes = [
      { id: "lan", title: "Solo rete locale", detail: "Telefono e PC devono essere sulla stessa rete.", iconName: "remote" },
      { id: "funnel", title: "Ovunque", detail: "URL HTTPS pubblico protetto dal pairing Relay.", badge: "Consigliata", iconName: "external" },
      { id: "tailnet", title: "Privata", detail: "Accessibile solo ai dispositivi del tuo tailnet.", iconName: "lock" }
    ];
    for (const item of modes) {
      const card = button(`remote-mode-card ${current === item.id ? "is-selected" : ""}`);
      const glyph = el("span", "remote-mode-card__icon");
      glyph.append(icon(item.iconName, 18));
      const body = el("span", "remote-mode-card__body");
      const title = el("span", "remote-mode-card__title");
      title.append(el("strong", "", item.title));
      if (item.badge) title.append(el("small", "", item.badge));
      body.append(title, el("span", "remote-mode-card__detail", item.detail));
      const radio = el("span", "remote-mode-card__radio", current === item.id ? "\u2713" : "");
      card.append(glyph, body, radio);
      card.addEventListener("click", () => runtime2.post({ type: "setRemoteAccessMode", payload: { mode: item.id } }));
      grid.append(card);
    }
    section.append(grid);
    return section;
  }
  function renderStatusStrip(remote, mode) {
    const tunnel = remote.tunnel;
    const state = mode === "lan" ? remote.enabled ? "ACTIVE" : "STOPPED" : tunnel?.state ?? "NOT_INSTALLED";
    const strip = el("section", `remote-tunnel-status remote-tunnel-status--${statusTone(state)}`);
    const dot = el("span", `remote-tunnel-dot ${isBusyState(state) ? "is-pulsing" : ""}`);
    const copy = el("div", "remote-tunnel-status__copy");
    copy.append(el("strong", "", statusTitle(state, mode)), el("span", "", statusDetail(remote, state, mode)));
    strip.append(dot, copy);
    if (remote.url) strip.append(el("code", "remote-tunnel-status__url", baseUrl(remote.url)));
    return strip;
  }
  function renderTabs(runtime2, current, active, history) {
    const tabs = el("nav", "remote-tabs remote-tabs--v2");
    const items = [
      { id: "access", label: "Accesso", iconName: "shield" },
      { id: "sessions", label: "Sessioni", iconName: "devices", count: active },
      { id: "history", label: "Cronologia", iconName: "history", count: history },
      { id: "network", label: "Dettagli", iconName: "diagnostics" }
    ];
    for (const item of items) {
      const control = button(`remote-tab ${current === item.id ? "is-active" : ""}`);
      control.append(icon(item.iconName, 15), el("span", "", item.label));
      if (item.count) control.append(el("small", "remote-tab__count", String(item.count)));
      control.addEventListener("click", () => {
        runtime2.remoteTab = item.id;
        runtime2.render();
      });
      tabs.append(control);
    }
    return tabs;
  }
  function renderAccess(runtime2, remote, readiness, mode) {
    if (mode === "lan") return renderLanAccess(runtime2, remote, readiness);
    const tunnel = remote.tunnel ?? { state: "NOT_INSTALLED", transitions: [] };
    const wrap = el("div", "remote-access-stack");
    wrap.append(renderWizard(runtime2, remote, tunnel, mode, readiness));
    if (remote.enabled && remote.qrDataUrl && (tunnel.state === "ACTIVE" || tunnel.state === "PROPAGATING_DNS" || tunnel.state === "DEGRADED")) {
      wrap.append(renderPairing(runtime2, remote, mode));
    }
    return wrap;
  }
  function renderLanAccess(runtime2, remote, readiness) {
    const card = el("section", "remote-card remote-card--access");
    const heading = cardHeading("remote", remote.enabled ? "Accesso LAN attivo" : "Collega sulla rete locale");
    card.append(heading, el("p", "remote-note", readiness?.features?.remote?.detail ?? "Usa il runtime integrato di Relay."));
    if (!remote.enabled) {
      const preflight = el("div", "remote-preflight");
      preflight.append(preflightItem("Runtime Relay", true, processLabel(readiness)), preflightItem("Cloud", true, "Non richiesto"), preflightItem("Rete", true, "LAN locale"));
      card.append(preflight);
      const start = button("button button--primary remote-wide", "Genera QR locale");
      start.addEventListener("click", () => runtime2.post({ type: "startRemoteAccess" }));
      card.append(start);
      return card;
    }
    card.append(renderPairingBody(runtime2, remote));
    return card;
  }
  function renderWizard(runtime2, remote, tunnel, mode, readiness) {
    const card = el("section", "remote-card remote-wizard");
    const state = String(tunnel.state ?? "NOT_INSTALLED");
    const tailscale = readiness?.components?.find((entry) => entry.id === "tailscale");
    card.append(cardHeading("shield", mode === "funnel" ? "Configura Relay Ovunque" : "Configura Relay Privato"));
    const steps = el("div", "remote-wizard__steps");
    steps.append(
      wizardStep(1, "Installa Tailscale", tailscale?.state === "ready" || tunnel.installed, installStepText(state)),
      wizardStep(2, "Collega l\u2019account", tunnel.backendState === "Running", loginStepText(state)),
      wizardStep(3, "Attiva Relay", state === "ACTIVE" || state === "PROPAGATING_DNS" || state === "DEGRADED", activateStepText(state, mode))
    );
    card.append(steps);
    const actions = el("div", "remote-actions remote-wizard__actions");
    if (state === "NOT_INSTALLED" || !tunnel.installed) {
      actions.append(actionButton("Installa automaticamente", "installTailscale", runtime2, "button button--primary"));
    } else if (tunnel.backendState !== "Running") {
      actions.append(actionButton("Accedi o crea account", "loginTailscale", runtime2, "button button--primary"));
    } else if (!["ACTIVE", "PROPAGATING_DNS", "DEGRADED", "PROBING"].includes(state)) {
      actions.append(actionButton(mode === "funnel" ? "Attiva Ovunque" : "Attiva accesso privato", "activateRemoteTunnel", runtime2, "button button--primary"));
    } else if (state === "DEGRADED") {
      actions.append(actionButton("Ripara connessione", "remediateRemoteTunnel", runtime2, "button button--primary"));
    }
    const retry = actionButton("Ricontrolla", "detectRemoteTunnel", runtime2, "button button--secondary");
    actions.append(retry);
    card.append(actions);
    if (state === "AWAITING_AUTH") card.append(infoLine("Completa l\u2019accesso nel browser. Relay controlla automaticamente lo stato per cinque minuti."));
    if (state === "AWAITING_FUNNEL_APPROVAL") card.append(infoLine("Conferma Funnel nella pagina Tailscale aperta dal browser. \xC8 richiesto soltanto la prima volta nel tailnet."));
    if (state === "PROPAGATING_DNS") card.append(infoLine("La prima pubblicazione del dominio pu\xF2 richiedere fino a 10 minuti. Relay ripete il probe automaticamente."));
    if (state === "DEGRADED" || state === "ERROR") {
      const recovery = el("div", "remote-recovery-actions");
      recovery.append(actionButton("Copia diagnostica", "copyRemoteDiagnostic", runtime2, "button button--ghost button--small"));
      recovery.append(actionButton("Fai risolvere a un agente", "recoverRemoteTunnel", runtime2, "button button--secondary button--small"));
      card.append(recovery);
    }
    const disclosure = el("div", "remote-disclosure");
    disclosure.append(icon("lock", 14), el("span", "", mode === "funnel" ? "HTTPS e pairing Relay proteggono l\u2019accesso. Il nome del PC e del tailnet compariranno nel registro pubblico dei certificati, come previsto da Let\u2019s Encrypt." : "Il telefono deve avere Tailscale ed essere collegato allo stesso tailnet. L\u2019indirizzo non viene esposto pubblicamente."));
    card.append(disclosure);
    return card;
  }
  function renderPairing(runtime2, remote, mode) {
    const card = el("section", "remote-card remote-card--pairing remote-card--tunnel-pairing");
    card.append(cardHeading("remote", mode === "funnel" ? "QR raggiungibile da Internet" : "QR del tailnet privato"));
    card.append(renderPairingBody(runtime2, remote));
    if (remote.tunnel?.verifiedAt) card.append(infoLine(`${mode === "funnel" ? "Verificato da Internet" : "Verificato dal tailnet"} \xB7 ${formatRelativeTime(remote.tunnel.verifiedAt)}.`));
    return card;
  }
  function renderPairingBody(runtime2, remote) {
    const fragment = document.createDocumentFragment();
    const qrWrap = el("div", "remote-qr-wrap");
    if (remote.qrDataUrl) {
      const qr = el("img", "remote-qr");
      qr.src = remote.qrDataUrl;
      qr.alt = "QR accesso remoto Relay";
      qrWrap.append(qr);
    }
    const details = el("div", "remote-pairing-details");
    const code = el("div", "remote-code");
    code.append(el("span", "", "Codice di conferma"), el("strong", "", remote.pairingCode ?? "\u2014"));
    details.append(code);
    if (remote.pairingId) details.append(el("p", "remote-note", `ID QR ${remote.pairingId} \xB7 deve cambiare quando premi Rigenera QR.`));
    details.append(el("p", "remote-note", remote.ticketUsed ? "QR gi\xE0 utilizzato: rigeneralo per aggiungere un dispositivo." : `QR monouso \xB7 ${remote.pairingExpiresAt ? `scade ${formatRelativeTime(remote.pairingExpiresAt)}` : "validit\xE0 limitata"}.`));
    const urlRow = el("div", "remote-url remote-url--copy");
    urlRow.append(el("span", "", remote.url ?? "URL in preparazione"));
    const copy = button("icon-button");
    copy.title = "Copia URL";
    copy.append(icon("copy", 14));
    copy.addEventListener("click", () => navigator.clipboard.writeText(remote.url ?? ""));
    urlRow.append(copy);
    details.append(urlRow);
    qrWrap.append(details);
    fragment.append(qrWrap);
    const actions = el("div", "remote-actions");
    const regen = button("button button--secondary", "Rigenera QR");
    regen.addEventListener("click", () => runtime2.post({ type: "rotateRemotePairing" }));
    const stop = button("button button--danger-ghost", "Disattiva accesso");
    stop.addEventListener("click", () => runtime2.post({ type: "stopRemoteAccess" }));
    actions.append(regen, stop);
    fragment.append(actions);
    return fragment;
  }
  function renderSessions(runtime2, remote) {
    const card = el("section", "remote-card remote-card--sessions");
    card.append(cardHeading("devices", "Sessioni attive"));
    if (!remote.activeSessions?.length) {
      const empty = el("div", "remote-empty-state");
      empty.append(icon("devices", 24), el("strong", "", "Nessun dispositivo collegato"), el("p", "", "Apri Accesso e completa il pairing dal telefono."));
      const access = button("button button--primary", "Vai ad Accesso");
      access.addEventListener("click", () => {
        runtime2.remoteTab = "access";
        runtime2.render();
      });
      empty.append(access);
      card.append(empty);
      return card;
    }
    const list = el("div", "remote-session-list");
    for (const session of remote.activeSessions) {
      const row = el("article", "remote-session-row");
      const device = el("div", "remote-session-device");
      const avatar = el("span", "remote-device-icon");
      avatar.append(icon(deviceIcon(session.userAgent), 17));
      const info = el("div");
      info.append(el("strong", "", session.name || "Dispositivo mobile"), el("small", "", `${deviceLabel(session.userAgent)} \xB7 ${session.address}`), el("span", "remote-session-meta", `Attivo ${formatRelativeTime(session.lastSeenAt)}`));
      device.append(avatar, info);
      const close = button("button button--danger-ghost button--small", "Disconnetti");
      close.addEventListener("click", () => runtime2.post({ type: "closeRemoteSession", payload: { sessionId: session.id } }));
      row.append(device, close);
      list.append(row);
    }
    card.append(list);
    return card;
  }
  function renderHistory(runtime2, remote) {
    const history = Array.isArray(remote.sessionHistory) ? remote.sessionHistory : [];
    const pageSize = 8;
    const pages = Math.max(1, Math.ceil(history.length / pageSize));
    const currentPage = Math.max(0, Math.min(Number(runtime2.remoteHistoryPage ?? 0), pages - 1));
    runtime2.remoteHistoryPage = currentPage;
    const card = el("section", "remote-card");
    const head = el("div", "remote-card__title remote-card__title--split");
    head.append(cardHeading("history", "Cronologia"));
    if (history.length) {
      const clear = button("button button--ghost button--small", "Svuota");
      clear.addEventListener("click", () => runtime2.post({ type: "clearRemoteHistory" }));
      head.append(clear);
    }
    card.append(head);
    if (!history.length) {
      card.append(el("div", "remote-empty-state", "Nessuna connessione conclusa."));
      return card;
    }
    const list = el("div", "remote-history-list");
    for (const entry of history.slice(currentPage * pageSize, currentPage * pageSize + pageSize)) {
      const row = el("article", "remote-history-row");
      const glyph = el("span", "remote-device-icon");
      glyph.append(icon(deviceIcon(entry.userAgent), 16));
      const info = el("div", "remote-history-info");
      info.append(el("strong", "", entry.name || "Dispositivo"), el("small", "", `${deviceLabel(entry.userAgent)} \xB7 ${entry.address}`), el("span", "", `${reasonLabel(entry.reason)} \xB7 ${formatDuration(entry.durationMs)} \xB7 ${formatRelativeTime(entry.endedAt)}`));
      row.append(glyph, info);
      list.append(row);
    }
    card.append(list);
    if (pages > 1) {
      const pager = el("div", "remote-pager");
      const prev = button("button button--ghost button--small", "Precedente");
      prev.disabled = currentPage === 0;
      prev.addEventListener("click", () => {
        runtime2.remoteHistoryPage = currentPage - 1;
        runtime2.render();
      });
      const next = button("button button--ghost button--small", "Successiva");
      next.disabled = currentPage >= pages - 1;
      next.addEventListener("click", () => {
        runtime2.remoteHistoryPage = currentPage + 1;
        runtime2.render();
      });
      pager.append(prev, el("span", "", `${currentPage + 1} / ${pages}`), next);
      card.append(pager);
    }
    return card;
  }
  function renderNetwork(runtime2, remote, readiness) {
    const card = el("section", "remote-card");
    card.append(cardHeading("diagnostics", "Dettagli e transizioni"));
    const facts = el("div", "remote-facts");
    facts.append(fact("Modalit\xE0", modeLabel(remoteMode(remote.mode))), fact("Bind", remote.bindAddress ?? "\u2014"), fact("TLS", remote.secure ? "HTTPS" : "HTTP LAN"), fact("Sistema", platformLabel2(remote.platform)));
    card.append(facts);
    const tunnel = remote.tunnel;
    if (tunnel) {
      const details = el("details", "remote-transition-log");
      details.open = false;
      details.append(el("summary", "", `Ultime transizioni \xB7 ${tunnel.transitions?.length ?? 0}`));
      const list = el("div", "remote-transition-list");
      for (const entry of (tunnel.transitions ?? []).slice(-12).reverse()) {
        const row = el("div", "remote-transition-row");
        row.append(el("span", `remote-transition-state remote-transition-state--${statusTone(entry.state)}`, entry.state), el("strong", "", entry.message), el("small", "", formatRelativeTime(entry.at)));
        list.append(row);
      }
      details.append(list);
      card.append(details);
    }
    if (Array.isArray(remote.diagnostics)) for (const diagnostic of remote.diagnostics) card.append(diagnosticRow(diagnostic));
    const actions = el("div", "remote-actions");
    actions.append(actionButton("Ricontrolla", "detectRemoteTunnel", runtime2, "button button--secondary"), actionButton("Copia diagnostica", "copyRemoteDiagnostic", runtime2, "button button--ghost"));
    card.append(actions);
    return card;
  }
  function wizardStep(index, title, complete, detail) {
    const row = el("div", `remote-wizard-step ${complete ? "is-complete" : ""}`);
    row.append(el("span", "remote-wizard-step__index", complete ? "\u2713" : String(index)));
    const copy = el("div");
    copy.append(el("strong", "", title), el("span", "", detail));
    row.append(copy);
    return row;
  }
  function actionButton(label, type, runtime2, className) {
    const node = button(className, label);
    node.addEventListener("click", () => runtime2.post({ type }));
    return node;
  }
  function cardHeading(iconName, title) {
    const node = el("div", "remote-card__title");
    node.append(icon(iconName, 18), el("strong", "", title));
    return node;
  }
  function infoLine(text) {
    const node = el("div", "remote-info-line");
    node.append(icon("warning", 14), el("span", "", text));
    return node;
  }
  function inlineError(text) {
    const node = el("section", "remote-error");
    node.append(icon("warning", 16), el("span", "", text));
    return node;
  }
  function diagnosticRow(item) {
    const node = el("div", `remote-diagnostic remote-diagnostic--${item.level}`);
    node.append(el("span", "", item.title), el("p", "", item.detail));
    return node;
  }
  function fact(label, value) {
    const node = el("div", "remote-fact");
    node.append(el("span", "", label), el("strong", "", value));
    return node;
  }
  function preflightItem(label, ready, detail) {
    const node = el("div", `remote-preflight__item ${ready ? "is-ready" : "is-warning"}`);
    node.append(icon(ready ? "check" : "warning", 13));
    const copy = el("span");
    copy.append(el("strong", "", label), el("small", "", detail));
    node.append(copy);
    return node;
  }
  function processLabel(readiness) {
    return readiness?.components?.find((entry) => entry.id === "runtime")?.version ?? "Integrato";
  }
  function remoteMode(value) {
    return value === "funnel" || value === "tailnet" ? value : "lan";
  }
  function modeLabel(mode) {
    return mode === "funnel" ? "Ovunque" : mode === "tailnet" ? "Privata" : "Solo rete locale";
  }
  function baseUrl(value) {
    try {
      const url = new URL(value);
      return `${url.protocol}//${url.host}`;
    } catch {
      return value;
    }
  }
  function isBusyState(state) {
    return ["INSTALLING", "AWAITING_AUTH", "ACTIVATING", "AWAITING_FUNNEL_APPROVAL", "PROBING", "PROPAGATING_DNS", "REMEDIATING"].includes(state);
  }
  function statusTone(state) {
    if (state === "ACTIVE") return "ready";
    if (["DEGRADED", "PROPAGATING_DNS", "AWAITING_AUTH", "AWAITING_FUNNEL_APPROVAL"].includes(state)) return "warning";
    if (state === "ERROR") return "error";
    return "neutral";
  }
  function statusTitle(state, mode) {
    const labels = { NOT_INSTALLED: "Tailscale non installato", INSTALLED_NEEDS_LOGIN: "Account da collegare", AWAITING_AUTH: "Attesa accesso nel browser", LOGGED_IN: "Tailscale connesso", FUNNEL_NEEDS_ENABLE: "Pronto per l\u2019attivazione", AWAITING_FUNNEL_APPROVAL: "Conferma richiesta nel browser", ACTIVATING: "Attivazione in corso", PROBING: "Verifica end-to-end", PROPAGATING_DNS: "Propagazione DNS", ACTIVE: mode === "funnel" ? "Raggiungibile da Internet" : mode === "tailnet" ? "Raggiungibile dal tailnet" : "Raggiungibile in LAN", DEGRADED: "Attivo ma non raggiungibile", REMEDIATING: "Riparazione in corso", STOPPED: "Accesso spento", ERROR: "Configurazione non completata" };
    return labels[state] ?? "Controllo accesso remoto";
  }
  function statusDetail(remote, state, mode) {
    if (state === "ACTIVE" && remote.tunnel?.verifiedAt) return `Verificato ${formatRelativeTime(remote.tunnel.verifiedAt)}`;
    if (state === "DEGRADED") return remote.tunnel?.lastError ?? "Il proxy risulta configurato ma il probe non riesce a raggiungerlo.";
    if (state === "PROPAGATING_DNS") return "Pu\xF2 richiedere fino a 10 minuti soltanto alla prima attivazione.";
    if (mode === "lan") return remote.enabled ? "Telefono e PC devono restare sulla stessa rete." : "Avvia il server locale e genera un QR.";
    return remote.tunnel?.transitions?.at(-1)?.message ?? "Relay controller\xE0 installazione, account e proxy.";
  }
  function installStepText(state) {
    return state === "NOT_INSTALLED" ? "Manca il client ufficiale." : "Client rilevato.";
  }
  function loginStepText(state) {
    return state === "AWAITING_AUTH" ? "Completa il browser." : state === "INSTALLED_NEEDS_LOGIN" ? "Accesso richiesto." : "Account collegato.";
  }
  function activateStepText(state, mode) {
    if (state === "ACTIVE") return "Attivo e verificato.";
    if (state === "PROPAGATING_DNS") return "Configurato, DNS in propagazione.";
    if (state === "DEGRADED") return "Configurato, richiede remediation.";
    return mode === "funnel" ? "Pubblica Relay con HTTPS." : "Espone Relay soltanto nel tailnet.";
  }
  function platformLabel2(value) {
    return value === "win32" ? "Windows" : value === "darwin" ? "macOS" : value === "linux" ? "Linux" : value || "Locale";
  }
  function isRemoteTab(value) {
    return value === "access" || value === "sessions" || value === "history" || value === "network";
  }
  function deviceIcon(userAgent) {
    return /ipad|tablet/i.test(userAgent ?? "") ? "devices" : "remote";
  }
  function deviceLabel(userAgent) {
    const value = userAgent ?? "";
    if (/iphone|ipad/i.test(value)) return /ipad/i.test(value) ? "iPad \xB7 Safari" : "iPhone \xB7 Safari";
    if (/android/i.test(value)) return /chrome/i.test(value) ? "Android \xB7 Chrome" : "Android";
    if (/windows/i.test(value)) return "Windows";
    if (/macintosh|mac os/i.test(value)) return "macOS";
    if (/linux/i.test(value)) return "Linux";
    return "Browser mobile";
  }
  function reasonLabel(reason) {
    return reason === "revoked" ? "Disconnessa manualmente" : reason === "expired" ? "Scaduta per inattivit\xE0" : reason === "server-stopped" ? "Remoto chiuso" : "Terminata";
  }
  function formatDuration(value) {
    const seconds = Math.max(0, Math.round(Number(value || 0) / 1e3));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }

  // src/ui/screens/workspace.ts
  function renderWorkspace(runtime2) {
    const app = el("div", "workspace-app");
    app.append(renderTopbar(runtime2));
    const body = el("div", "workspace-body");
    body.append(renderPrimaryNav(runtime2), renderLibrary(runtime2));
    const main = el("main", "workspace-main");
    if (runtime2.section === "chat") main.append(renderChat(runtime2));
    if (runtime2.section === "projects") main.append(renderProjects(runtime2));
    if (runtime2.section === "agents") main.append(renderAgents(runtime2));
    if (runtime2.section === "usage") main.append(renderUsage(runtime2));
    if (runtime2.section === "rules") main.append(renderRules(runtime2));
    if (runtime2.section === "mcp") main.append(renderMcp(runtime2));
    if (runtime2.section === "automations") main.append(renderAutomations(runtime2));
    if (runtime2.section === "remote") main.append(renderRemote(runtime2));
    if (runtime2.section === "diagnostics") main.append(renderDiagnostics(runtime2));
    if (runtime2.section === "settings") main.append(renderSettings(runtime2));
    body.append(main);
    app.append(body);
    if (runtime2.historyOpen) app.append(renderHistoryDrawer(runtime2));
    if (runtime2.toast) app.append(renderToast(runtime2));
    return app;
  }
  function renderTopbar(runtime2) {
    const state = runtime2.state;
    const topbar = el("header", "app-topbar");
    const left = el("div", "topbar-left");
    const brand = button("brand-lockup");
    const mark = el("span", "product-mark");
    mark.append(icon("logo", 20));
    brand.append(mark, el("strong", "", "Relay"));
    brand.addEventListener("click", () => runtime2.setSection("chat"));
    left.append(brand, el("span", "topbar-divider"));
    const project = button("project-switcher");
    const projectIcon = el("span", "project-switcher__icon");
    projectIcon.append(icon("folder", 15));
    const copy = el("span", "project-switcher__copy");
    copy.append(el("span", "", state.workspace.name));
    copy.append(el("small", "", state.workspace.isGit ? "Git workspace" : state.workspace.cwd ? "Cartella locale" : "Apri un progetto"));
    project.append(projectIcon, copy, icon("chevronDown", 14));
    project.addEventListener("click", () => runtime2.setSection("projects"));
    left.append(project);
    topbar.append(left);
    const right = el("div", "topbar-right");
    right.append(renderTopbarSectionNav(runtime2));
    const providerHealth = el("div", "provider-health");
    for (const provider of state.providers) {
      const dot = button(`provider-health__item ${provider.available ? "is-ready" : "is-offline"}`);
      dot.append(providerGlyph(provider.id));
      dot.title = `${provider.label}: ${provider.available ? "pronto" : "non disponibile"}`;
      dot.addEventListener("click", () => runtime2.setSection("settings"));
      providerHealth.append(dot);
    }
    right.append(providerHealth);
    const activeJobs = activePrimaryRunCount(runtime2);
    if (activeJobs > 0) {
      const jobs = button("topbar-jobs");
      jobs.append(el("span", "topbar-jobs__pulse"));
      jobs.append(el("span", "", activeJobs === 1 ? "1 in corso" : `${activeJobs} in corso`));
      jobs.title = "Chat che stanno lavorando in background";
      jobs.addEventListener("click", () => {
        runtime2.historyOpen = true;
        runtime2.render();
      });
      right.append(jobs);
    }
    const history = iconButton("history", "Cronologia conversazioni", "topbar-history");
    if (Object.keys(runtime2.unseen).length > 0) {
      history.classList.add("has-unseen");
      history.append(el("span", "topbar-unseen-dot"));
    }
    history.addEventListener("click", () => {
      runtime2.historyOpen = true;
      runtime2.render();
    });
    right.append(history);
    const newChat = button("topbar-new-chat");
    newChat.append(icon("plus", 16), el("span", "", "Nuova chat"));
    newChat.addEventListener("click", () => runtime2.post({ type: "newConversation", payload: { provider: state.conversation.provider } }));
    right.append(newChat);
    const settings = iconButton("settings", "Impostazioni", `icon-button topbar-settings ${runtime2.section === "settings" ? "is-active" : ""}`);
    settings.addEventListener("click", () => runtime2.setSection("settings"));
    right.append(settings);
    topbar.append(right);
    return topbar;
  }
  function renderTopbarSectionNav(runtime2) {
    const nav = el("nav", "topbar-section-nav");
    nav.setAttribute("aria-label", "Sezioni Relay");
    const items = [
      { id: "chat", icon: "chat", label: "Chat" },
      { id: "projects", icon: "folder", label: "Progetti" },
      { id: "agents", icon: "sparkle", label: "Agenti" },
      { id: "usage", icon: "gauge", label: "Utilizzo" },
      { id: "rules", icon: "rules", label: "Regole" },
      { id: "mcp", icon: "workflow", label: "MCP" },
      { id: "automations", icon: "clock", label: "Automazioni" },
      { id: "remote", icon: "remote", label: "Remoto" },
      { id: "diagnostics", icon: "diagnostics", label: "Diagnostica" }
    ];
    for (const item of items) {
      const control = iconButton(item.icon, item.label, `topbar-section-nav__item ${runtime2.section === item.id ? "is-active" : ""}`);
      if (runtime2.section === item.id) control.setAttribute("aria-current", "page");
      control.addEventListener("click", () => runtime2.setSection(item.id));
      nav.append(control);
    }
    return nav;
  }
  function renderPrimaryNav(runtime2) {
    const nav = el("nav", "primary-nav");
    const items = [
      { id: "chat", icon: "chat", label: "Chat" },
      { id: "projects", icon: "folder", label: "Progetti" },
      { id: "agents", icon: "sparkle", label: "Agenti" },
      { id: "usage", icon: "gauge", label: "Utilizzo" },
      { id: "rules", icon: "rules", label: "Regole" },
      { id: "mcp", icon: "workflow", label: "MCP" },
      { id: "automations", icon: "clock", label: "Automazioni" },
      { id: "remote", icon: "remote", label: "Remoto" },
      { id: "diagnostics", icon: "diagnostics", label: "Diagnostica" }
    ];
    for (const item of items) {
      const control = button(`primary-nav__item ${runtime2.section === item.id ? "is-active" : ""}`);
      control.append(icon(item.icon, 19));
      control.title = item.label;
      control.setAttribute("aria-label", item.label);
      control.addEventListener("click", () => runtime2.setSection(item.id));
      nav.append(control);
    }
    nav.append(el("span", "primary-nav__spacer"));
    const settings = button(`primary-nav__item ${runtime2.section === "settings" ? "is-active" : ""}`);
    settings.append(icon("settings", 19));
    settings.title = "Impostazioni";
    settings.addEventListener("click", () => runtime2.setSection("settings"));
    nav.append(settings);
    return nav;
  }
  function renderLibrary(runtime2) {
    const pane = el("aside", "library-pane");
    if (runtime2.section === "chat") pane.append(renderConversationLibrary(runtime2));
    if (runtime2.section === "projects") pane.append(renderProjectLibrary(runtime2));
    if (runtime2.section === "agents") pane.append(renderAgentLibrary(runtime2));
    if (runtime2.section === "usage") pane.append(renderUsageLibrary(runtime2));
    if (runtime2.section === "rules") pane.append(renderRuleLibrary2(runtime2));
    if (runtime2.section === "mcp") pane.append(renderMcpLibrary(runtime2));
    if (runtime2.section === "automations") pane.append(renderAutomationLibrary(runtime2));
    if (runtime2.section === "remote") pane.append(renderRemoteLibrary(runtime2));
    if (runtime2.section === "diagnostics") pane.append(renderDiagnosticsLibrary(runtime2));
    if (runtime2.section === "settings") pane.append(renderSettingsLibrary(runtime2));
    return pane;
  }
  function renderHistoryDrawer(runtime2) {
    const overlay = el("div", "history-overlay");
    overlay.addEventListener("click", (event) => {
      if (event.target !== overlay) return;
      runtime2.historyOpen = false;
      runtime2.render();
    });
    const drawer = el("aside", "history-drawer");
    const top = el("header", "history-drawer__header");
    const copy = el("div");
    copy.append(el("span", "library-kicker", runtime2.state.workspace.name), el("h2", "", "Conversazioni"));
    const close = iconButton("close", "Chiudi cronologia");
    close.addEventListener("click", () => {
      runtime2.historyOpen = false;
      runtime2.render();
    });
    top.append(copy, close);
    drawer.append(top, renderConversationLibrary(runtime2, true));
    overlay.append(drawer);
    return overlay;
  }
  function renderConversationLibrary(runtime2, compact = false) {
    const state = runtime2.state;
    const section = el("section", `conversation-library ${compact ? "is-drawer" : ""}`);
    if (!compact) {
      const heading = el("div", "library-heading");
      const copy = el("div");
      copy.append(el("span", "library-kicker", "Workspace"), el("h2", "", "Conversazioni"));
      const add = iconButton("plus", "Nuova conversazione", "library-add");
      add.addEventListener("click", () => runtime2.post({ type: "newConversation", payload: { provider: state.conversation.provider } }));
      heading.append(copy, add);
      section.append(heading);
    } else {
      const add = button("history-new-chat");
      add.append(icon("plus", 15), el("span", "", "Nuova conversazione"));
      add.addEventListener("click", () => runtime2.post({ type: "newConversation", payload: { provider: state.conversation.provider } }));
      section.append(add);
    }
    const search = el("label", "library-search");
    search.append(icon("search", 15));
    const input = el("input");
    input.placeholder = "Cerca chat";
    input.value = runtime2.search;
    input.addEventListener("input", () => {
      runtime2.search = input.value;
      runtime2.render();
    });
    search.append(input);
    section.append(search);
    const list = el("div", "conversation-list");
    const query = runtime2.search.trim().toLowerCase();
    const conversations = state.conversations.filter((conversation) => !query || conversation.title.toLowerCase().includes(query));
    const archived = (state.archivedConversations ?? []).filter((conversation) => !query || conversation.title.toLowerCase().includes(query));
    const pinned = conversations.filter((conversation) => conversation.pinned);
    const others = conversations.filter((conversation) => !conversation.pinned);
    if (pinned.length) {
      list.append(el("span", "list-section-label", "In evidenza"));
      for (const conversation of pinned) list.append(conversationItem(runtime2, conversation));
    }
    if (others.length) {
      list.append(el("span", "list-section-label", "Recenti"));
      for (const conversation of others) list.append(conversationItem(runtime2, conversation));
    }
    if (archived.length) {
      const archivedDetails = el("details", "archived-conversations");
      const archivedSummary = el("summary", "archived-conversations__summary");
      archivedSummary.append(icon("archive", 14), el("span", "", `Archiviate (${archived.length})`), icon("chevronDown", 13));
      archivedDetails.append(archivedSummary);
      const archivedList = el("div", "archived-conversations__list");
      for (const conversation of archived) archivedList.append(archivedConversationItem(runtime2, conversation));
      archivedDetails.append(archivedList);
      list.append(archivedDetails);
    }
    if (!conversations.length && !archived.length) list.append(el("div", "library-empty", query ? "Nessun risultato" : "La cronologia comparir\xE0 qui."));
    section.append(list);
    const footer = el("div", "library-footer");
    footer.append(el("span", "", state.workspace.name), el("span", "", `${state.conversations.length} chat${(state.archivedConversations ?? []).length ? ` \xB7 ${(state.archivedConversations ?? []).length} archiviate` : ""}`));
    section.append(footer);
    return section;
  }
  function conversationItem(runtime2, conversation) {
    const state = runtime2.state;
    const job = conversationJobState(runtime2, conversation.id);
    const item = el("div", `conversation-item ${conversation.id === state.conversation.id ? "is-active" : ""} ${job ? `has-job is-job-${job}` : ""}`);
    const open = button("conversation-item__main");
    open.append(providerGlyph(conversation.provider));
    const copy = el("span", "conversation-item__copy");
    copy.append(el("strong", "", conversation.title), el("small", "", jobSubtitle(job) ?? `${formatRelativeTime(conversation.updatedAt)} \xB7 ${conversation.messageCount} messaggi`));
    open.append(copy);
    if (job) {
      const status = el("span", `conversation-item__status is-${job}`);
      status.title = job === "running" ? "Agente al lavoro" : job === "error" ? "Terminata con errore" : "Terminata \xB7 da leggere";
      if (job === "running") status.append(el("span", "conversation-item__status-pulse"));
      else status.append(icon(job === "error" ? "warning" : "check", 11));
      open.append(status);
    }
    open.addEventListener("click", () => {
      if (runtime2.unseen[conversation.id]) {
        delete runtime2.unseen[conversation.id];
      }
      runtime2.post({ type: "selectConversation", payload: { id: conversation.id } });
    });
    item.append(open);
    const menu = el("details", "conversation-menu");
    const trigger = el("summary", "conversation-menu__trigger");
    trigger.append(icon("more", 16));
    trigger.title = "Azioni conversazione";
    menu.append(trigger);
    const actions = el("div", "conversation-menu__popover");
    actions.append(conversationAction("pin", conversation.pinned ? "Rimuovi dai preferiti" : "Metti in evidenza", () => {
      runtime2.post({ type: "pinConversation", payload: { id: conversation.id, pinned: !conversation.pinned } });
    }));
    actions.append(conversationAction("edit", "Rinomina", () => runtime2.post({ type: "renameConversation", payload: { id: conversation.id } })));
    actions.append(conversationAction("archive", "Archivia", () => runtime2.post({ type: "archiveConversation", payload: { id: conversation.id, stay: "history" } })));
    actions.append(conversationAction("trash", "Elimina definitivamente", () => {
      runtime2.post({ type: "deleteConversation", payload: { id: conversation.id, stay: "history" } });
    }, true));
    menu.append(actions);
    item.append(menu);
    return item;
  }
  function archivedConversationItem(runtime2, conversation) {
    const item = el("div", "conversation-item is-archived");
    const main = el("div", "conversation-item__main");
    main.append(providerGlyph(conversation.provider));
    const copy = el("span", "conversation-item__copy");
    copy.append(el("strong", "", conversation.title), el("small", "", `${formatRelativeTime(conversation.updatedAt)} \xB7 ${conversation.messageCount} messaggi`));
    main.append(copy);
    item.append(main);
    const actions = el("div", "archived-conversation-actions");
    const restore = iconButton("refresh", "Ripristina conversazione", "archived-conversation-action");
    restore.addEventListener("click", () => runtime2.post({ type: "restoreConversation", payload: { id: conversation.id, stay: "history" } }));
    const remove = iconButton("trash", "Elimina definitivamente", "archived-conversation-action is-danger");
    remove.addEventListener("click", () => runtime2.post({ type: "deleteConversation", payload: { id: conversation.id, stay: "history" } }));
    actions.append(restore, remove);
    item.append(actions);
    return item;
  }
  function conversationJobState(runtime2, conversationId) {
    const running = runtime2.state.activeRuns.some(
      (run) => run.conversationId === conversationId && run.kind !== "delegation" && !["completed", "failed", "cancelled"].includes(run.phase)
    );
    if (running) return "running";
    if (conversationId === runtime2.state.conversation.id) return void 0;
    return runtime2.unseen[conversationId];
  }
  function jobSubtitle(job) {
    if (job === "running") return "In esecuzione\u2026";
    if (job === "done") return "Completata \xB7 da leggere";
    if (job === "error") return "Errore \xB7 da rivedere";
    return void 0;
  }
  function activePrimaryRunCount(runtime2) {
    return runtime2.state.activeRuns.filter(
      (run) => run.kind !== "delegation" && !["completed", "failed", "cancelled"].includes(run.phase)
    ).length;
  }
  function conversationAction(iconName, label, action, danger = false) {
    const control = button(`conversation-menu__item ${danger ? "is-danger" : ""}`);
    control.append(icon(iconName, 14), el("span", "", label));
    control.addEventListener("click", (event) => {
      event.preventDefault();
      const details = control.closest("details");
      if (details) details.open = false;
      action();
    });
    return control;
  }
  function renderProjectLibrary(runtime2) {
    const state = runtime2.state;
    const section = el("section", "library-section");
    section.append(libraryTitle("Progetti", "Workspace locali"));
    const list = el("div", "simple-library-list");
    const recentProjects = [...state.projects].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)).slice(0, 5);
    for (const project of recentProjects) {
      const item = button(`simple-library-item ${project.id === state.workspace.id ? "is-active" : ""}`);
      const visual = el("span", "simple-library-item__icon");
      visual.append(icon("folder", 16));
      const copy = el("span");
      copy.append(el("strong", "", project.name), el("small", "", project.isGit ? "Git" : "Locale"));
      item.append(visual, copy);
      item.addEventListener("click", () => runtime2.post({ type: "openRecentProject", payload: { path: project.path } }));
      list.append(item);
    }
    section.append(list);
    if (state.projects.length > recentProjects.length) {
      const all = button("library-secondary-action");
      all.append(el("span", "", `Vedi tutti i ${state.projects.length} progetti`), icon("arrowUp", 13));
      all.addEventListener("click", () => runtime2.setSection("projects"));
      section.append(all);
    }
    const open = button("library-primary-action");
    open.append(icon("plus", 15), el("span", "", "Apri un progetto"));
    open.addEventListener("click", () => runtime2.post({ type: "openProject" }));
    section.append(open);
    return section;
  }
  function renderAgentLibrary(runtime2) {
    const state = runtime2.state;
    const local = runtime2;
    const section = el("section", "library-section");
    const heading = el("div", "library-heading");
    const copy = el("div");
    copy.append(el("span", "library-kicker", "Orchestration"), el("h2", "", "Agenti"));
    const add = iconButton("plus", "Nuovo agente", "library-add");
    add.addEventListener("click", () => {
      local.agentEditorDraft = void 0;
      local.agentEditorId = void 0;
      runtime2.setSection("agents");
      const trigger = document.querySelector(".agents-header .button--primary");
      trigger?.click();
    });
    heading.append(copy, add);
    section.append(heading);
    const list = el("div", "simple-library-list");
    const agents = Array.isArray(state.agents) ? state.agents : [];
    for (const agent of agents.slice(0, 8)) {
      const item = button(`simple-library-item ${agent.enabled ? "" : "is-muted"}`);
      const visual = el("span", "simple-library-item__icon");
      visual.append(providerGlyph(agent.provider));
      const rowCopy = el("span");
      rowCopy.append(el("strong", "", agent.name), el("small", "", `${agent.taskCount ?? 0} task \xB7 ${agent.globalVisible ? "globale" : "progetti"}`));
      item.append(visual, rowCopy);
      item.addEventListener("click", () => {
        local.agentEditorDraft = {
          id: agent.id,
          name: agent.name ?? "",
          bio: agent.bio ?? "",
          provider: agent.provider,
          model: agent.model ?? "auto",
          reasoning: agent.reasoning ?? "auto",
          specialization: agent.specialization ?? "",
          instructions: agent.instructions ?? "",
          enabled: agent.enabled !== false,
          canDelegate: Boolean(agent.canDelegate),
          visibleInChat: agent.visibleInChat !== false,
          globalVisible: agent.globalVisible !== false,
          projectIds: [...agent.projectIds ?? []],
          mcpServers: (agent.mcpServers ?? []).join(", "),
          isDefault: Boolean(agent.isDefault)
        };
        local.agentEditorId = agent.id;
        runtime2.setSection("agents");
      });
      list.append(item);
    }
    if (!agents.length) list.append(el("div", "library-empty", "Nessun agente configurato."));
    section.append(list);
    const manage = button("library-primary-action");
    manage.append(icon("sparkle", 15), el("span", "", agents.length ? "Gestisci agenti" : "Crea agente"));
    manage.addEventListener("click", () => runtime2.setSection("agents"));
    section.append(manage);
    return section;
  }
  function renderUsageLibrary(runtime2) {
    const state = runtime2.state;
    const section = el("section", "library-section");
    section.append(libraryTitle("Utilizzo", "Quote provider"));
    const list = el("div", "usage-library-list");
    for (const provider of state.providers) {
      const usage = state.usage.find((entry) => entry.provider === provider.id);
      const row = el("div", "usage-library-item");
      row.append(providerGlyph(provider.id));
      const copy = el("div");
      copy.append(el("strong", "", provider.label), el("span", "", usage?.available ? `${formatPercent(usage.remainingFraction)} disponibile` : "Non esposto"));
      row.append(copy);
      list.append(row);
    }
    section.append(list);
    const refresh = button(`library-primary-action usage-refresh ${state.usageRefreshing ? "is-loading" : ""}`);
    refresh.disabled = state.usageRefreshing;
    refresh.append(icon("refresh", 15), el("span", "", state.usageRefreshing ? "Aggiornamento\u2026" : "Aggiorna limiti"));
    refresh.addEventListener("click", () => runtime2.post({ type: "refreshUsage" }));
    section.append(refresh);
    return section;
  }
  function renderRuleLibrary2(runtime2) {
    const state = runtime2.state;
    const section = el("section", "library-section");
    const heading = el("div", "library-heading");
    const copy = el("div");
    copy.append(el("span", "library-kicker", "Governance"), el("h2", "", "Regole"));
    const add = iconButton("plus", "Nuova regola", "library-add");
    add.addEventListener("click", () => {
      runtime2.ruleDraft = { id: `draft:${Date.now()}`, name: "Nuova regola", scope: "project", projectId: state.workspace.id, providers: ["codex", "claude", "antigravity", "copilot"], priority: 100, enabled: true, path: "", content: "" };
      delete runtime2.selectedRuleId;
      runtime2.render();
    });
    heading.append(copy, add);
    section.append(heading);
    const grouped = groupRules(state.rules);
    const list = el("div", "rule-library-list");
    for (const [label, rules] of grouped) {
      list.append(el("span", "list-section-label", label));
      for (const rule of rules) {
        const item = button(`rule-library-item ${runtime2.selectedRuleId === rule.id || !runtime2.selectedRuleId && !runtime2.ruleDraft && state.rules[0]?.id === rule.id ? "is-active" : ""}`);
        const stateDot = el("span", `rule-state ${rule.enabled ? "is-enabled" : ""}`);
        const itemCopy = el("span");
        itemCopy.append(el("strong", "", rule.name), el("small", "", rule.providers.length === 4 ? "Tutti i provider" : rule.providers.map((id) => id === "claude" ? "Claude" : id === "antigravity" ? "Antigravity" : id === "copilot" ? "Copilot" : "Codex").join(" \xB7 ")));
        item.append(stateDot, itemCopy);
        item.addEventListener("click", () => {
          delete runtime2.ruleDraft;
          runtime2.selectedRuleId = rule.id;
          runtime2.render();
        });
        list.append(item);
      }
    }
    if (!state.rules.length) list.append(el("div", "library-empty", "Nessuna regola configurata."));
    section.append(list);
    return section;
  }
  function renderAutomationLibrary(runtime2) {
    const pane = el("section", "library-section");
    pane.append(el("span", "eyebrow", "Programmate"), el("h2", "", "Automazioni"));
    pane.append(el("p", "library-copy", `${runtime2.state.automations.filter((item) => item.enabled).length} attive \xB7 ${runtime2.state.automations.length} totali`));
    const newAutomation = button("button button--primary button--small", "Nuova");
    newAutomation.addEventListener("click", () => {
      runtime2.automationDraft = { name: "", prompt: "", projectId: runtime2.state.workspace.id, permission: "workspace-write", delegationPolicy: "confirm", schedule: { kind: "daily", time: "09:00" }, enabled: true, missedPolicy: "skip" };
      runtime2.setSection("automations");
    });
    pane.append(newAutomation);
    return pane;
  }
  function renderMcpLibrary(runtime2) {
    const state = runtime2.state;
    const section = el("section", "library-section");
    section.append(libraryTitle("MCP", "Server context protocol"));
    const groups = /* @__PURE__ */ new Map();
    for (const server of state.mcp.servers) groups.set(server.provider, (groups.get(server.provider) ?? 0) + 1);
    const list = el("div", "simple-library-list");
    for (const provider of state.providers.filter((entry) => entry.available)) {
      const item = el("div", "simple-library-item is-static");
      const visual = el("span", "simple-library-item__icon");
      visual.append(providerGlyph(provider.id));
      const copy = el("span");
      copy.append(el("strong", "", provider.label), el("small", "", `${groups.get(provider.id) ?? 0} server`));
      item.append(visual, copy);
      list.append(item);
    }
    section.append(list);
    const add = button("library-primary-action");
    add.append(icon("plus", 15), el("span", "", "Aggiungi MCP"));
    add.addEventListener("click", () => {
      runtime2.mcpEditorDraft = { name: "", transport: "stdio", target: "", scope: "project", providers: [] };
      runtime2.setSection("mcp");
    });
    section.append(add);
    return section;
  }
  function renderRemoteLibrary(runtime2) {
    const remote = runtime2.state.remoteAccess ?? { enabled: false, activeSessions: [] };
    const section = el("section", "mini-library");
    section.append(el("span", "library-kicker", "LAN"), el("h2", "", "Remoto"));
    const status = el("div", "library-metric");
    status.append(el("strong", "", remote.enabled ? "Attivo" : "Spento"), el("span", "", remote.enabled ? `${remote.activeSessions?.length ?? 0} connessioni` : "QR non generato"));
    section.append(status);
    const action = button("button button--secondary remote-library-action", remote.enabled ? "Nuovo QR" : "Avvia remoto");
    action.addEventListener("click", () => runtime2.post({ type: remote.enabled ? "rotateRemotePairing" : "startRemoteAccess" }));
    section.append(action);
    return section;
  }
  function renderDiagnosticsLibrary(runtime2) {
    const state = runtime2.state;
    const section = el("section", "library-section");
    section.append(libraryTitle("Diagnostica", "Runtime locale"));
    const list = el("div", "simple-library-list");
    const errors = state.diagnostics.filter((entry) => entry.level === "error").length;
    const warnings = state.diagnostics.filter((entry) => entry.level === "warning").length;
    for (const [title, subtitle, iconName] of [
      ["Eventi sessione", `${state.diagnostics.length} registrati`, "diagnostics"],
      ["Errori", `${errors} errori \xB7 ${warnings} avvisi`, "warning"],
      ["Run attivi", `${state.activeRuns.length} attivi \xB7 ${state.scheduler.queued.length} in coda`, "gauge"]
    ]) {
      const item = el("div", "simple-library-item is-static");
      const visual = el("span", "simple-library-item__icon");
      visual.append(icon(iconName, 16));
      const copy = el("span");
      copy.append(el("strong", "", title), el("small", "", subtitle));
      item.append(visual, copy);
      list.append(item);
    }
    section.append(list);
    const copyLogs = button("library-primary-action");
    copyLogs.append(icon("copy", 15), el("span", "", "Copia diagnostica"));
    copyLogs.addEventListener("click", () => runtime2.post({ type: "copyDiagnostics" }));
    section.append(copyLogs);
    return section;
  }
  function renderSettingsLibrary(runtime2) {
    const section = el("section", "library-section");
    section.append(libraryTitle("Impostazioni", "Relay locale"));
    const list = el("div", "simple-library-list");
    const items = [
      ["settings", "Generali", "Default e deleghe"],
      ["sparkle", "Provider", "Modelli e thinking"],
      ["diagnostics", "Installazione", "CLI e diagnostica"]
    ];
    for (const [iconName, title, subtitle] of items) {
      const item = el("div", "simple-library-item is-static");
      const visual = el("span", "simple-library-item__icon");
      visual.append(icon(iconName, 16));
      const copy = el("span");
      copy.append(el("strong", "", title), el("small", "", subtitle));
      item.append(visual, copy);
      list.append(item);
    }
    section.append(list);
    const setup = button("library-primary-action");
    setup.append(icon("refresh", 15), el("span", "", "Riapri onboarding"));
    setup.addEventListener("click", () => runtime2.post({ type: "showOnboarding" }));
    section.append(setup);
    return section;
  }
  function libraryTitle(title, subtitle) {
    const heading = el("div", "library-heading");
    const copy = el("div");
    copy.append(el("span", "library-kicker", subtitle), el("h2", "", title));
    heading.append(copy);
    return heading;
  }
  function groupRules(rules) {
    const active = rules.filter((rule) => rule.enabled);
    const inactive = rules.filter((rule) => !rule.enabled);
    const groups = [];
    if (active.length) groups.push(["Attive", active]);
    if (inactive.length) groups.push(["Disattivate", inactive]);
    return groups;
  }
  function renderToast(runtime2) {
    const toast = el("div", `toast toast--${runtime2.toast.level}`);
    const visual = el("span", "toast__icon");
    visual.append(icon(runtime2.toast.level === "error" ? "warning" : runtime2.toast.level === "warning" ? "warning" : "check", 17));
    toast.append(visual, el("span", "", runtime2.toast.message));
    const close = iconButton("close", "Chiudi", "toast__close");
    close.addEventListener("click", () => {
      delete runtime2.toast;
      runtime2.render();
    });
    toast.append(close);
    return toast;
  }

  // src/ui/webview.ts
  var VALID_SECTIONS = ["chat", "projects", "agents", "usage", "rules", "mcp", "automations", "remote", "diagnostics", "settings"];
  var bootBridge = window.__relayBootBridge;
  var vscode = bootBridge?.vscode ?? acquireVsCodeApi();
  var rootElement = document.querySelector("#app");
  if (!rootElement) throw new Error("Relay root element not found.");
  var root = rootElement;
  var persisted = safePersistedState(vscode.getState());
  var toastSequence = 0;
  var renderScheduled = false;
  var renderTimer;
  var bootStartedAt = Date.now();
  var lastRenderError = "";
  var bootFailure = "";
  var bootTicker;
  var transientFocus;
  var pendingRunPatches = /* @__PURE__ */ new Set();
  var runPatchFrame;
  var attachmentRequests = /* @__PURE__ */ new Map();
  var runtime = {
    state: null,
    section: normalizeSection(persisted?.section),
    onboardingStep: persisted?.onboardingStep ?? 0,
    search: persisted?.search ?? "",
    ...persisted?.selectedRuleId ? { selectedRuleId: persisted.selectedRuleId } : {},
    streams: /* @__PURE__ */ new Map(),
    drafts: normalizeDrafts(persisted?.drafts),
    scrollByConversation: {},
    scrollBySection: {},
    historyOpen: false,
    usageOpen: false,
    pendingComposerFocus: false,
    expandedPanels: new Set(persisted?.expandedPanels ?? []),
    expandedProjects: /* @__PURE__ */ new Set(),
    projectsVisibleLimit: persisted?.projectsVisibleLimit ?? 5,
    projectSearch: persisted?.projectSearch ?? "",
    unseen: { ...persisted?.unseenByConversation ?? {} },
    post(message) {
      vscode.postMessage(message);
    },
    setSection(section) {
      captureTransientUi();
      runtime.section = normalizeSection(section);
      runtime.historyOpen = false;
      runtime.usageOpen = false;
      persistUi();
      render();
    },
    render,
    saveAttachments
  };
  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    const openPicker = document.querySelector("details.composer-picker[open]");
    const pickerMenu = target instanceof Element ? target.closest("[data-picker-menu-owner]") : null;
    if (openPicker && target && !openPicker.contains(target) && pickerMenu?.dataset.pickerMenuOwner !== openPicker.dataset.picker) {
      openPicker.open = false;
    }
    const openMenu = document.querySelector("details.conversation-menu[open]");
    if (openMenu && target && !openMenu.contains(target)) openMenu.open = false;
    if (runtime.usageOpen && target) {
      const element = target instanceof Element ? target : target.parentElement;
      if (!element?.closest(".usage-popover, .composer-usage-button")) {
        runtime.usageOpen = false;
        scheduleRender();
      }
    }
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    const link = target?.closest("[data-relay-resource]");
    if (!link?.dataset.relayResource) return;
    event.preventDefault();
    runtime.post({ type: "openFile", payload: { path: link.dataset.relayResource } });
  });
  window.addEventListener("error", (event) => {
    if (/ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/i.test(event.message ?? "")) {
      event.preventDefault();
      return;
    }
    reportUiError(event.error ?? new Error(event.message));
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportUiError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
  });
  bootTicker = window.setInterval(() => {
    if (!runtime.state) scheduleRender();
    else if (bootTicker !== void 0) {
      window.clearInterval(bootTicker);
      bootTicker = void 0;
    }
  }, 1800);
  var readyAcknowledged = false;
  function receiveHostMessage(message) {
    if (message?.type === "webviewAck") {
      readyAcknowledged = true;
      return;
    }
    if (message?.type === "state") {
      applyState(message.payload);
    } else if (message?.type === "usageState") {
      applyUsageState(message.payload);
    } else if (message?.type === "agentEvent") {
      applyAgentEvent(message.payload);
    } else if (message?.type === "uiCommand") {
      applyUiCommand(message.payload?.action);
    } else if (message?.type === "attachmentsSaved") {
      const requestId = String(message.payload?.requestId ?? "");
      const pending = attachmentRequests.get(requestId);
      if (pending) {
        attachmentRequests.delete(requestId);
        if (message.payload?.error) pending.reject(new Error(String(message.payload.error)));
        else pending.resolve(Array.isArray(message.payload?.files) ? message.payload.files : []);
      }
    } else if (message?.type === "initializationError") {
      bootFailure = String(message.payload?.message ?? "Avvio Relay non completato.");
      scheduleRender();
    } else if (message?.type === "notice") {
      const toast = { ...message.payload, id: ++toastSequence };
      runtime.toast = toast;
      scheduleRender();
      const id = toast.id;
      setTimeout(() => {
        if (runtime.toast?.id === id) {
          delete runtime.toast;
          scheduleRender();
        }
      }, message.payload.level === "error" ? 8e3 : 4500);
    }
  }
  window.addEventListener("message", (event) => receiveHostMessage(event.data));
  if (bootBridge) {
    bootBridge.mainReady = true;
    for (const message of bootBridge.pendingMessages.splice(0)) receiveHostMessage(message);
  }
  var announceReady = () => runtime.post({ type: "webviewReady" });
  announceReady();
  var readyRetry = window.setInterval(() => {
    if (readyAcknowledged) {
      window.clearInterval(readyRetry);
      return;
    }
    announceReady();
  }, 500);
  window.setTimeout(() => window.clearInterval(readyRetry), 1e4);
  window.setInterval(() => {
    const labels = document.querySelectorAll("[data-elapsed-start]");
    for (const label of labels) {
      const startedAt = Number(label.dataset.elapsedStart);
      if (!Number.isFinite(startedAt)) continue;
      const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1e3));
      label.textContent = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    }
  }, 1e3);
  render();
  function applyState(state) {
    window.__relayRendered = true;
    captureTransientUi();
    const previousConversationId = runtime.state?.conversation.id;
    const wasOnboarded = runtime.state?.onboardingComplete ?? state.onboardingComplete;
    runtime.state = state;
    bootFailure = "";
    if (bootTicker !== void 0) {
      window.clearInterval(bootTicker);
      bootTicker = void 0;
    }
    if (wasOnboarded && !state.onboardingComplete) runtime.onboardingStep = 0;
    const persistedRunIds = new Set(state.conversation.messages.filter((message) => message.role === "assistant").map((message) => message.runId).filter(Boolean));
    const activeIds = new Set(state.activeRuns.map((run) => run.id));
    for (const [runId, stream] of runtime.streams) {
      if (persistedRunIds.has(runId) && !activeIds.has(runId)) runtime.streams.delete(runId);
      else if (!activeIds.has(runId) && isTerminalPhase(stream.phase)) runtime.streams.delete(runId);
    }
    for (const run of state.activeRuns) {
      if (run.kind !== "delegation" && run.phase === "failed" && run.conversationId !== state.conversation.id) {
        runtime.unseen[run.conversationId] = "error";
      }
      const existing = runtime.streams.get(run.id);
      if (existing) {
        existing.status = run.status;
        existing.phase = run.phase;
        existing.provider = run.provider;
        existing.conversationId = run.conversationId;
        if (run.kind) existing.kind = run.kind;
        else delete existing.kind;
        if (run.parentRunId) existing.parentRunId = run.parentRunId;
        else delete existing.parentRunId;
        if (run.rootRunId) existing.rootRunId = run.rootRunId;
        else delete existing.rootRunId;
        if (run.taskLabel) existing.taskLabel = run.taskLabel;
        else delete existing.taskLabel;
        if (run.model) existing.model = run.model;
        else delete existing.model;
        if (run.reasoning) existing.reasoning = run.reasoning;
        else delete existing.reasoning;
        if (run.agentId) existing.agentId = String(run.agentId);
        else delete existing.agentId;
        if (run.agentName) existing.agentName = String(run.agentName);
        else delete existing.agentName;
        if (run.error) existing.error = run.error;
        else delete existing.error;
        if (run.failure) existing.failure = run.failure;
        else delete existing.failure;
        existing.activities = run.activities.map((activity) => ({
          title: activity.title,
          ...activity.detail ? { detail: activity.detail } : {}
        }));
        continue;
      }
      runtime.streams.set(run.id, {
        runId: run.id,
        conversationId: run.conversationId,
        provider: run.provider,
        text: "",
        status: run.status,
        phase: run.phase,
        activities: run.activities.map((activity) => ({ title: activity.title, ...activity.detail ? { detail: activity.detail } : {} })),
        startedAt: new Date(run.startedAt).getTime(),
        ...run.error ? { error: run.error } : {},
        ...run.model ? { model: run.model } : {},
        ...run.reasoning ? { reasoning: run.reasoning } : {},
        ...run.agentId ? { agentId: String(run.agentId) } : {},
        ...run.agentName ? { agentName: String(run.agentName) } : {},
        ...run.kind ? { kind: run.kind } : {},
        ...run.parentRunId ? { parentRunId: run.parentRunId } : {},
        ...run.rootRunId ? { rootRunId: run.rootRunId } : {},
        ...run.taskLabel ? { taskLabel: run.taskLabel } : {}
      });
    }
    if (previousConversationId !== state.conversation.id && !runtime.scrollByConversation[state.conversation.id]) {
      runtime.scrollByConversation[state.conversation.id] = { top: 0, stickToBottom: true };
    }
    if (runtime.unseen[state.conversation.id]) delete runtime.unseen[state.conversation.id];
    const knownIds = new Set(state.conversations.map((conversation) => conversation.id));
    for (const id of Object.keys(runtime.unseen)) {
      if (!knownIds.has(id)) delete runtime.unseen[id];
    }
    persistUi();
    scheduleRender();
  }
  function applyUsageState(payload) {
    if (!runtime.state) return;
    runtime.state = {
      ...runtime.state,
      usage: payload.usage,
      usageRefreshing: payload.usageRefreshing
    };
    if (!runtime.state.onboardingComplete || runtime.section === "usage" || runtime.section === "chat" && runtime.usageOpen) scheduleRender();
  }
  function applyAgentEvent(event) {
    const run = ensureStream(event.runId);
    if (event.type === "status") {
      run.status = event.message;
      run.phase = event.phase ?? run.phase;
    } else if (event.type === "delta") {
      appendVisibleStreamText(run, event.text);
      if (run.delegationProtocolHidden) {
        run.phase = "delegating";
        run.status = "Preparazione della delega\u2026";
      } else {
        run.phase = "working";
        run.status = "Risposta in corso\u2026";
      }
    } else if (event.type === "replace") {
      replaceVisibleStreamText(run, event.text);
      run.phase = run.delegationProtocolHidden ? "delegating" : "working";
      if (run.delegationProtocolHidden) run.status = "Preparazione della delega\u2026";
    } else if (event.type === "activity") {
      run.phase = "working";
      run.status = event.title;
      run.activities.push({ title: event.title, ...event.detail ? { detail: event.detail } : {} });
      run.activities = run.activities.slice(-30);
    } else if (event.type === "error") {
      run.failure = event.failure;
      run.error = event.failure?.message ?? event.message;
      run.status = event.failure?.message ?? event.message;
      run.phase = event.failure?.category === "rate-limit" ? "rate-limited" : event.failure?.category === "permission-denied" ? "permission-denied" : event.failure?.category === "authentication" ? "authentication" : "failed";
    } else if (event.type === "complete") {
      run.phase = "completed";
      run.status = "Completato";
      flushVisibleStreamBuffer(run);
      if (!run.text && !run.delegationProtocolHidden) replaceVisibleStreamText(run, event.result.text);
      if (event.result.model) run.model = event.result.model;
    }
    if ((event.type === "complete" || event.type === "error") && run.kind !== "delegation" && run.conversationId) {
      if (run.conversationId !== runtime.state?.conversation.id) {
        runtime.unseen[run.conversationId] = event.type === "error" ? "error" : "done";
        persistUi();
      }
    }
    const snapshot = runtime.scrollByConversation[run.conversationId];
    if (!snapshot || snapshot.stickToBottom) {
      runtime.scrollByConversation[run.conversationId] = { top: snapshot?.top ?? 0, stickToBottom: true };
    }
    if (runtime.state?.onboardingComplete && runtime.section === "chat") scheduleRunPatch(event.runId);
    else if (event.type !== "delta") scheduleRender();
  }
  function scheduleRunPatch(runId) {
    pendingRunPatches.add(runId);
    if (runPatchFrame !== void 0) return;
    runPatchFrame = requestAnimationFrame(() => {
      runPatchFrame = void 0;
      let fallback = false;
      for (const id of pendingRunPatches) {
        if (!patchChatRun(runtime, id)) fallback = true;
      }
      pendingRunPatches.clear();
      if (fallback) scheduleRender();
    });
  }
  var DELEGATION_PROTOCOL_OPEN = "<relay-delegate>";
  function appendVisibleStreamText(run, delta) {
    if (run.delegationProtocolHidden || !delta) return;
    const combined = `${run.delegationProtocolBuffer ?? ""}${delta}`;
    const openAt = combined.indexOf(DELEGATION_PROTOCOL_OPEN);
    if (openAt >= 0) {
      run.text += combined.slice(0, openAt);
      run.delegationProtocolBuffer = "";
      run.delegationProtocolHidden = true;
      return;
    }
    const retained = delegationProtocolPrefixLength(combined);
    run.text += retained > 0 ? combined.slice(0, -retained) : combined;
    run.delegationProtocolBuffer = retained > 0 ? combined.slice(-retained) : "";
  }
  function replaceVisibleStreamText(run, text) {
    run.text = "";
    run.delegationProtocolBuffer = "";
    run.delegationProtocolHidden = false;
    appendVisibleStreamText(run, text);
  }
  function flushVisibleStreamBuffer(run) {
    if (!run.delegationProtocolHidden && run.delegationProtocolBuffer) run.text += run.delegationProtocolBuffer;
    run.delegationProtocolBuffer = "";
  }
  function isTerminalPhase(phase) {
    return phase === "completed" || phase === "failed" || phase === "cancelled" || phase === "rate-limited" || phase === "permission-denied" || phase === "authentication";
  }
  function delegationProtocolPrefixLength(text) {
    const max = Math.min(text.length, DELEGATION_PROTOCOL_OPEN.length - 1);
    for (let length = max; length > 0; length -= 1) {
      if (DELEGATION_PROTOCOL_OPEN.startsWith(text.slice(-length))) return length;
    }
    return 0;
  }
  function applyUiCommand(action) {
    if (action === "open-chat") {
      runtime.section = "chat";
      runtime.historyOpen = false;
      runtime.usageOpen = false;
    } else if (action === "focus-composer") {
      runtime.section = "chat";
      runtime.pendingComposerFocus = true;
    } else if (action === "open-history") {
      runtime.historyOpen = true;
    } else if (action === "open-projects") {
      runtime.section = "projects";
      runtime.historyOpen = false;
      runtime.usageOpen = false;
    } else if (action === "open-agents") {
      runtime.section = "agents";
      runtime.historyOpen = false;
      runtime.usageOpen = false;
    } else if (action === "open-usage") {
      runtime.section = "usage";
      runtime.historyOpen = false;
      runtime.usageOpen = false;
    } else if (action === "open-remote") {
      runtime.section = "remote";
      runtime.historyOpen = false;
      runtime.usageOpen = false;
    } else if (action === "close-rule") {
      delete runtime.ruleDraft;
      delete runtime.selectedRuleId;
    } else if (action === "reset-ui") {
      resetUiState();
      return;
    }
    persistUi();
    scheduleRender();
  }
  function ensureStream(runId) {
    const existing = runtime.streams.get(runId);
    if (existing) return existing;
    const active = runtime.state?.activeRuns.find((run) => run.id === runId);
    const provider = active?.provider ?? runtime.state?.conversation.provider ?? "codex";
    const created = {
      runId,
      conversationId: active?.conversationId ?? runtime.state?.conversation.id ?? "",
      provider,
      text: "",
      status: active?.status ?? "Avvio agente\u2026",
      phase: active?.phase ?? "connecting",
      activities: [],
      startedAt: active ? new Date(active.startedAt).getTime() : Date.now(),
      ...active?.model ? { model: active.model } : {},
      ...active?.reasoning ? { reasoning: active.reasoning } : {},
      ...active?.agentId ? { agentId: String(active.agentId) } : {},
      ...active?.agentName ? { agentName: String(active.agentName) } : {},
      ...active?.kind ? { kind: active.kind } : {},
      ...active?.parentRunId ? { parentRunId: active.parentRunId } : {},
      ...active?.rootRunId ? { rootRunId: active.rootRunId } : {},
      ...active?.taskLabel ? { taskLabel: active.taskLabel } : {}
    };
    runtime.streams.set(runId, created);
    return created;
  }
  function scheduleRender(delayMs = 0) {
    if (renderScheduled && delayMs > 0) return;
    if (renderTimer !== void 0) window.clearTimeout(renderTimer);
    renderScheduled = true;
    const execute = () => {
      renderTimer = void 0;
      requestAnimationFrame(() => {
        renderScheduled = false;
        render();
      });
    };
    if (delayMs > 0) renderTimer = window.setTimeout(execute, delayMs);
    else execute();
  }
  function render() {
    try {
      captureTransientUi();
      for (const menu of Array.from(document.body.querySelectorAll(":scope > [data-picker-menu-owner]"))) menu.remove();
      root.replaceChildren();
      if (!runtime.state) {
        root.append(renderBootScreen());
        return;
      }
      runtime.section = normalizeSection(runtime.section);
      root.append(runtime.state.onboardingComplete ? renderWorkspace(runtime) : renderOnboarding(runtime));
      runtime.renderedConversationId = runtime.state.conversation.id;
      lastRenderError = "";
      restoreTransientUi();
    } catch (error) {
      renderFailure(error);
    }
  }
  function renderBootScreen() {
    const loading = document.createElement("main");
    loading.className = `boot-screen${bootFailure ? " has-error" : ""}`;
    const stage = Math.floor((Date.now() - bootStartedAt) / 1800) % 3;
    const messages = ["Avvio workspace e storage\u2026", "Verifica provider locali\u2026", "Preparazione interfaccia\u2026"];
    loading.innerHTML = '<div class="boot-orbit" aria-hidden="true"><span></span><span></span><span></span><span></span><i></i></div><div class="boot-copy"><strong>Relay</strong><p>' + (bootFailure ? "Avvio parziale" : messages[stage]) + '</p><div class="boot-progress"><span></span></div></div>';
    if (bootFailure || Date.now() - bootStartedAt > 7e3) {
      const recovery = document.createElement("section");
      recovery.className = "boot-recovery";
      const text = document.createElement("span");
      text.textContent = bootFailure || "Il caricamento sta richiedendo pi\xF9 del previsto. Relay pu\xF2 aprirsi anche se un controllo opzionale \xE8 lento.";
      const retry = document.createElement("button");
      retry.className = "button button--secondary button--small";
      retry.textContent = "Riprova";
      retry.addEventListener("click", () => {
        bootFailure = "";
        runtime.post({ type: "initialize" });
        scheduleRender();
      });
      const reset = document.createElement("button");
      reset.className = "button button--ghost button--small";
      reset.textContent = "Ripristina interfaccia";
      reset.addEventListener("click", resetUiState);
      recovery.append(text, retry, reset);
      loading.append(recovery);
    }
    return loading;
  }
  function renderFailure(error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const signature = `${normalized.name}:${normalized.message}:${normalized.stack ?? ""}`;
    if (signature !== lastRenderError) {
      lastRenderError = signature;
      reportUiError(normalized);
    }
    root.replaceChildren();
    const failure = document.createElement("main");
    failure.className = "ui-failure-screen";
    const mark = document.createElement("div");
    mark.className = "ui-failure-mark";
    mark.textContent = "!";
    const title = document.createElement("strong");
    title.textContent = "Relay non \xE8 riuscito a mostrare questa schermata";
    const message = document.createElement("p");
    message.textContent = normalized.message || "Stato dell\u2019interfaccia non valido.";
    const actions = document.createElement("div");
    actions.className = "ui-failure-actions";
    const reset = document.createElement("button");
    reset.className = "button button--primary";
    reset.textContent = "Ripristina interfaccia";
    reset.addEventListener("click", resetUiState);
    const diagnostics = document.createElement("button");
    diagnostics.className = "button button--secondary";
    diagnostics.textContent = "Apri Diagnostica";
    diagnostics.addEventListener("click", () => {
      runtime.section = "diagnostics";
      persistUi();
      scheduleRender();
    });
    actions.append(reset, diagnostics);
    failure.append(mark, title, message, actions);
    root.append(failure);
  }
  function resetUiState() {
    vscode.setState({ section: "chat", search: "", onboardingStep: 0 });
    runtime.section = "chat";
    runtime.search = "";
    runtime.onboardingStep = 0;
    runtime.drafts = {};
    runtime.expandedPanels.clear();
    runtime.expandedProjects.clear();
    runtime.projectsVisibleLimit = 5;
    runtime.projectSearch = "";
    runtime.unseen = {};
    delete runtime.selectedRuleId;
    delete runtime.ruleDraft;
    delete runtime.remoteTab;
    delete runtime.remoteHistoryPage;
    lastRenderError = "";
    runtime.post({ type: "initialize" });
    scheduleRender();
  }
  function reportUiError(error) {
    runtime.post({ type: "reportUiError", payload: { message: error.message, stack: error.stack ?? "" } });
  }
  function normalizeSection(value) {
    return VALID_SECTIONS.includes(value) ? value : "chat";
  }
  function safePersistedState(value) {
    if (!value || typeof value !== "object") return void 0;
    return {
      section: normalizeSection(value.section),
      search: typeof value.search === "string" ? value.search : "",
      onboardingStep: Number.isFinite(value.onboardingStep) ? Math.max(0, Math.floor(value.onboardingStep)) : 0,
      ...typeof value.selectedRuleId === "string" ? { selectedRuleId: value.selectedRuleId } : {},
      ...value.drafts && typeof value.drafts === "object" ? { drafts: value.drafts } : {},
      ...Array.isArray(value.expandedPanels) ? { expandedPanels: value.expandedPanels.filter((entry) => typeof entry === "string") } : {},
      ...Number.isFinite(value.projectsVisibleLimit) ? { projectsVisibleLimit: Math.max(1, Math.floor(value.projectsVisibleLimit)) } : {},
      ...typeof value.projectSearch === "string" ? { projectSearch: value.projectSearch } : {},
      ...value.unseenByConversation && typeof value.unseenByConversation === "object" ? { unseenByConversation: value.unseenByConversation } : {}
    };
  }
  function normalizeDrafts(value) {
    const result = {};
    if (!value || typeof value !== "object") return result;
    for (const [conversationId, draft] of Object.entries(value)) {
      if (typeof draft === "string") result[conversationId] = { text: draft, attachments: [] };
      else if (draft && typeof draft === "object") result[conversationId] = { text: typeof draft.text === "string" ? draft.text : "", attachments: [] };
    }
    return result;
  }
  function ensureDraft(conversationId) {
    var _a;
    return (_a = runtime.drafts)[conversationId] ?? (_a[conversationId] = { text: "", attachments: [] });
  }
  async function saveAttachments(attachments) {
    const payload = await Promise.all(attachments.map(async (attachment) => {
      if (!attachment.file) throw new Error(`Il file ${attachment.name} non \xE8 pi\xF9 disponibile nella bozza.`);
      return {
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
        bytes: new Uint8Array(await attachment.file.arrayBuffer())
      };
    }));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        attachmentRequests.delete(requestId);
        reject(new Error("Salvataggio degli allegati non completato entro 30 secondi."));
      }, 3e4);
      attachmentRequests.set(requestId, {
        resolve(files) {
          window.clearTimeout(timeout);
          resolve(files);
        },
        reject(error) {
          window.clearTimeout(timeout);
          reject(error);
        }
      });
      try {
        runtime.post({ type: "saveChatAttachments", payload: { requestId, attachments: payload } });
      } catch (error) {
        window.clearTimeout(timeout);
        attachmentRequests.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  function captureTransientUi() {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      if (active.id) transientFocus = { id: active.id, start: active.selectionStart ?? void 0, end: active.selectionEnd ?? void 0 };
    } else if (active instanceof HTMLElement && active.id) {
      transientFocus = { id: active.id };
    }
    const sectionScroll = document.querySelector(".content-page");
    if (sectionScroll && runtime.section !== "chat") runtime.scrollBySection[runtime.section] = sectionScroll.scrollTop;
    const conversationId = runtime.renderedConversationId ?? runtime.state?.conversation.id;
    if (!conversationId) return;
    const textarea = document.querySelector("#relay-composer-input");
    if (textarea) ensureDraft(conversationId).text = textarea.value;
    const scroll = document.querySelector(".message-scroll");
    if (scroll) {
      const distance = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
      runtime.scrollByConversation[conversationId] = {
        top: scroll.scrollTop,
        stickToBottom: distance < 96
      };
    }
  }
  function restoreTransientUi() {
    const sectionScroll = document.querySelector(".content-page");
    const sectionTop = runtime.scrollBySection[runtime.section];
    if (sectionScroll && runtime.section !== "chat" && sectionTop !== void 0) {
      sectionScroll.scrollTop = Math.min(sectionTop, Math.max(0, sectionScroll.scrollHeight - sectionScroll.clientHeight));
      sectionScroll.addEventListener("scroll", () => {
        runtime.scrollBySection[runtime.section] = sectionScroll.scrollTop;
      }, { passive: true });
    }
    const conversationId = runtime.state?.conversation.id;
    if (!conversationId) return;
    const scroll = document.querySelector(".message-scroll");
    const snapshot = runtime.scrollByConversation[conversationId];
    if (scroll && snapshot) {
      if (snapshot.stickToBottom) scroll.scrollTop = scroll.scrollHeight;
      else scroll.scrollTop = Math.min(snapshot.top, Math.max(0, scroll.scrollHeight - scroll.clientHeight));
      scroll.addEventListener("scroll", () => {
        const distance = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
        runtime.scrollByConversation[conversationId] = { top: scroll.scrollTop, stickToBottom: distance < 96 };
      }, { passive: true });
    }
    const textarea = document.querySelector("#relay-composer-input");
    if (textarea && runtime.pendingComposerFocus) {
      runtime.pendingComposerFocus = false;
      transientFocus = void 0;
      requestAnimationFrame(() => textarea.focus({ preventScroll: true }));
      return;
    }
    const focus = transientFocus;
    transientFocus = void 0;
    if (!focus) return;
    const node = document.getElementById(focus.id);
    if (!(node instanceof HTMLElement)) return;
    node.focus({ preventScroll: true });
    if ((node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) && focus.start !== void 0) {
      const end = focus.end ?? focus.start;
      node.setSelectionRange(Math.min(focus.start, node.value.length), Math.min(end, node.value.length));
    }
  }
  function persistUi() {
    vscode.setState({
      section: runtime.section,
      search: runtime.search,
      onboardingStep: runtime.onboardingStep,
      drafts: Object.fromEntries(Object.entries(runtime.drafts).map(([id, draft]) => [id, { text: draft.text }])),
      expandedPanels: [...runtime.expandedPanels],
      projectsVisibleLimit: runtime.projectsVisibleLimit,
      projectSearch: runtime.projectSearch,
      unseenByConversation: runtime.unseen,
      ...runtime.selectedRuleId ? { selectedRuleId: runtime.selectedRuleId } : {}
    });
  }
  window.addEventListener("beforeunload", () => {
    for (const draft of Object.values(runtime.drafts)) for (const attachment of draft.attachments) if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    if (bootTicker !== void 0) window.clearInterval(bootTicker);
    if (runPatchFrame !== void 0) cancelAnimationFrame(runPatchFrame);
  });
})();
//# sourceMappingURL=webview.js.map
