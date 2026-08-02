export function remoteHtml(nonce = ""): string {
  return String.raw`<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#101010">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/relay-remote.svg" type="image/svg+xml">
<title>Relay Remote</title>
<style>
:root {
  color-scheme: dark;
  --amber: #ffb000;
  --amber-strong: #ffc44d;
  --success: #2ecc71;
  --info: #3a7afe;
  --danger: #ff5c68;
  --bg: #101010;
  --surface: #1a1a1a;
  --card: #202020;
  --card-2: #292929;
  --line: #383838;
  --line-soft: rgba(255, 255, 255, 0.075);
  --text: #ededed;
  --muted: #a0a0a0;
  --muted-2: #717171;
  --radius: 16px;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --header-h: 68px;
  --nav-h: 68px;
  --composer-h: 126px;
  --keyboard-offset: 0px;
  font-family:
    Inter,
    ui-sans-serif,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}
* {
  box-sizing: border-box;
  min-width: 0;
  -webkit-tap-highlight-color: transparent;
}
html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
  overflow-x: hidden;
}
body {
  overscroll-behavior: none;
  background:
    radial-gradient(
      520px 280px at 88% -8%,
      rgba(255, 176, 0, 0.07),
      transparent 64%
    ),
    var(--bg);
}
button,
input,
textarea {
  font: inherit;
  color: inherit;
}
button {
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
input,
textarea {
  outline: none;
}
svg {
  display: block;
}
.app-shell {
  height: 100dvh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
}
.appbar {
  height: calc(var(--header-h) + var(--safe-top));
  padding: calc(10px + var(--safe-top)) 14px 10px;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--line-soft);
  background: rgba(16, 16, 16, 0.96);
  backdrop-filter: blur(18px);
  z-index: 30;
}
.icon-btn {
  width: 44px;
  height: 44px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  display: grid;
  place-items: center;
  color: var(--text);
}
.icon-btn svg {
  width: 20px;
  height: 20px;
}
.icon-btn:active {
  background: var(--card);
}
.appbar-copy {
  border: 0;
  background: transparent;
  text-align: left;
  overflow: hidden;
  padding: 2px 0;
}
.appbar-copy strong,
.appbar-copy span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.appbar-copy strong {
  font-size: 19px;
  letter-spacing: -0.025em;
}
.appbar-copy strong svg {
  display: inline-block;
  width: 14px;
  height: 14px;
  vertical-align: -2px;
  margin-left: 2px;
}
.appbar-copy span {
  margin-top: 3px;
  color: var(--muted);
  font-size: 11px;
}
.connection-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 3px rgba(46, 204, 113, 0.12);
  vertical-align: 1px;
}
.connection-dot.reconnecting {
  background: var(--amber);
  box-shadow: 0 0 0 3px rgba(255, 176, 0, 0.12);
}
.connection-dot.offline {
  background: var(--danger);
  box-shadow: 0 0 0 3px rgba(255, 92, 104, 0.12);
}
.connection-banner {
  position: absolute;
  top: calc(var(--header-h) + var(--safe-top) + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 35;
  max-width: calc(100vw - 28px);
  padding: 8px 12px;
  border: 1px solid rgba(255, 176, 0, 0.26);
  border-radius: 999px;
  background: #261e10;
  color: #ffd67e;
  font-size: 11px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
  display: flex;
  align-items: center;
  gap: 8px;
}
.connection-banner button {
  min-height: 30px;
  border: 1px solid rgba(255, 176, 0, 0.35);
  border-radius: 999px;
  background: transparent;
  color: var(--amber);
  padding: 0 10px;
}
.reconnect-overlay {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(10, 10, 10, 0.9);
  backdrop-filter: blur(12px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}
.reconnect-overlay.show {
  opacity: 1;
  pointer-events: auto;
}
.reconnect-card {
  display: grid;
  justify-items: center;
  gap: 12px;
  text-align: center;
}
.reconnect-logo {
  width: 58px;
  height: 58px;
  border: 1px solid rgba(255, 176, 0, 0.42);
  border-radius: 18px;
  color: var(--amber);
  display: grid;
  place-items: center;
  animation: pulse 1.5s ease-in-out infinite;
}
.reconnect-logo svg {
  width: 29px;
  height: 29px;
}
.reconnect-card strong {
  font-size: 18px;
}
.reconnect-card span {
  color: var(--muted);
  font-size: 11px;
  max-width: 280px;
  overflow-wrap: anywhere;
}
.page-scroll {
  min-height: 0;
  overflow: auto;
  padding: 16px 16px calc(24px + var(--safe-bottom));
  scrollbar-width: thin;
  overscroll-behavior: contain;
}
.page {
  width: min(720px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 14px;
}
.page-intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 2px 4px;
}
.page-intro p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
}
.page-intro .count {
  flex: 0 0 auto;
}
.count {
  min-width: 34px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 11px;
}
.card {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: linear-gradient(180deg, #202020, #191919);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}
.card-body {
  padding: 15px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.glyph {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: #151515;
  display: grid;
  place-items: center;
  color: var(--amber);
  font-weight: 800;
}
.glyph svg {
  width: 21px;
  height: 21px;
}
.identity-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.identity-copy strong,
.identity-copy span,
.identity-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.identity-copy strong {
  font-size: 15px;
}
.identity-copy span {
  color: var(--muted);
  font-size: 12px;
}
.identity-copy small {
  color: var(--muted-2);
  font-size: 10px;
}
.status {
  min-height: 29px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 10px;
  white-space: nowrap;
}
.status:before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted-2);
}
.status.ready {
  color: var(--success);
  border-color: rgba(46, 204, 113, 0.28);
}
.status.ready:before {
  background: var(--success);
}
.status.limited {
  color: var(--amber);
  border-color: rgba(255, 176, 0, 0.28);
}
.status.limited:before {
  background: var(--amber);
}
.status.bad {
  color: var(--danger);
  border-color: rgba(255, 92, 104, 0.28);
}
.status.bad:before {
  background: var(--danger);
}
.btn {
  min-height: 44px;
  padding: 0 15px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 750;
  font-size: 13px;
}
.btn svg {
  width: 18px;
  height: 18px;
}
.btn.primary {
  background: linear-gradient(180deg, var(--amber-strong), var(--amber));
  color: #1b1200;
  border-color: rgba(255, 176, 0, 0.85);
  box-shadow: 0 12px 28px rgba(255, 176, 0, 0.15);
}
.btn.ghost {
  background: transparent;
  color: var(--muted);
}
.btn.wide {
  width: 100%;
}
.btn.danger {
  color: #ff9ea6;
  border-color: rgba(255, 92, 104, 0.3);
  background: rgba(255, 92, 104, 0.07);
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 13px;
}
.actions .btn {
  flex: 1 1 120px;
}
.section-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin: 2px;
  color: var(--muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.09em;
}
.empty {
  min-height: 132px;
  border: 1px dashed var(--line);
  border-radius: var(--radius);
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 22px;
  text-align: center;
  color: var(--muted);
}
.empty svg {
  width: 25px;
  height: 25px;
}
.empty strong {
  color: var(--text);
  font-size: 14px;
}
.empty p {
  margin: 0;
  max-width: 340px;
  font-size: 12px;
  line-height: 1.5;
}
.search {
  height: 46px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 13px;
}
.search svg {
  width: 18px;
  height: 18px;
  color: var(--muted);
}
.search input {
  width: 100%;
  border: 0;
  background: transparent;
}
.search input::placeholder {
  color: var(--muted-2);
}
.filters {
  display: flex;
  gap: 8px;
  overflow: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.filters::-webkit-scrollbar {
  display: none;
}
.filter {
  min-height: 38px;
  padding: 0 13px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  white-space: nowrap;
  color: var(--muted);
  font-size: 12px;
}
.filter.on {
  color: #1c1300;
  background: var(--amber);
  border-color: var(--amber);
  font-weight: 850;
}
.bottom-nav {
  height: calc(var(--nav-h) + var(--safe-bottom));
  padding: 6px 8px calc(6px + var(--safe-bottom));
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 3px;
  border-top: 1px solid var(--line-soft);
  background: rgba(16, 16, 16, 0.97);
  z-index: 30;
}
.nav-btn {
  position: relative;
  min-height: 54px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--muted);
  display: grid;
  place-items: center;
  align-content: center;
  gap: 4px;
  font-size: 10px;
}
.nav-btn svg {
  width: 19px;
  height: 19px;
}
.nav-btn.on {
  color: var(--amber);
  background: rgba(255, 176, 0, 0.09);
}
.nav-badge {
  position: absolute;
  top: 4px;
  left: calc(50% + 6px);
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--amber);
  color: #1b1200;
  display: grid;
  place-items: center;
  font-size: 9px;
  font-weight: 900;
}
.chat-area {
  min-height: 0;
  position: relative;
  overflow: hidden;
}
.thread {
  height: 100%;
  overflow: auto;
  padding: 14px 16px calc(var(--composer-h) + 22px);
  scrollbar-width: thin;
  overflow-anchor: none;
  overscroll-behavior: contain;
}
.thread-inner {
  width: min(720px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 13px;
}
.day-label {
  text-align: center;
  color: var(--muted-2);
  font-size: 10px;
  margin: 2px 0;
}
.message-wrap {
  display: grid;
  gap: 6px;
}
.message-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 10px;
  padding: 0 5px;
}
.message-meta .provider-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--amber);
}
.bubble {
  max-width: min(88%, 650px);
  border: 1px solid var(--line);
  border-radius: 17px;
  padding: 13px 14px;
  font-size: 14px;
  line-height: 1.58;
  overflow-wrap: anywhere;
}
.bubble.user {
  justify-self: end;
  background: linear-gradient(180deg, #49350f, #332408);
  border-color: rgba(255, 176, 0, 0.34);
  border-bottom-right-radius: 6px;
}
.bubble.assistant {
  justify-self: start;
  background: linear-gradient(180deg, #242424, #1b1b1b);
  border-bottom-left-radius: 6px;
}
.bubble.error {
  border-color: rgba(255, 92, 104, 0.4);
}
.bubble p {
  margin: 0 0 9px;
}
.bubble p:last-child {
  margin-bottom: 0;
}
.bubble ul,
.bubble ol {
  margin: 8px 0;
  padding-left: 20px;
}
.bubble li {
  margin: 4px 0;
}
.bubble code {
  padding: 2px 5px;
  border-radius: 6px;
  background: #0d0d0d;
  border: 1px solid var(--line-soft);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.bubble pre {
  max-width: 100%;
  overflow-x: auto;
  margin: 10px 0;
  padding: 12px;
  border-radius: 12px;
  background: #0c0c0c;
  border: 1px solid var(--line-soft);
}
.message-actions {
  display: flex;
  gap: 3px;
  margin-left: 4px;
}
.message-action {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: var(--muted);
  display: grid;
  place-items: center;
}
.message-action:active {
  background: var(--surface);
}
.message-action svg {
  width: 17px;
  height: 17px;
}
.message-artifacts {
  display: grid;
  gap: 8px;
  max-width: min(92%, 650px);
  margin-top: 2px;
}
.artifact-card {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: linear-gradient(180deg, #202020, #181818);
  padding: 11px;
  display: grid;
  gap: 10px;
}
.artifact-main {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}
.artifact-icon {
  width: 38px;
  height: 38px;
  border: 1px solid rgba(255, 176, 0, 0.28);
  border-radius: 11px;
  background: rgba(255, 176, 0, 0.06);
  color: var(--amber);
  display: grid;
  place-items: center;
}
.artifact-icon svg {
  width: 19px;
  height: 19px;
}
.artifact-copy {
  display: grid;
  gap: 3px;
}
.artifact-copy strong,
.artifact-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.artifact-copy strong {
  font-size: 12px;
}
.artifact-copy span {
  color: var(--muted);
  font-size: 10px;
}
.artifact-actions {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}
.artifact-link {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: #151515;
  color: var(--text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  text-decoration: none;
  font-size: 11px;
  font-weight: 750;
}
.artifact-link.primary {
  border-color: rgba(255, 176, 0, 0.42);
  background: rgba(255, 176, 0, 0.1);
  color: var(--amber);
}
.artifact-link svg {
  width: 16px;
  height: 16px;
}
.live-card {
  border: 1px solid rgba(255, 176, 0, 0.34);
  border-radius: var(--radius);
  background: linear-gradient(180deg, rgba(255, 176, 0, 0.08), #181818);
  overflow: hidden;
}
.live-main {
  padding: 13px 14px;
  display: grid;
  gap: 7px;
}
.live-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.live-title {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 800;
  font-size: 14px;
}
.pulse {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--amber);
  box-shadow: 0 0 0 4px rgba(255, 176, 0, 0.11);
  animation: pulse 1.5s ease-in-out infinite;
}
.elapsed {
  color: var(--muted);
  font-size: 11px;
}
.live-phase {
  color: var(--text);
  font-size: 12px;
}
.live-last {
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.live-detail-toggle {
  justify-self: start;
  border: 0;
  background: transparent;
  color: var(--amber);
  padding: 4px 0;
  font-size: 11px;
}
.live-details {
  border-top: 1px solid var(--line-soft);
  padding: 12px 14px;
  display: grid;
  gap: 8px;
}
.activity-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  color: var(--muted);
  font-size: 11px;
}
.activity-row b {
  color: var(--text);
  font-weight: 650;
}
.activity-row .step {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--line);
  display: grid;
  place-items: center;
  color: var(--amber);
  font-size: 10px;
}
.live-output {
  max-height: 124px;
  overflow: auto;
  padding: 10px;
  border: 1px solid var(--line-soft);
  border-radius: 11px;
  background: #0d0d0d;
  color: #c8d6c8;
  font:
    10px/1.45 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  white-space: pre-wrap;
}
.error-recovery {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 3px;
}
.error-recovery .btn {
  min-height: 42px;
}
.recovery-unavailable {
  color: var(--muted);
  font-size: 11px;
}
.composer-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(
    var(--nav-h) + var(--safe-bottom) + 8px + var(--keyboard-offset)
  );
  z-index: 28;
  padding: 0 14px;
  pointer-events: none;
}
.composer {
  pointer-events: auto;
  width: min(720px, 100%);
  margin: 0 auto;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: rgba(30, 30, 30, 0.98);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.46);
  padding: 11px;
  display: grid;
  gap: 9px;
}
.composer textarea {
  width: 100%;
  min-height: 52px;
  max-height: 130px;
  resize: none;
  border: 0;
  background: transparent;
  padding: 1px 2px;
  color: var(--text);
  line-height: 1.45;
}
.composer textarea::placeholder {
  color: var(--muted-2);
}
.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
}
.composer-selection {
  min-height: 40px;
  max-width: calc(100% - 106px);
  padding: 0 12px;
  border: 1px solid rgba(255, 176, 0, 0.28);
  border-radius: 999px;
  background: rgba(255, 176, 0, 0.055);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  font-size: 12px;
  overflow: hidden;
}
.composer-selection span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.provider-mark {
  width: 23px;
  height: 23px;
  border: 1px solid rgba(255, 176, 0, 0.28);
  border-radius: 8px;
  background: #151515;
  color: var(--amber);
  display: grid;
  place-items: center;
  font-size: 9px;
  font-weight: 900;
  flex: 0 0 auto;
}
.composer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.send-round {
  width: 46px;
  height: 46px;
  border: 0;
  border-radius: 50%;
  background: var(--amber);
  color: #1b1200;
  display: grid;
  place-items: center;
  box-shadow: 0 10px 24px rgba(255, 176, 0, 0.18);
}
.send-round svg {
  width: 21px;
  height: 21px;
}
.send-round.stop {
  background: rgba(255, 92, 104, 0.14);
  color: #ff97a0;
  border: 1px solid rgba(255, 92, 104, 0.42);
  box-shadow: none;
}
.remote-mention-panel {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #191919;
  overflow: hidden;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.36);
}
.remote-mention-panel[hidden] { display: none; }
.remote-mention-option {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  text-align: left;
}
.remote-mention-option.active,
.remote-mention-option:hover { background: rgba(255, 176, 0, 0.1); }
.remote-mention-option span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.remote-mention-option small {
  color: var(--muted);
  flex: 0 0 auto;
}
.remote-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.remote-attachment {
  min-height: 28px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  font-size: 11px;
}
.remote-attachment button {
  border: 0;
  background: transparent;
  color: var(--muted-2);
  padding: 0;
}
.composer-hint {
  color: var(--muted);
  font-size: 11px;
}
.new-messages {
  position: absolute;
  right: 20px;
  bottom: calc(var(--composer-h) + 34px);
  z-index: 12;
  min-height: 38px;
  padding: 0 13px;
  border: 1px solid rgba(255, 176, 0, 0.35);
  border-radius: 999px;
  background: #261e10;
  color: #ffd477;
  display: none;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.34);
}
.new-messages.show {
  display: flex;
}
.overlay-root {
  position: fixed;
  inset: 0;
  z-index: 70;
  pointer-events: none;
}
.backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.64);
  backdrop-filter: blur(2px);
  pointer-events: auto;
}
.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: min(84dvh, 760px);
  border: 1px solid var(--line);
  border-bottom: 0;
  border-radius: 24px 24px 0 0;
  background: #1b1b1b;
  box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
  animation: sheetIn 0.2s ease-out;
}
.sheet-handle {
  width: 46px;
  height: 5px;
  border-radius: 99px;
  background: #5d5d5d;
  margin: 9px auto 4px;
}
.sheet-head {
  padding: 10px 16px 13px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.sheet-head strong {
  display: block;
  font-size: 18px;
}
.sheet-head span {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
}
.sheet-body {
  min-height: 0;
  overflow: auto;
  padding: 0 14px 14px;
}
.sheet-footer {
  padding: 10px 14px calc(10px + var(--safe-bottom));
  border-top: 1px solid var(--line-soft);
  background: #1b1b1b;
}
.sheet-list {
  display: grid;
  gap: 8px;
}
.sheet-option {
  width: 100%;
  min-height: 66px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  text-align: left;
}
.sheet-option.active {
  border-color: rgba(255, 176, 0, 0.58);
  background: linear-gradient(90deg, rgba(255, 176, 0, 0.12), #1d1d1d);
}
.sheet-option-copy {
  display: grid;
  gap: 3px;
}
.sheet-option-copy strong {
  font-size: 13px;
}
.sheet-option-copy span {
  color: var(--muted);
  font-size: 10px;
  line-height: 1.4;
}
.radio {
  width: 24px;
  height: 24px;
  border: 1px solid var(--line);
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #1b1200;
}
.sheet-option.active .radio {
  background: var(--amber);
  border-color: var(--amber);
}
.sheet-info {
  margin-top: 10px;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: #151515;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}
.recommended {
  margin-left: 7px;
  padding: 3px 6px;
  border-radius: 999px;
  background: rgba(255, 176, 0, 0.14);
  color: var(--amber);
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.update-form {
  display: grid;
  gap: 10px;
}
.update-form label {
  color: var(--muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.update-form input {
  width: 100%;
  height: 48px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: #141414;
  padding: 0 12px;
  font-size: 12px;
}
.update-warning {
  padding: 12px;
  border: 1px solid rgba(255, 176, 0, 0.3);
  border-radius: 13px;
  background: rgba(255, 176, 0, 0.07);
  color: #ffd887;
  font-size: 11px;
  line-height: 1.5;
}
.drawer {
  position: fixed;
  inset: 0 auto 0 0;
  width: min(88vw, 380px);
  background: #1a1a1a;
  border-right: 1px solid var(--line);
  box-shadow: 24px 0 70px rgba(0, 0, 0, 0.52);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  animation: drawerIn 0.2s ease-out;
}
.drawer-head {
  padding: calc(12px + var(--safe-top)) 16px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--line-soft);
}
.drawer-head strong {
  font-size: 19px;
}
.drawer-project {
  margin: 12px 14px 8px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 15px;
  background: var(--surface);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}
.drawer-project-copy {
  display: grid;
  gap: 3px;
}
.drawer-project-copy small {
  color: var(--muted);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.drawer-project-copy strong,
.drawer-project-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.drawer-project-copy strong {
  font-size: 14px;
}
.drawer-project-copy span {
  color: var(--muted);
  font-size: 10px;
}
.drawer-scroll {
  min-height: 0;
  overflow: auto;
  padding: 4px 14px 14px;
}
.drawer-section {
  display: grid;
  gap: 8px;
  margin-top: 13px;
}
.drawer-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--muted);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.09em;
}
.conversation-row {
  width: 100%;
  min-height: 64px;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  text-align: left;
}
.conversation-row.active {
  border-color: rgba(255, 176, 0, 0.36);
}
.conversation-copy {
  display: grid;
  gap: 3px;
}
.conversation-copy strong,
.conversation-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conversation-copy strong {
  font-size: 12px;
}
.conversation-copy span {
  color: var(--muted);
  font-size: 10px;
}
.conversation-state {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted-2);
}
.conversation-state.running {
  background: var(--amber);
  box-shadow: 0 0 0 4px rgba(255, 176, 0, 0.1);
}
.conversation-state.done {
  background: var(--success);
}
.conversation-state.error {
  background: var(--danger);
}
.drawer-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 14px;
}
.pair-shell {
  height: 100dvh;
  overflow: auto;
  padding: calc(18px + var(--safe-top)) 16px calc(22px + var(--safe-bottom));
  display: grid;
  place-items: center;
}
.pair-card {
  width: min(460px, 100%);
  border: 1px solid var(--line);
  border-radius: 22px;
  background: linear-gradient(180deg, #202020, #171717);
  padding: 20px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
}
.pair-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-mark {
  width: 38px;
  height: 38px;
  border: 1px solid rgba(255, 176, 0, 0.42);
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--amber);
}
.brand-mark svg {
  width: 22px;
  height: 22px;
}
.pair-brand strong {
  font-size: 16px;
}
.pair-brand span {
  display: block;
  margin-top: 2px;
  color: var(--muted);
  font-size: 10px;
}
.pair-card h1 {
  margin: 20px 0 7px;
  font-size: 30px;
  letter-spacing: -0.045em;
}
.pair-card > p {
  margin: 0 0 18px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
.field {
  display: grid;
  gap: 7px;
  margin-top: 14px;
}
.field label,
.otp-label {
  color: var(--muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.09em;
}
.field input {
  height: 50px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #151515;
  padding: 0 13px;
}
.otp-label {
  margin-top: 18px;
}
.otp {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 7px;
  margin-top: 8px;
}
.otp input {
  width: 100%;
  height: 56px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: #151515;
  text-align: center;
  font-size: 23px;
  font-weight: 800;
}
.otp input:focus {
  border-color: var(--amber);
  box-shadow: 0 0 0 3px rgba(255, 176, 0, 0.12);
}
.pair-help {
  margin-top: 8px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.45;
}
.pair-error {
  min-height: 19px;
  margin-top: 10px;
  color: #ff8d96;
  font-size: 11px;
}
.pair-actions {
  display: grid;
  gap: 9px;
  margin-top: 8px;
}
.security-copy {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 14px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.45;
}
.security-copy svg {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
}
.spinner {
  width: 17px;
  height: 17px;
  border: 2px solid rgba(0, 0, 0, 0.26);
  border-top-color: #1b1200;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.loading,
.offline {
  height: 100dvh;
  display: grid;
  place-items: center;
  padding: 20px;
}
.loading-inner,
.offline-card {
  text-align: center;
}
.loader {
  display: flex;
  gap: 6px;
  justify-content: center;
  margin-bottom: 16px;
}
.loader i {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  border: 1px solid var(--amber);
  animation: loader 1.1s ease-in-out infinite;
}
.loader i:nth-child(2) {
  animation-delay: 0.1s;
}
.loader i:nth-child(3) {
  animation-delay: 0.2s;
}
.loader i:nth-child(4) {
  animation-delay: 0.3s;
}
.loading strong {
  font-size: 19px;
}
.loading p,
.offline-card p {
  color: var(--muted);
  font-size: 12px;
}
.offline-card {
  max-width: 360px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--surface);
  padding: 24px;
}
.offline-card > svg {
  width: 34px;
  height: 34px;
  margin: 0 auto 12px;
  color: var(--danger);
}
.offline-card strong {
  display: block;
  font-size: 18px;
}
.offline-card .btn {
  margin-top: 12px;
}
.notice {
  position: fixed;
  left: 50%;
  bottom: calc(var(--nav-h) + var(--safe-bottom) + 18px);
  transform: translate(-50%, 18px);
  z-index: 100;
  max-width: calc(100vw - 28px);
  padding: 10px 13px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #252525;
  color: var(--text);
  font-size: 11px;
  opacity: 0;
  pointer-events: none;
  transition: 0.18s ease;
}
.notice.show {
  opacity: 1;
  transform: translate(-50%, 0);
}
.progress {
  height: 7px;
  border-radius: 999px;
  background: #343434;
  overflow: hidden;
}
.progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--amber), var(--amber-strong));
}
.usage-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.usage-metric {
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #171717;
}
.usage-metric span {
  display: block;
  color: var(--muted);
  font-size: 10px;
}
.usage-metric strong {
  display: block;
  margin-top: 5px;
  font-size: 24px;
}
.usage-provider {
  display: grid;
  gap: 12px;
}
.usage-line {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.usage-line strong {
  font-size: 15px;
}
.usage-line b {
  font-size: 22px;
  color: var(--amber);
}
.usage-buckets {
  display: grid;
  gap: 7px;
}
.usage-bucket {
  padding: 10px 11px;
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  background: #171717;
}
.usage-bucket-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted);
  font-size: 10px;
  margin-bottom: 7px;
}
.rule-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}
.toggle {
  width: 50px;
  height: 29px;
  border: 0;
  border-radius: 999px;
  background: #444;
  padding: 3px;
  display: flex;
  align-items: center;
}
.toggle i {
  width: 23px;
  height: 23px;
  border-radius: 50%;
  background: #ddd;
  transition: transform 0.16s ease;
}
.toggle.on {
  background: var(--success);
}
.toggle.on i {
  transform: translateX(21px);
}

.artifact-group {
  max-width: min(94%, 650px);
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #181818;
  overflow: hidden;
}
.artifact-group > summary {
  min-height: 48px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  list-style: none;
  font-size: 12px;
  font-weight: 800;
}
.artifact-group > summary::-webkit-details-marker {
  display: none;
}
.artifact-group-list {
  display: grid;
  gap: 8px;
  padding: 0 9px 9px;
}
.artifact-card {
  padding: 10px;
  border-radius: 13px;
}
.artifact-main {
  grid-template-columns: 44px minmax(0, 1fr);
}
.artifact-icon,
.artifact-thumb {
  width: 44px;
  height: 44px;
  border-radius: 12px;
}
.artifact-thumb {
  object-fit: cover;
  border: 1px solid var(--line);
  background: #111;
}
.artifact-copy strong {
  font-size: 12px;
}
.artifact-copy span {
  font-size: 10px;
}
.artifact-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(105px, 1fr));
  gap: 7px;
}
.artifact-link {
  min-height: 44px;
  border-radius: 12px;
}
.artifact-link.button {
  width: 100%;
}
.artifact-zip {
  min-height: 40px;
  padding: 0 11px;
  border: 1px solid rgba(255, 176, 0, 0.35);
  border-radius: 11px;
  background: rgba(255, 176, 0, 0.08);
  color: var(--amber);
  display: inline-flex;
  align-items: center;
  gap: 7px;
  text-decoration: none;
  font-size: 10px;
}
.message-link {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 7px;
  margin: 2px 1px;
  padding: 5px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #141414;
  color: var(--text);
  text-decoration: none;
  vertical-align: middle;
}
.message-link > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.message-link small {
  color: var(--muted);
  font-size: 8px;
}
.message-link svg {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
  color: var(--amber);
}
.message-link-badge {
  padding: 2px 5px;
  border-radius: 999px;
  background: rgba(255, 176, 0, 0.12);
  color: var(--amber);
  font-size: 8px;
  white-space: nowrap;
}
.preview-modal {
  position: fixed;
  inset: max(12px, var(--safe-top)) 10px calc(12px + var(--safe-bottom));
  z-index: 82;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: #151515;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  pointer-events: auto;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.62);
}
.preview-head {
  min-height: 58px;
  padding: 8px 10px 8px 14px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  gap: 10px;
}
.preview-head strong {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.preview-head a {
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 11px;
  color: var(--text);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
}
.preview-body {
  position: relative;
  min-height: 0;
  background: #0b0b0b;
}
.preview-body iframe,
.preview-body img {
  width: 100%;
  height: 100%;
  border: 0;
  object-fit: contain;
  background: #0b0b0b;
}
.preview-spinner,
.preview-error {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  background: #111;
  color: var(--muted);
  font-size: 11px;
}
.preview-spinner .spinner {
  border-color: rgba(255, 176, 0, 0.25);
  border-top-color: var(--amber);
}
.preview-error {
  display: none;
  color: #ff9aa3;
}
.preview-modal.is-loaded .preview-spinner {
  display: none;
}
.preview-modal.is-error .preview-spinner {
  display: none;
}
.preview-modal.is-error .preview-error {
  display: grid;
}
@keyframes pulse {
  50% {
    opacity: 0.45;
    transform: scale(0.88);
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes loader {
  50% {
    background: var(--amber);
    transform: translateY(-4px);
  }
}
@keyframes sheetIn {
  from {
    transform: translateY(24px);
    opacity: 0;
  }
}
@keyframes drawerIn {
  from {
    transform: translateX(-30px);
    opacity: 0;
  }
}
@media (max-width: 390px) {
  .appbar {
    padding-left: 10px;
    padding-right: 10px;
  }
  .thread,
  .page-scroll {
    padding-left: 12px;
    padding-right: 12px;
  }
  .composer-wrap {
    padding-left: 10px;
    padding-right: 10px;
  }
  .pair-card {
    padding: 17px;
  }
  .otp {
    gap: 5px;
  }
  .otp input {
    height: 52px;
  }
  .bubble {
    max-width: 92%;
  }
}
@media (min-width: 760px) {
  .sheet {
    left: 50%;
    right: auto;
    width: min(620px, 94vw);
    transform: translateX(-50%);
  }
  .drawer {
    width: 380px;
  }
  .thread,
  .page-scroll {
    padding-left: 24px;
    padding-right: 24px;
  }
}
@media (orientation: landscape) and (max-height: 560px) {
  :root {
    --header-h: 58px;
    --nav-h: 58px;
    --composer-h: 104px;
  }
  .appbar {
    padding-top: calc(6px + var(--safe-top));
    padding-bottom: 6px;
  }
  .bottom-nav {
    padding-top: 3px;
  }
  .nav-btn {
    min-height: 48px;
  }
  .composer textarea {
    min-height: 34px;
  }
  .pair-shell {
    align-items: start;
  }
  .pair-card {
    margin-top: 6px;
  }
  .pair-card h1 {
    font-size: 25px;
    margin-top: 14px;
  }
}
body.keyboard-open .bottom-nav {
  display: none;
}
body.keyboard-open .composer-wrap {
  bottom: calc(8px + var(--safe-bottom) + var(--keyboard-offset));
}
body.keyboard-open .thread {
  padding-bottom: calc(var(--composer-h) + 12px);
}
body.keyboard-open .notice {
  bottom: calc(var(--composer-h) + 18px);
}
@media (prefers-reduced-motion: reduce) {
  *,
  *:before,
  *:after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}

/* Relay 0.22.1 mobile polish */
:root {
  --nav-h: 64px;
  --composer-h: 106px;
}
.bottom-nav {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  height: calc(var(--nav-h) + var(--safe-bottom));
  padding-top: 5px;
}
.nav-btn {
  min-height: 51px;
  border-radius: 12px;
}
.nav-btn.on {
  background: rgba(255, 176, 0, 0.085);
}
.page-intro {
  align-items: center;
  min-height: 30px;
  padding: 0 2px 2px;
}
.page-count {
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.page-count:empty,
.status:empty,
.artifact-action:empty,
.artifact-link:empty,
.settings-chip:empty {
  display: none !important;
}
.message-link {
  max-width: 100%;
  min-height: 38px;
  margin: 3px 2px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #171717;
  color: var(--text);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  vertical-align: middle;
  font-size: 12px;
}
button.message-link {
  appearance: none;
  text-align: left;
}
.message-link svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--amber);
}
.message-link span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.message-link small {
  margin-left: auto;
  color: var(--muted);
  font-size: 9px;
  white-space: nowrap;
}
.message-link-badge {
  padding: 3px 6px;
  border-radius: 999px;
  background: rgba(255, 176, 0, 0.1);
  color: var(--amber);
  font-size: 8px;
  white-space: nowrap;
}
.message-path {
  overflow-wrap: anywhere;
}
.message-artifacts,
.artifact-group {
  width: min(94%, 650px);
  margin-top: 2px;
}
.message-artifacts {
  display: grid;
  gap: 6px;
}
.artifact-card {
  min-height: 58px;
  padding: 8px 9px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: linear-gradient(180deg, #202020, #181818);
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
}
.artifact-icon {
  width: 32px;
  height: 32px;
  border: 1px solid rgba(255, 176, 0, 0.25);
  border-radius: 9px;
  background: rgba(255, 176, 0, 0.055);
  color: var(--amber);
  display: grid;
  place-items: center;
}
.artifact-icon svg {
  width: 16px;
  height: 16px;
}
.artifact-copy {
  display: grid;
  gap: 2px;
  overflow: hidden;
}
.artifact-copy strong,
.artifact-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.artifact-copy strong {
  font-size: 12px;
}
.artifact-copy span {
  color: var(--muted);
  font-size: 9px;
}
.artifact-actions {
  display: flex;
  align-items: center;
  gap: 3px;
}
.artifact-action {
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: var(--muted);
  display: grid;
  place-items: center;
}
.artifact-action:active {
  border-color: var(--line);
  background: #252525;
}
.artifact-action-primary {
  color: var(--amber);
  background: rgba(255, 176, 0, 0.075);
  border-color: rgba(255, 176, 0, 0.18);
}
.artifact-action svg {
  width: 17px;
  height: 17px;
}
.artifact-group {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #171717;
  overflow: hidden;
}
.artifact-group summary {
  min-height: 44px;
  padding: 0 10px 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  list-style: none;
  color: var(--text);
  font-size: 12px;
  font-weight: 750;
}
.artifact-group summary::-webkit-details-marker {
  display: none;
}
.artifact-group summary b {
  margin-left: 5px;
  color: var(--muted);
  font-size: 10px;
}
.artifact-group-download {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid rgba(255, 176, 0, 0.24);
  border-radius: 10px;
  background: rgba(255, 176, 0, 0.07);
  color: var(--amber);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 750;
}
.artifact-group-download svg {
  width: 15px;
  height: 15px;
}
.artifact-group-list {
  display: grid;
  gap: 6px;
  padding: 0 7px 7px;
}
.artifact-group:not([open]) .artifact-group-list {
  display: none;
}
.composer-wrap {
  padding: 0 12px;
}
.composer {
  padding: 9px;
  gap: 7px;
  border-radius: 17px;
}
.composer textarea {
  min-height: 44px;
  padding: 2px 3px;
}
.composer-compact {
  min-height: 64px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
}
.compact-run-state {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
}
.compact-run-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.compact-run-copy strong,
.compact-run-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.compact-run-copy strong {
  font-size: 12px;
}
.compact-run-copy small {
  color: var(--muted);
  font-size: 9px;
}
.composer-compact .composer-actions {
  flex: 0 0 auto;
}
.composer-compact .icon-btn,
.composer-compact .send-round {
  width: 42px;
  height: 42px;
}
.live-card {
  margin-bottom: 3px;
}
.preview-modal {
  width: min(960px, calc(100vw - 20px));
  height: min(86dvh, 820px);
  border-radius: 18px;
  overflow: hidden;
}
.preview-head {
  min-height: 58px;
  padding: 8px 9px 8px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.preview-head strong {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.preview-head-actions {
  display: flex;
  gap: 5px;
}
.preview-icon-btn {
  width: 42px;
  height: 42px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #181818;
  color: var(--text);
  display: grid;
  place-items: center;
}
.preview-icon-btn svg {
  width: 18px;
  height: 18px;
}
.preview-body {
  position: relative;
  min-height: 0;
  flex: 1;
  background: #0d0d0d;
}
.preview-body iframe,
.preview-body img {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}
.preview-body img {
  object-fit: contain;
}
.preview-loading {
  height: 100%;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 11px;
  color: var(--muted);
  font-size: 11px;
}
.preview-error-card {
  width: min(360px, calc(100% - 28px));
  margin: 28px auto;
  padding: 17px;
  border: 1px solid rgba(255, 92, 104, 0.25);
  border-radius: 15px;
  background: rgba(255, 92, 104, 0.055);
  text-align: center;
}
.preview-error-card strong {
  display: block;
  font-size: 14px;
}
.preview-error-card p {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}
.settings-card {
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 15px;
  background: linear-gradient(180deg, #202020, #181818);
  display: grid;
  gap: 11px;
}
.settings-remote-summary {
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
}
.settings-card-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}
.settings-card-copy strong {
  font-size: 13px;
}
.settings-card-copy span {
  color: var(--muted);
  font-size: 10px;
  line-height: 1.4;
}
.settings-chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}
.settings-chips::-webkit-scrollbar {
  display: none;
}
.settings-chip,
.settings-default {
  min-height: 38px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: #171717;
  color: var(--muted);
  font-size: 10px;
  white-space: nowrap;
}
.settings-chip.on,
.settings-default.on {
  border-color: rgba(255, 176, 0, 0.42);
  background: rgba(255, 176, 0, 0.09);
  color: var(--amber);
}
.settings-provider-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
}
.more-grid {
  display: grid;
  gap: 8px;
}
.more-card {
  min-height: 66px;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  text-align: left;
}
.more-card > span:nth-child(2) {
  display: grid;
  gap: 3px;
}
.more-card strong {
  font-size: 12px;
}
.more-card small {
  color: var(--muted);
  font-size: 9px;
}
.more-card > svg {
  width: 17px;
  height: 17px;
  color: var(--muted);
}
@media (max-width: 390px) {
  .artifact-action {
    width: 36px;
    height: 36px;
  }
  .artifact-card {
    grid-template-columns: 30px minmax(0, 1fr) auto;
    padding: 7px;
    gap: 7px;
  }
  .artifact-actions {
    gap: 1px;
  }
}
</style>
</head>
<body>
<div id="root"></div>
<div id="overlay-root" class="overlay-root"></div>
<div id="connection-banner" class="connection-banner" hidden></div>
<div id="reconnect-overlay" class="reconnect-overlay" aria-live="polite"><div class="reconnect-card"><span class="reconnect-logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="4"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg></span><strong>Riconnessione a Relay…</strong><span id="reconnect-url"></span></div></div>
<div id="notice" class="notice" role="status"></div>
<script nonce="${nonce}">
"use strict";
var root = document.getElementById("root");
var overlayRoot = document.getElementById("overlay-root");
var banner = document.getElementById("connection-banner");
var reconnectOverlay = document.getElementById("reconnect-overlay");
var reconnectUrl = document.getElementById("reconnect-url");
var notice = document.getElementById("notice");
var appState = null,
  section = sessionStorage.getItem("relay_section") || "chat",
  drawerOpen = false,
  sheet = null,
  pendingSelection = null;
var sessionToken = sessionStorage.getItem("relay_session_token") || "",
  deviceName =
    sessionStorage.getItem("relay_device_name") ||
    "Telefono " + Math.floor(Math.random() * 90 + 10);
var events = null,
  reconnectTimer = null,
  reconnectOverlayTimer = null,
  reconnectDelay = 1200,
  reconnectAttempts = 0,
  pollTimer = null,
  loading = false,
  connectionState = "online";
var pendingPrompt = sessionStorage.getItem("relay_draft") || "",
  pendingRemoteAttachments = [],
  remoteMentionOptions = [],
  remoteMentionIndex = 0,
  remoteMentionRange = null,
  autoScroll = true,
  lastMessageCount = 0,
  lastConversationId = "",
  liveDetailsOpen = false;
var optimisticSend = null,
  stateSyncTimer = null,
  lastComposerSignature = "";
var pendingUpdatePath = sessionStorage.getItem("relay_update_vsix_path") || "",
  previewState = null,
  composerResizeObserver = null;
var MAX_REMOTE_ATTACHMENTS = 10,
  MAX_REMOTE_ATTACHMENT_BYTES = 20 * 1024 * 1024;
var pairingTicket = new URLSearchParams(location.search).get("t") || "";
var agentFilter = "all",
  agentSearch = "",
  ruleFilter = "all",
  ruleSearch = "",
  sheetStartY = 0;
var icons = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
  refresh:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 18.5 3.5 21v-5A8.5 8.5 0 1 1 12 20H7.5z"/></svg>',
  folder:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6.5h7l2 2h9v10H3z"/></svg>',
  agent:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  usage:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 17a8 8 0 0 1 16 0"/><path d="m12 17 4-5"/></svg>',
  rules:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
  workflow:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.2 7.2 10.8 16M15.8 7.2 13.2 16M8.5 6h7"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  tune: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m5 4 15 8-15 8 3-8z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5H5v11h3"/></svg>',
  download:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>',
  external:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6H5V6h6"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/></svg>',
  image:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-5 4 4 3-3 4 4"/></svg>',
  archive:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16v13H4zM3 4h18v3H3z"/><path d="M10 11h4"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></svg>',
  document:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  chevron:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 6 6 6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 9 6 6 6-6"/></svg>',
  shield:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  offline:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4.5 4.5 19.5 19.5M8.5 8.5A5 5 0 0 1 17 12M5 12a7 7 0 0 1 .7-3M12 19v.01"/></svg>',
  logo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="4"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-3v-.08a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.56-1.03H5v-3h.44A1.7 1.7 0 0 0 7 9.94a1.7 1.7 0 0 0-.34-1.88L6.6 8l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.69 4.7V4h3v.7a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 8l-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03H21v3h-.04A1.7 1.7 0 0 0 19.4 15Z"/></svg>',
  share:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
};
function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}
function attr(value) {
  return esc(value).split(String.fromCharCode(96)).join("&#96;");
}
function shortBytes(bytes) {
  var size = Number(bytes || 0);
  if (size >= 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + " MB";
  if (size >= 1024) return Math.round(size / 1024) + " KB";
  return size + " B";
}
function groupRemoteSkills(items) {
  var groups = new Map();
  (items || []).forEach(function (skill) {
    var name = String((skill && skill.name) || "").trim();
    if (!name) return;
    var key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name: name, description: skill.description || "" });
  });
  return Array.from(groups.values()).sort(function (a, b) { return a.name.localeCompare(b.name); });
}
function remoteMentionItems(trigger, query) {
  var q = String(query || "").toLowerCase();
  if (!appState) return [];
  if (trigger === "/") {
    return groupRemoteSkills((appState.skills && appState.skills.items) || [])
      .filter(function (skill) { return !q || skill.name.toLowerCase().indexOf(q) >= 0; })
      .slice(0, 12)
      .map(function (skill) { return { label: skill.name, detail: "Skill", token: "/" + skill.name }; });
  }
  var providers = (appState.providers || []).map(function (provider) {
    return { label: provider.label || provider.id, detail: "Provider", token: "@" + provider.id };
  });
  var conversations = (appState.conversations || []).slice(0, 12).map(function (conversation) {
    return { label: conversation.title || "Chat senza titolo", detail: "Chat", token: "@chat[" + conversation.id + "]" };
  });
  return providers.concat(conversations)
    .filter(function (item) { return !q || item.label.toLowerCase().indexOf(q) >= 0 || item.token.toLowerCase().indexOf(q) >= 0; })
    .slice(0, 12);
}
function attachmentPrompt(prompt, files) {
  var lines = files.map(function (file) {
    return "- " + file.localPath + " (" + file.name + ", " + file.mimeType + ", " + file.size + " byte)";
  });
  var block = "## Allegati\n" + lines.join("\n");
  return prompt ? prompt + "\n\n" + block : "Analizza gli allegati forniti.\n\n" + block;
}
function attachmentDisplayPrompt(prompt, attachments) {
  return prompt || "Allegati: " + attachments.map(function (attachment) { return attachment.name; }).join(", ");
}
function normalizeMessagePath(value) {
  var result = String(value || "").trim();
  if (result.indexOf("file://") === 0) {
    try {
      result = new URL(result).pathname;
    } catch (_) {}
  }
  try {
    result = decodeURIComponent(result);
  } catch (_) {}
  return result.replace(/[?#].*$/, "");
}
function artifactForPath(message, value) {
  var normalized = normalizeMessagePath(value);
  var artifacts =
    message && Array.isArray(message.artifacts) ? message.artifacts : [];
  return artifacts.find(function (artifact) {
    var relativePath = normalizeMessagePath(artifact.relativePath || "");
    if (!relativePath) return false;
    return (
      normalized === relativePath ||
      normalized.endsWith("/" + relativePath) ||
      normalized.endsWith("\\\\" + relativePath.replace(/\//g, "\\\\"))
    );
  });
}
function artifactActionRef(message, artifact) {
  var messages = currentConversation().messages || [];
  var messageIndex = messages.indexOf(message);
  var artifactIndex = Array.isArray(message && message.artifacts)
    ? message.artifacts.indexOf(artifact)
    : -1;
  return messageIndex >= 0 && artifactIndex >= 0
    ? messageIndex + ":" + artifactIndex
    : "";
}
function fileMessageLink(path, label, message) {
  var artifact = artifactForPath(message, path);
  if (!artifact)
    return '<code class="message-path">' + esc(label || path) + "</code>";
  var ref = artifactActionRef(message, artifact);
  return (
    '<button class="message-link message-link-file" data-action="download-artifact:' +
    attr(ref) +
    '" title="Scarica ' +
    attr(artifact.name || label || path) +
    '">' +
    icons.download +
    "<span>" +
    esc(label || artifact.name || path) +
    "</span><small>File Relay</small></button>"
  );
}
function messageLink(url, label, message) {
  var local = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])/i.test(url);
  var artifact =
    local && message && Array.isArray(message.artifacts)
      ? message.artifacts.find(function (item) {
          return (
            item.kind === "local-service" &&
            item.localUrl &&
            url.indexOf(item.localUrl.split("/").slice(0, 3).join("/")) === 0
          );
        })
      : null;
  if (artifact) {
    var ref = artifactActionRef(message, artifact);
    return (
      '<button class="message-link" data-action="preview-artifact:' +
      attr(ref) +
      '">' +
      icons.external +
      "<span>" +
      esc(label || url) +
      '</span><small>Locale</small><b class="message-link-badge">via Relay</b></button>'
    );
  }
  var domain = "";
  try {
    domain = new URL(url).hostname;
  } catch (_) {}
  return (
    '<a class="message-link" href="' +
    attr(url) +
    '" target="_blank" rel="noopener noreferrer">' +
    icons.external +
    "<span>" +
    esc(label || url) +
    "</span>" +
    (domain ? "<small>" + esc(domain) + "</small>" : "") +
    "</a>"
  );
}
function md(value, message) {
  var source = String(value || ""),
    tokens = [];
  function hold(html) {
    var key = "@@RELAY" + tokens.length + "@@";
    tokens.push(html);
    return key;
  }
  var tick = String.fromCharCode(96);
  var fence = new RegExp(
    tick + tick + tick + "([\\s\\S]*?)" + tick + tick + tick,
    "g",
  );
  var inlineCode = new RegExp(tick + "([^" + tick + "]+)" + tick, "g");
  source = source.replace(fence, function (_, code) {
    return hold("<pre><code>" + esc(code) + "</code></pre>");
  });
  source = source.replace(inlineCode, function (_, code) {
    return hold("<code>" + esc(code) + "</code>");
  });
  source = source.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    function (_, label, target) {
      var clean = String(target || "")
        .trim()
        .replace(/^<|>$/g, "");
      return hold(
        /^https?:\/\//i.test(clean)
          ? messageLink(clean, label, message)
          : fileMessageLink(clean, label, message),
      );
    },
  );
  var text = esc(source);
  text = text.replace(
    /(^|[\s>])(https?:\/\/[^\s<]+)/g,
    function (_, prefix, url) {
      var clean = url.replace(/[),.;]+$/, "");
      var tail = url.slice(clean.length);
      return prefix + hold(messageLink(clean, clean, message)) + tail;
    },
  );
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/^### (.*)$/gm, "<strong>$1</strong>");
  text = text.replace(/^[-*] (.*)$/gm, "<li>$1</li>");
  text = text.replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, function (list) {
    return "<ul>" + list + "</ul>";
  });
  text = text
    .split(/\n{2,}/)
    .map(function (part) {
      return /^<(pre|ul|strong)/.test(part) || /^@@RELAY\d+@@$/.test(part)
        ? part
        : "<p>" + part.replace(/\n/g, "<br>") + "</p>";
    })
    .join("");
  tokens.forEach(function (html, index) {
    text = text.split("@@RELAY" + index + "@@").join(html);
  });
  return text;
}
function formatTime(value) {
  try {
    return new Date(value).toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return "";
  }
}
function relativeTime(value) {
  var ms = Date.now() - new Date(value || 0).getTime();
  if (!isFinite(ms) || ms < 0) return "";
  var m = Math.floor(ms / 60000);
  if (m < 1) return "ora";
  if (m < 60) return m + "m";
  var h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  var d = Math.floor(h / 24);
  return d + "g";
}
function pct(value) {
  return typeof value === "number"
    ? Math.round(Math.max(0, Math.min(1, value)) * 100) + "%"
    : "—";
}
function currentTicket() {
  return pairingTicket || new URLSearchParams(location.search).get("t") || "";
}
async function refreshPairingTicket() {
  try {
    var response = await fetch("/api/pairing", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return currentTicket();
    var data = await response.json();
    if (data && data.ticket) {
      pairingTicket = String(data.ticket);
      var url = new URL(location.href);
      url.searchParams.set("t", pairingTicket);
      history.replaceState({}, "", url.pathname + url.search);
      return pairingTicket;
    }
  } catch (_) {}
  return currentTicket();
}
function toast(message) {
  notice.textContent = message;
  notice.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(function () {
    notice.classList.remove("show");
  }, 3200);
}
function request(path, options) {
  var init = Object.assign({ credentials: "same-origin" }, options || {});
  init.headers = Object.assign(
    {},
    init.headers || {},
    sessionToken ? { authorization: "Bearer " + sessionToken } : {},
  );
  return fetch(path, init).then(async function (response) {
    var data = {};
    try {
      data = await response.json();
    } catch (_) {
      data = {};
    }
    if (!response.ok) {
      var error = new Error(
        data.error || data.message || "Operazione non riuscita.",
      );
      error.sessionExpired = response.status === 401 || response.status === 403;
      throw error;
    }
    return data;
  });
}
function currentConversation() {
  return (appState && appState.conversation) || { messages: [] };
}
function activeRuns() {
  return (appState && appState.activeRuns) || [];
}
function currentRun() {
  var c = currentConversation();
  return (
    activeRuns().find(function (run) {
      return run.conversationId === c.id && run.kind !== "delegation";
    }) ||
    activeRuns().find(function (run) {
      return run.conversationId === c.id;
    })
  );
}
function providerEntry(id) {
  return ((appState && appState.providers) || []).find(function (provider) {
    return provider.id === id;
  });
}
function currentProvider() {
  return providerEntry(currentConversation().provider);
}
function visibleAgents() {
  return ((appState && appState.agents) || []).filter(function (agent) {
    return (
      agent.enabled &&
      (agent.globalVisible !== false ||
        !agent.projectIds ||
        agent.projectIds.includes(appState.workspace && appState.workspace.id))
    );
  });
}
function selectedAgent() {
  var c = currentConversation();
  return visibleAgents().find(function (agent) {
    return agent.id === c.agentId;
  });
}
function providerLabel(id) {
  var provider = providerEntry(id);
  return (provider && provider.label) || String(id || "Provider");
}
function providerShort(id) {
  var names = { codex: "CX", claude: "CL", antigravity: "AG", copilot: "GH" };
  return (
    names[id] ||
    String(id || "?")
      .slice(0, 2)
      .toUpperCase()
  );
}
function providerDescription(id) {
  var text = {
    codex: "Coding agent locale OpenAI",
    claude: "Coding agent Anthropic",
    antigravity: "Agente locale Antigravity",
    copilot: "GitHub Copilot CLI",
  };
  return text[id] || "Provider locale Relay";
}
function latestVsixPath() {
  var messages = (currentConversation().messages || []).slice().reverse();
  for (var i = 0; i < messages.length; i++) {
    var artifacts = Array.isArray(messages[i].artifacts)
      ? messages[i].artifacts
      : [];
    for (var j = 0; j < artifacts.length; j++) {
      var artifact = artifacts[j];
      if (
        String(artifact.name || artifact.relativePath || "")
          .toLowerCase()
          .endsWith(".vsix")
      )
        return artifact.relativePath || artifact.name;
    }
  }
  return "";
}
function providerHealth(provider) {
  if (!provider || !provider.available)
    return { label: "Non disponibile", className: "bad" };
  if (provider.authenticated === false)
    return { label: "Accesso richiesto", className: "limited" };
  return { label: "Disponibile", className: "ready" };
}
function recoveryProvider(failed) {
  return ((appState && appState.providers) || []).find(function (provider) {
    return (
      provider.id !== failed &&
      provider.healthState === "ready" &&
      provider.connected !== false
    );
  });
}
function errorRecoveryMarkup(runId, failed) {
  if (!runId) return "";
  var helper = recoveryProvider(failed);
  return (
    '<div class="error-recovery">' +
    (helper
      ? '<button class="btn primary" data-action="resolve-run:' +
        attr(runId) +
        '" title="Apre una nuova chat con ' +
        attr(providerLabel(helper.id)) +
        ' e invia la diagnosi con accesso completo">' +
        icons.logo +
        " Risolvi</button>"
      : '<span class="recovery-unavailable">Nessun altro provider disponibile</span>') +
    "</div>"
  );
}
function hideReconnectOverlay() {
  clearTimeout(reconnectOverlayTimer);
  reconnectOverlayTimer = null;
  if (reconnectOverlay) reconnectOverlay.classList.remove("show");
}
function scheduleReconnectOverlay() {
  clearTimeout(reconnectOverlayTimer);
  reconnectOverlayTimer = setTimeout(function () {
    if (connectionState !== "online" && reconnectOverlay) {
      if (reconnectUrl) reconnectUrl.textContent = location.host;
      reconnectOverlay.classList.add("show");
    }
  }, 800);
}
function setConnection(value) {
  connectionState = value;
  var dot = document.querySelector(".connection-dot");
  if (dot)
    dot.className = "connection-dot " + (value === "online" ? "" : value);
  if (value === "online") {
    reconnectAttempts = 0;
    reconnectDelay = 1200;
    banner.hidden = true;
    hideReconnectOverlay();
    return;
  }
  scheduleReconnectOverlay();
  if (value === "offline" && reconnectAttempts >= 3) {
    banner.hidden = false;
    banner.innerHTML =
      '<span>Computer non raggiungibile.</span><button data-action="reload">Riprova ora</button>';
  } else {
    banner.hidden = true;
    banner.textContent = "";
  }
}
function captureDraft() {
  var input = document.getElementById("prompt");
  if (input) {
    pendingPrompt = input.value || "";
    if (pendingPrompt) sessionStorage.setItem("relay_draft", pendingPrompt);
    else sessionStorage.removeItem("relay_draft");
  }
}
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(function () {
    load(true);
  }, 30000);
}
function reconcileOptimistic() {
  if (!optimisticSend || !appState) return;
  var c = currentConversation();
  if (c.id !== optimisticSend.conversationId) return;
  var sentAt = new Date(optimisticSend.startedAt).getTime() - 5000;
  var found = (c.messages || []).some(function (message) {
    return (
      message.role === "user" &&
      String(message.text || message.content || "").trim() ===
        optimisticSend.prompt &&
      new Date(message.createdAt || 0).getTime() >= sentAt
    );
  });
  if (found) optimisticSend = null;
}
function applyState(next) {
  clearTimeout(stateSyncTimer);
  stateSyncTimer = null;
  var patch = Boolean(
    appState && section === "chat" && document.getElementById("thread"),
  );
  appState = next;
  reconcileOptimistic();
  setConnection("online");
  if (patch) {
    patchChat();
    if (drawerOpen || sheet) renderOverlays();
  } else render();
}
function scheduleStateLoad(delay) {
  clearTimeout(stateSyncTimer);
  stateSyncTimer = setTimeout(
    function () {
      load(true);
    },
    typeof delay === "number" ? delay : 500,
  );
}
function connectEvents() {
  if (events) return;
  events = new EventSource(
    "/events" +
      (sessionToken ? "?token=" + encodeURIComponent(sessionToken) : ""),
  );
  events.addEventListener("hello", function () {
    setConnection("online");
  });
  events.addEventListener("state", function (event) {
    try {
      var next = JSON.parse((event && event.data) || "{}");
      if (next && next.conversation) {
        applyState(next);
        startPolling();
      } else scheduleStateLoad(40);
    } catch (_) {
      scheduleStateLoad(40);
    }
  });
  events.onerror = function () {
    reconnectAttempts += 1;
    setConnection(reconnectAttempts >= 3 ? "offline" : "reconnecting");
    if (events) {
      events.close();
      events = null;
    }
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(function () {
      load(true);
    }, reconnectDelay);
    reconnectDelay = Math.min(12000, Math.round(reconnectDelay * 1.7));
  };
}
async function load(silent) {
  if (loading) return;
  loading = true;
  if (!silent && !appState) renderLoading();
  captureDraft();
  try {
    var next = await request("/api/state");
    applyState(next);
    connectEvents();
    startPolling();
  } catch (error) {
    clearInterval(pollTimer);
    if (error.sessionExpired) {
      appState = null;
      hideReconnectOverlay();
      renderPair("Sessione scaduta, ricollega il dispositivo.");
    } else {
      reconnectAttempts += 1;
      setConnection(reconnectAttempts >= 3 ? "offline" : "reconnecting");
      if (!appState && reconnectAttempts >= 3) renderOffline(error.message);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(function () {
        load(true);
      }, reconnectDelay);
      reconnectDelay = Math.min(12000, Math.round(reconnectDelay * 1.7));
    }
  } finally {
    loading = false;
  }
}
async function action(type, payload, options) {
  try {
    var result = await request("/api/action", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relay-request": "mobile",
      },
      body: JSON.stringify({ type: type, payload: payload || {} }),
    });
    if (result.notice) toast(result.notice);
    if (result.state) applyState(result.state);
    else if (!options || options.refresh !== false) await load(true);
    else scheduleStateLoad(650);
    return result || true;
  } catch (error) {
    if (error.sessionExpired) {
      appState = null;
      renderPair(error.message);
    } else toast(error.message);
    return false;
  }
}
function resumeConnection() {
  reconnectDelay = 1200;
  reconnectAttempts = 0;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (events) {
    events.close();
    events = null;
  }
  setConnection("reconnecting");
  void load(true);
}
function renderLoading() {
  root.innerHTML =
    '<main class="loading"><div class="loading-inner"><div class="loader"><i></i><i></i><i></i><i></i></div><strong>Relay</strong><p>Connessione sicura al computer…</p></div></main>';
}
function renderOffline(message) {
  root.innerHTML =
    '<main class="offline"><section class="offline-card">' +
    icons.offline +
    "<strong>Computer non raggiungibile</strong><p>" +
    esc(
      message ||
        "Verifica che Relay sia aperto e che telefono e computer siano sulla stessa rete.",
    ) +
    '</p><button class="btn" data-action="reload">Riprova</button></section></main>';
}
function renderPair(message) {
  var digits = [0, 1, 2, 3, 4, 5]
    .map(function (index) {
      return (
        '<input data-otp="' +
        index +
        '" inputmode="numeric" autocomplete="one-time-code" maxlength="1" aria-label="Cifra ' +
        (index + 1) +
        '">'
      );
    })
    .join("");
  root.innerHTML =
    '<main class="pair-shell"><section class="pair-card"><div class="pair-brand"><span class="brand-mark">' +
    icons.logo +
    '</span><div><strong>Relay</strong><span>Accesso remoto locale</span></div></div><h1>Conferma il dispositivo</h1><p>Inserisci il codice mostrato sul computer. Relay sincronizza automaticamente il QR corrente anche se il browser ha perso il parametro del link.</p><div class="field"><label>Nome dispositivo</label><input id="device-name" value="' +
    attr(deviceName) +
    '" autocomplete="name" placeholder="Il mio telefono"></div><div class="otp-label">Codice a 6 cifre</div><div class="otp" id="otp">' +
    digits +
    '</div><div class="pair-help">Le sei cifre sono visibili nel pannello Remoto di Relay sul desktop.</div><div id="pair-error" class="pair-error">' +
    esc(message || "") +
    '</div><div class="pair-actions"><button class="btn primary wide" id="pair-button" data-action="pair">' +
    icons.shield +
    '<span>Collega a Relay</span></button><button class="btn ghost wide" data-action="new-pairing">' +
    icons.refresh +
    '<span>Rigenera QR</span></button></div><div class="security-copy">' +
    icons.lock +
    "<span>Il codice scade automaticamente e può essere usato una sola volta.</span></div></section></main>";
  hydrateOtp();
  void refreshPairingTicket();
}
function hydrateOtp() {
  var inputs = Array.from(document.querySelectorAll("[data-otp]"));
  inputs.forEach(function (input, index) {
    input.addEventListener("input", function () {
      input.value = input.value.replace(/\D/g, "").slice(-1);
      var error = document.getElementById("pair-error");
      if (error) error.textContent = "";
      if (input.value && inputs[index + 1]) inputs[index + 1].focus();
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Backspace" && !input.value && inputs[index - 1])
        inputs[index - 1].focus();
    });
    input.addEventListener("paste", function (event) {
      var value = (
        (event.clipboardData && event.clipboardData.getData("text")) ||
        ""
      )
        .replace(/\D/g, "")
        .slice(0, 6);
      if (value.length) {
        event.preventDefault();
        value.split("").forEach(function (char, i) {
          if (inputs[i]) inputs[i].value = char;
        });
        if (inputs[Math.min(value.length, 6) - 1])
          inputs[Math.min(value.length, 6) - 1].focus();
      }
    });
  });
}
async function pairDevice() {
  var inputs = Array.from(document.querySelectorAll("[data-otp]"));
  var code = inputs
    .map(function (input) {
      return input.value;
    })
    .join("");
  var name = (document.getElementById("device-name").value || "").trim();
  var error = document.getElementById("pair-error");
  var button = document.getElementById("pair-button");
  if (code.length !== 6) {
    error.textContent = "Inserisci le sei cifre visualizzate sul computer.";
    return;
  }
  error.textContent = "";
  button.disabled = true;
  button.innerHTML =
    '<span class="spinner"></span><span>Sincronizzo il QR…</span>';
  try {
    var ticket = await refreshPairingTicket();
    button.innerHTML =
      '<span class="spinner"></span><span>Verifica in corso…</span>';
    var paired = await request("/api/pair", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relay-request": "mobile",
      },
      body: JSON.stringify({ ticket: ticket, code: code, name: name }),
    });
    if (paired.token) {
      sessionToken = String(paired.token);
      sessionStorage.setItem("relay_session_token", sessionToken);
    }
    deviceName = name || "Telefono";
    sessionStorage.setItem("relay_device_name", deviceName);
    pairingTicket = "";
    history.replaceState({}, "", location.pathname);
    await load();
  } catch (e) {
    error.textContent =
      e.message || "Codice non valido. Verifica le cifre o genera un nuovo QR.";
    button.disabled = false;
    button.innerHTML = icons.shield + "<span>Collega a Relay</span>";
  }
}
function sectionMeta() {
  var data = {
    chat: [
      "Nuova conversazione",
      (appState && appState.workspace && appState.workspace.name) ||
        "Workspace",
    ],
    projects: ["Progetti", (appState.projects || []).length + " workspace"],
    agents: ["Agenti", visibleAgents().length + " disponibili"],
    usage: ["Utilizzo", "Quote e capacità provider"],
    rules: ["Regole", (appState.rules || []).length + " configurate"],
    mcp: [
      "MCP",
      ((appState.mcp && appState.mcp.servers) || []).length + " server",
    ],
    automations: [
      "Automazioni",
      (appState.automations || []).length + " programmate",
    ],
    settings: ["Impostazioni", "Preferenze Relay"],
  };
  var meta = data[section] || data.chat;
  if (section === "chat" && currentConversation().title)
    meta = [
      currentConversation().title,
      (appState.workspace && appState.workspace.name) || "Workspace",
    ];
  return { title: meta[0], sub: meta[1] };
}
function render() {
  if (!appState) {
    renderLoading();
    return;
  }
  var meta = sectionMeta();
  root.innerHTML =
    '<div class="app-shell">' +
    appbar(meta) +
    (section === "chat" ? chatArea() : pageArea()) +
    bottomNav() +
    "</div>";
  renderOverlays();
  hydratePage();
  if (section === "chat") lastComposerSignature = composerSignature();
  setConnection(connectionState);
}
function appbar(meta) {
  var titleAction = section === "chat" ? "open-sheet:conversations" : "";
  return (
    '<header class="appbar"><button class="icon-btn" data-action="open-drawer" aria-label="Apri conversazioni">' +
    icons.menu +
    (activeRuns().length
      ? '<b class="nav-badge">' + activeRuns().length + "</b>"
      : "") +
    '</button><button class="appbar-copy" ' +
    (titleAction ? 'data-action="' + titleAction + '"' : "") +
    "><strong>" +
    esc(meta.title) +
    (titleAction ? " " + icons.down : "") +
    '</strong><span><i class="connection-dot"></i>' +
    esc(meta.sub) +
    '</span></button><button class="icon-btn" data-action="' +
    (section === "chat" ? "new-chat" : "open-sheet:page-menu") +
    '" aria-label="' +
    (section === "chat" ? "Nuova chat" : "Altre azioni") +
    '">' +
    (section === "chat" ? icons.plus : icons.more) +
    "</button></header>"
  );
}
function bottomNav() {
  var moreActive = ["usage", "rules", "mcp", "settings"].includes(section);
  var items = [
    ["chat", "chat", "Chat", "section:chat"],
    ["projects", "folder", "Progetti", "section:projects"],
    ["agents", "agent", "Agenti", "section:agents"],
    ["automations", "clock", "Auto", "section:automations"],
    ["more", "grid", "Altro", "open-sheet:more-nav"],
  ];
  return (
    '<nav class="bottom-nav">' +
    items
      .map(function (item) {
        var active = item[0] === "more" ? moreActive : section === item[0];
        return (
          '<button class="nav-btn ' +
          (active ? "on" : "") +
          '" data-action="' +
          item[3] +
          '">' +
          icons[item[1]] +
          "<span>" +
          item[2] +
          "</span>" +
          (item[0] === "chat" && activeRuns().length
            ? '<b class="nav-badge">' + activeRuns().length + "</b>"
            : "") +
          "</button>"
        );
      })
      .join("") +
    "</nav>"
  );
}
function pageArea() {
  return (
    '<main class="page-scroll"><div class="page">' +
    (section === "projects"
      ? projectsPage()
      : section === "agents"
        ? agentsPage()
        : section === "usage"
          ? usagePage()
          : section === "mcp"
            ? mcpPage()
            : section === "automations"
              ? automationsPage()
              : section === "settings"
                ? settingsPage()
                : rulesPage()) +
    "</div></main>"
  );
}
function chatArea() {
  return (
    '<main class="chat-area"><div class="thread" id="thread"><div class="thread-inner" id="thread-inner">' +
    threadMarkup() +
    '</div></div><button id="new-messages" class="new-messages" data-action="scroll-bottom">Nuovi messaggi ' +
    icons.down +
    "</button>" +
    composerMarkup() +
    "</main>"
  );
}
function formatBytes(value) {
  var size = Number(value || 0);
  if (!size) return "";
  if (size < 1024) return size + " B";
  if (size < 1024 * 1024) return Math.round(size / 1024) + " KB";
  return Math.round((size / (1024 * 1024)) * 10) / 10 + " MB";
}
function middleTruncate(value, max) {
  var text = String(value || "");
  if (text.length <= max) return text;
  var side = Math.floor((max - 1) / 2);
  return text.slice(0, side) + "…" + text.slice(-side);
}
function artifactType(artifact) {
  var name = String(artifact.name || artifact.relativePath || "").toLowerCase(),
    mime = String(artifact.mimeType || "").toLowerCase();
  if (artifact.kind === "bundle" || /\.(zip|tar|gz|7z|rar)$/.test(name))
    return "archive";
  if (mime.indexOf("image/") === 0 || /\.(png|jpe?g|gif|webp|svg)$/.test(name))
    return "image";
  if (
    artifact.kind === "static-site" ||
    artifact.kind === "local-service" ||
    /\.(html?|css|js|ts|tsx|jsx|php|py|java|cs|go|rs|json|xml)$/.test(name)
  )
    return "code";
  return "document";
}
function artifactPaths(message, artifact) {
  var c = currentConversation();
  var base =
    "/" +
    ["api", "artifacts", c.id, message.id, artifact.id]
      .map(encodeURIComponent)
      .join("/");
  var preview =
    "/" +
    ["preview", c.id, message.id, artifact.id]
      .map(encodeURIComponent)
      .join("/") +
    "/";
  return { base: base, preview: preview };
}
function artifactCard(message, artifact, messageIndex, artifactIndex) {
  var type = artifactType(artifact),
    canPreview =
      artifact.kind === "static-site" ||
      artifact.kind === "local-service" ||
      type === "image" ||
      String(artifact.mimeType || "").toLowerCase() === "application/pdf",
    canDownload = artifact.kind !== "local-service",
    label =
      artifact.kind === "local-service"
        ? "App locale"
        : artifact.kind === "static-site"
          ? "Sito web"
          : type === "image"
            ? "Immagine"
            : type === "archive"
              ? "Archivio"
              : "File",
    ref = messageIndex + ":" + artifactIndex,
    actions = "";
  if (canPreview)
    actions +=
      '<button class="artifact-action artifact-action-primary" data-action="preview-artifact:' +
      ref +
      '" aria-label="Apri anteprima" title="Anteprima">' +
      icons.external +
      "</button>";
  if (canDownload)
    actions +=
      '<button class="artifact-action" data-action="download-artifact:' +
      ref +
      '" aria-label="Scarica file" title="Scarica">' +
      icons.download +
      "</button>";
  if (artifact.relativePath)
    actions +=
      '<button class="artifact-action" data-action="copy-artifact-path:' +
      encodeURIComponent(artifact.relativePath) +
      '" aria-label="Copia percorso" title="Copia percorso">' +
      icons.copy +
      "</button>";
  if (canPreview)
    actions +=
      '<button class="artifact-action" data-action="share-artifact:' +
      ref +
      '" aria-label="Condividi" title="Condividi">' +
      icons.share +
      "</button>";
  return (
    '<section class="artifact-card artifact-type-' +
    type +
    '"><span class="artifact-icon">' +
    icons[type] +
    '</span><span class="artifact-copy"><strong title="' +
    attr(artifact.name || "Artefatto Relay") +
    '">' +
    esc(middleTruncate(artifact.name || "Artefatto Relay", 30)) +
    "</strong><span>" +
    esc([label, formatBytes(artifact.size)].filter(Boolean).join(" · ")) +
    '</span></span><div class="artifact-actions">' +
    actions +
    "</div></section>"
  );
}
function artifactMarkup(message, messageIndex) {
  var artifacts = Array.isArray(message && message.artifacts)
    ? message.artifacts
    : [];
  if (!artifacts.length) return "";
  var bundle = artifacts.find(function (item) {
      return item.kind === "bundle";
    }),
    items = artifacts.filter(function (item) {
      return item.kind !== "bundle";
    });
  if (!items.length && bundle) items = [bundle];
  var cards = items
    .map(function (artifact) {
      return artifactCard(
        message,
        artifact,
        messageIndex,
        artifacts.indexOf(artifact),
      );
    })
    .join("");
  if (items.length <= 1 && !bundle)
    return '<div class="message-artifacts">' + cards + "</div>";
  var zip = bundle
    ? '<button class="artifact-group-download" data-action="download-artifact:' +
      messageIndex +
      ":" +
      artifacts.indexOf(bundle) +
      '" aria-label="Scarica tutti i risultati">' +
      icons.archive +
      " ZIP</button>"
    : "";
  return (
    '<details class="artifact-group"' +
    (items.length <= 3 ? " open" : "") +
    "><summary><span>Risultati <b>" +
    items.length +
    "</b></span>" +
    zip +
    '</summary><div class="artifact-group-list">' +
    cards +
    "</div></details>"
  );
}
function threadMarkup() {
  var c = currentConversation();
  var messages = c.messages || [];
  var run = currentRun();
  var optimistic =
    optimisticSend && optimisticSend.conversationId === c.id
      ? optimisticSend
      : null;
  if (!messages.length && !run && !optimistic)
    return (
      '<div class="empty">' +
      icons.chat +
      "<strong>Chat pronta</strong><p>Scrivi il primo messaggio. Il provider lavorerà sul computer collegato.</p></div>"
    );
  var html = '<div class="day-label">Oggi</div>';
  messages.forEach(function (message, index) {
    var user = message.role === "user";
    var label = user ? "Tu" : providerLabel(message.provider || c.provider);
    var model = message.model || c.model || "";
    html +=
      '<article class="message-wrap"><div class="message-meta">' +
      (user ? "" : '<i class="provider-dot"></i>') +
      "<strong>" +
      esc(label) +
      "</strong><span>" +
      formatTime(message.createdAt) +
      "</span>" +
      (model && !user ? "<span>· " + esc(model) + "</span>" : "") +
      '</div><div class="bubble ' +
      (user ? "user" : "assistant") +
      " " +
      (message.error ? "error" : "") +
      '">' +
      md(message.text || message.content || "", message) +
      "</div>" +
      (!user ? artifactMarkup(message, index) : "") +
      (!user && message.error
        ? errorRecoveryMarkup(message.runId, message.provider || c.provider)
        : "") +
      (!user
        ? '<div class="message-actions"><button class="message-action" data-action="copy-message:' +
          index +
          '" aria-label="Copia risposta">' +
          icons.copy +
          "</button></div>"
        : "") +
      "</article>";
  });
  if (optimistic)
    html +=
      '<article class="message-wrap optimistic"><div class="message-meta"><strong>Tu</strong><span>Invio…</span></div><div class="bubble user">' +
      md(optimistic.prompt) +
      "</div></article>";
  if (run) html += liveCard(run);
  return html;
}
function humanPhase(run) {
  var phase = String(run.phase || "");
  var map = {
    queued: "In attesa di avvio…",
    connecting: "Connessione al provider…",
    "starting-session": "Preparazione della sessione…",
    "starting-turn": "Avvio del lavoro…",
    "waiting-first-output": "In attesa del primo risultato…",
    working: "Elaborazione in corso…",
    integrating: "Integrazione del risultato…",
    "rate-limited": "Provider limitato",
    "permission-denied": "Permesso necessario",
  };
  return (
    map[phase] ||
    String(run.status || "Elaborazione in corso…")
      .replace(
        /\b(starting-session|waiting-first-output|working|queued|connecting)\b/gi,
        "",
      )
      .trim() ||
    "Elaborazione in corso…"
  );
}
function elapsed(run) {
  var start = new Date(run.startedAt || Date.now()).getTime();
  var seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  var minutes = Math.floor(seconds / 60);
  return (
    (minutes ? minutes + ":" : "0:") + String(seconds % 60).padStart(2, "0")
  );
}
function liveCard(run) {
  var activities = (run.activities || []).slice(-5);
  var last = activities[activities.length - 1];
  var details = activities
    .map(function (activity, index) {
      return (
        '<div class="activity-row"><span class="step">' +
        (index === activities.length - 1 ? "◌" : "✓") +
        "</span><div><b>" +
        esc(activity.title || "Attività") +
        "</b>" +
        (activity.detail ? "<div>" + esc(activity.detail) + "</div>" : "") +
        "</div></div>"
      );
    })
    .join("");
  var output = run.partialOutput || "";
  var failed = Boolean(
    run.error ||
    run.phase === "failed" ||
    run.phase === "rate-limited" ||
    run.phase === "permission-denied" ||
    run.phase === "authentication",
  );
  return (
    '<section class="live-card ' +
    (failed ? "is-error" : "") +
    '"><div class="live-main"><div class="live-top"><div class="live-title"><i class="pulse"></i>' +
    esc(providerLabel(run.provider)) +
    (failed ? " ha restituito un errore" : " sta lavorando") +
    '</div><span class="elapsed">' +
    elapsed(run) +
    '</span></div><div class="live-phase">' +
    esc(humanPhase(run)) +
    "</div>" +
    (last
      ? '<div class="live-last">Ultima attività: ' +
        esc(last.title || "Aggiornamento") +
        "</div>"
      : "") +
    (failed
      ? errorRecoveryMarkup(run.rootRunId || run.id, run.provider)
      : '<button class="live-detail-toggle" data-action="toggle-live-details">' +
        (liveDetailsOpen ? "Nascondi dettagli" : "Dettagli") +
        " " +
        (liveDetailsOpen ? "⌃" : "⌄") +
        "</button>") +
    "</div>" +
    (liveDetailsOpen
      ? '<div class="live-details">' +
        (details ||
          '<div class="activity-row"><span class="step">◌</span><div><b>Processo attivo</b><div>Relay mantiene il task sotto controllo.</div></div></div>') +
        (output ? '<div class="live-output">' + esc(output) + "</div>" : "") +
        "</div>"
      : "") +
    "</section>"
  );
}
function selectionLabel() {
  var agent = selectedAgent();
  if (agent) return { mark: "✦", label: agent.name, agent: true };
  var c = currentConversation();
  return {
    mark: providerShort(c.provider),
    label: providerLabel(c.provider) + (c.model ? " · " + c.model : ""),
  };
}
function composerSignature() {
  var run = currentRun(),
    sending = Boolean(optimisticSend && !run),
    locked = Boolean(run || sending),
    selection = selectionLabel();
  return [
    (run && run.id) || "",
    (run && run.phase) || "",
    sending ? "1" : "0",
    locked ? "1" : "0",
    selection.mark || "",
    selection.label || "",
    pendingRemoteAttachments.map(function (file) { return file.name + ":" + file.size; }).join(","),
  ].join("|");
}
function composerMarkup() {
  var run = currentRun();
  var sending = Boolean(optimisticSend && !run);
  var selection = selectionLabel();
  if (run || sending) {
    var phase = run ? humanPhase(run) : "Invio al computer…";
    var title = run
      ? providerLabel(run.provider) + " sta lavorando"
      : "Messaggio in consegna";
    return (
      '<div class="composer-wrap"><form class="composer composer-compact" id="composer-form"><div class="compact-run-state"><i class="' +
      (run ? "pulse" : "spinner") +
      '"></i><span class="compact-run-copy"><strong>' +
      esc(title) +
      "</strong><small>" +
      esc(phase) +
      '</small></span></div><div class="composer-actions"><button type="button" class="icon-btn" data-action="open-sheet:controls" aria-label="Controlli avanzati">' +
      icons.tune +
      '</button><button type="submit" class="send-round ' +
      (run ? "stop" : "") +
      '" ' +
      (sending ? "disabled" : "") +
      ' aria-label="' +
      (run ? "Interrompi task" : "Invio in corso") +
      '">' +
      (run ? icons.stop : '<span class="spinner"></span>') +
      "</button></div></form></div>"
    );
  }
  var attachments = pendingRemoteAttachments.length
    ? '<div class="remote-attachments">' +
      pendingRemoteAttachments
        .map(function (file, index) {
          return (
            '<span class="remote-attachment">' +
            esc(file.name) +
            ' <small>' +
            esc(shortBytes(file.size)) +
            '</small><button type="button" data-attachment-index="' +
            index +
            '" aria-label="Rimuovi allegato">x</button></span>'
          );
        })
        .join("") +
      '</div>'
    : "";
  return (
    '<div class="composer-wrap"><form class="composer" id="composer-form"><textarea id="prompt" placeholder="Scrivi un messaggio...">' +
    esc(pendingPrompt) +
    '</textarea><div id="remote-mention-panel" class="remote-mention-panel" hidden></div>' +
    attachments +
    '<input id="remote-attachment-input" type="file" multiple hidden><div class="composer-toolbar"><button type="button" class="composer-selection" data-action="open-sheet:' +
    (selection.agent ? "agent" : "provider") +
    '"><span class="provider-mark">' +
    esc(selection.mark) +
    "</span><span>" +
    esc(selection.label) +
    '</span></button><div class="composer-actions"><button type="button" class="icon-btn" id="remote-attach-button" aria-label="Aggiungi allegati">' +
    icons.file +
    '</button><button type="button" class="icon-btn" data-action="open-sheet:controls" aria-label="Controlli avanzati">' +
    icons.tune +
    '</button><button type="submit" class="send-round" aria-label="Invia">' +
    icons.send +
    "</button></div></div></form></div>"
  );
}
function patchChat() {
  var thread = document.getElementById("thread");
  var inner = document.getElementById("thread-inner");
  if (!thread || !inner) {
    render();
    return;
  }
  var wasNear =
    thread.scrollHeight - thread.clientHeight - thread.scrollTop < 96;
  var oldTop = thread.scrollTop;
  var oldCount = lastMessageCount;
  inner.innerHTML = threadMarkup();
  lastMessageCount = (currentConversation().messages || []).length;
  if (wasNear) {
    thread.scrollTop = thread.scrollHeight;
    autoScroll = true;
    hideNewMessages();
  } else {
    thread.scrollTop = oldTop;
    autoScroll = false;
    if (lastMessageCount > oldCount) showNewMessages();
  }
  lastConversationId = currentConversation().id || "";
  var nextSignature = composerSignature();
  if (nextSignature !== lastComposerSignature) {
    patchComposerState();
    lastComposerSignature = nextSignature;
  }
  observeComposerHeight();
  setConnection(connectionState);
}
function patchComposerState() {
  var area = document.querySelector(".chat-area");
  var old = document.querySelector(".composer-wrap");
  if (!area || !old) return;
  var active = document.activeElement,
    hadFocus = Boolean(active && active.id === "prompt"),
    start =
      hadFocus && typeof active.selectionStart === "number"
        ? active.selectionStart
        : null,
    end =
      hadFocus && typeof active.selectionEnd === "number"
        ? active.selectionEnd
        : null;
  captureDraft();
  var holder = document.createElement("div");
  holder.innerHTML = composerMarkup();
  old.replaceWith(holder.firstElementChild);
  hydrateComposer();
  observeComposerHeight();
  var next = document.getElementById("prompt");
  if (hadFocus && next && !next.disabled) {
    next.focus();
    if (
      start !== null &&
      end !== null &&
      typeof next.setSelectionRange === "function"
    )
      next.setSelectionRange(start, end);
  }
}
function syncComposerHeight() {
  var composer = document.querySelector(".composer-wrap");
  var height = composer
    ? Math.ceil(composer.getBoundingClientRect().height)
    : 0;
  document.documentElement.style.setProperty(
    "--composer-h",
    Math.max(72, height + 8) + "px",
  );
}
function observeComposerHeight() {
  if (composerResizeObserver) {
    composerResizeObserver.disconnect();
    composerResizeObserver = null;
var MAX_REMOTE_ATTACHMENTS = 10,
  MAX_REMOTE_ATTACHMENT_BYTES = 20 * 1024 * 1024;
  }
  var composer = document.querySelector(".composer-wrap");
  if (!composer) return;
  syncComposerHeight();
  if (typeof ResizeObserver === "function") {
    composerResizeObserver = new ResizeObserver(syncComposerHeight);
    composerResizeObserver.observe(composer);
  }
}
function showNewMessages() {
  var button = document.getElementById("new-messages");
  if (button) button.classList.add("show");
}
function hideNewMessages() {
  var button = document.getElementById("new-messages");
  if (button) button.classList.remove("show");
}
function scrollBottom() {
  var thread = document.getElementById("thread");
  if (thread) {
    thread.scrollTop = thread.scrollHeight;
    autoScroll = true;
    hideNewMessages();
  }
}
function pageIntro(copy, count) {
  return (
    '<div class="page-intro"><p>' +
    esc(copy) +
    '</p><span class="page-count">' +
    esc(count) +
    "</span></div>"
  );
}
function projectsPage() {
  var projects = (appState.projects || []).slice().sort(function (a, b) {
    return String(b.lastOpenedAt || "").localeCompare(
      String(a.lastOpenedAt || ""),
    );
  });
  var current = appState.workspace || {};
  var currentProject = projects.find(function (project) {
    return project.id === current.id;
  }) || {
    id: current.id,
    name: current.name,
    path: current.cwd,
    lastOpenedAt: "",
  };
  var rest = projects.filter(function (project) {
    return project.id !== current.id;
  });
  return (
    pageIntro(
      "Workspace disponibili sul computer collegato.",
      projects.length,
    ) +
    projectCurrent(currentProject) +
    (rest.length
      ? '<div class="section-label"><strong>Registrati</strong><span>' +
        rest.length +
        "</span></div>" +
        rest.map(projectCard).join("")
      : '<div class="empty">' +
        icons.folder +
        "<strong>Nessun altro workspace</strong><p>Aggiungi un progetto dal computer per ritrovarlo qui.</p></div>") +
    '<div class="actions"><button class="btn" data-action="project-picker">' +
    icons.plus +
    ' Aggiungi dal PC</button><button class="btn primary" data-action="new-chat">' +
    icons.chat +
    " Nuova chat</button></div>"
  );
}
function projectCurrent(project) {
  return (
    '<section class="card"><div class="card-body"><div class="row"><div class="identity"><span class="glyph">' +
    icons.folder +
    '</span><div class="identity-copy"><small>Progetto corrente</small><strong>' +
    esc(project.name || "Workspace") +
    "</strong><span>" +
    esc(compactPath(project.path || project.cwd || "")) +
    '</span></div></div><span class="status ready">Aperto</span></div><div class="actions"><button class="btn primary" data-action="section:chat">Vai alla chat</button><button class="btn" data-action="project-picker">Aggiungi dal PC</button></div></div></section>'
  );
}
function projectCard(project) {
  var open = appState.workspace && project.id === appState.workspace.id;
  return (
    '<section class="card"><div class="card-body"><div class="row"><div class="identity"><span class="glyph">' +
    icons.folder +
    '</span><div class="identity-copy"><strong>' +
    esc(project.name || "Progetto") +
    "</strong><span>" +
    esc(compactPath(project.path || "")) +
    "</span><small>" +
    (
      (appState.projectConversations &&
        appState.projectConversations[project.id]) ||
      []
    ).length +
    " chat · " +
    (project.isGit ? "Git" : "locale") +
    '</small></div></div><span class="status ' +
    (open ? "ready" : "limited") +
    '">' +
    (open ? "Aperto" : "Pronto") +
    '</span></div><div class="actions"><button class="btn" data-action="open-project:' +
    encodeURIComponent(project.path || "") +
    '">Apri</button></div></div></section>'
  );
}
function compactPath(path) {
  var text = String(path || "");
  if (text.length < 46) return text;
  return "…" + text.slice(-43);
}
function agentsPage() {
  var agents = visibleAgents()
    .filter(function (agent) {
      var provider = providerEntry(agent.provider);
      var available = provider && provider.available;
      var query = (
        agent.name +
        " " +
        (agent.bio || "") +
        " " +
        (agent.specialization || "")
      ).toLowerCase();
      if (agentSearch && !query.includes(agentSearch.toLowerCase()))
        return false;
      if (agentFilter === "available" && !available) return false;
      if (agentFilter === "delegates" && !agent.canDelegate) return false;
      return true;
    })
    .sort(function (a, b) {
      return (
        Number(!!b.isDefault) - Number(!!a.isDefault) ||
        String(a.name).localeCompare(String(b.name))
      );
    });
  return (
    pageIntro(
      "Scegli un profilo configurato sul desktop.",
      visibleAgents().length,
    ) +
    searchFilters(
      "Cerca agente o capacità…",
      [
        ["all", "Tutti"],
        ["available", "Disponibili"],
        ["delegates", "Con deleghe"],
      ],
      agentFilter,
      "agent-filter",
    ) +
    (agents.length
      ? agents.map(agentCard).join("")
      : '<div class="empty">' +
        icons.agent +
        "<strong>Nessun agente trovato</strong><p>Gli agenti si creano e si configurano dall’estensione desktop Relay.</p></div>")
  );
}
function agentCard(agent) {
  var provider = providerEntry(agent.provider);
  var health = providerHealth(provider);
  return (
    '<section class="card"><div class="card-body"><div class="row"><div class="identity"><span class="glyph">' +
    icons.agent +
    '</span><div class="identity-copy"><strong>' +
    esc(agent.name) +
    "</strong><span>" +
    esc(agent.specialization || agent.bio || providerLabel(agent.provider)) +
    "</span><small>" +
    [
      agent.permission === "read-only" ? "Sola lettura" : "Può modificare",
      agent.canDelegate ? "Deleghe abilitate" : "Nessuna delega",
    ].join(" · ") +
    '</small></div></div><span class="status ' +
    health.className +
    '">' +
    health.label +
    '</span></div><div class="actions"><button class="btn primary" data-action="select-agent:' +
    attr(agent.id) +
    '">Usa in chat</button></div></div></section>'
  );
}
function usagePage() {
  var entries = appState.usage || [];
  var fractions = [],
    resets = [];
  entries.forEach(function (entry) {
    if (typeof entry.remainingFraction === "number")
      fractions.push(entry.remainingFraction);
    (entry.buckets || []).forEach(function (bucket) {
      if (typeof bucket.remainingFraction === "number")
        fractions.push(bucket.remainingFraction);
      if (bucket.resetsAt) resets.push(new Date(bucket.resetsAt).getTime());
    });
  });
  var remaining = fractions.length
    ? fractions.reduce(function (a, b) {
        return a + b;
      }, 0) / fractions.length
    : undefined;
  var nearest = resets
    .filter(function (value) {
      return value > Date.now();
    })
    .sort(function (a, b) {
      return a - b;
    })[0];
  var summary =
    '<section class="card"><div class="card-body"><div class="usage-grid"><div class="usage-metric"><span>Capacità media residua</span><strong>' +
    pct(remaining) +
    '</strong></div><div class="usage-metric"><span>Provider con dati</span><strong>' +
    entries.filter(function (entry) {
      return entry.available;
    }).length +
    '</strong></div></div><div class="sheet-info">Prossimo reset: ' +
    (nearest ? new Date(nearest).toLocaleString("it-IT") : "non disponibile") +
    "</div></div></section>";
  return (
    pageIntro(
      "Quote locali usate anche per routing e deleghe.",
      entries.length,
    ) +
    summary +
    (entries.length
      ? entries.map(usageCard).join("")
      : '<div class="empty">' +
        icons.usage +
        "<strong>Nessun dato disponibile</strong><p>Aggiorna i provider dal desktop o avvia un task.</p></div>")
  );
}
function usageCard(entry) {
  var health = entry.available ? "ready" : "bad";
  var remaining = entry.remainingFraction;
  return (
    '<section class="card"><div class="card-body usage-provider"><div class="usage-line"><div><strong>' +
    esc(providerLabel(entry.provider)) +
    '</strong><div style="color:var(--muted);font-size:10px;margin-top:3px">' +
    esc(entry.plan || entry.source || "Dati provider") +
    "</div></div><b>" +
    pct(remaining) +
    '</b></div><div class="progress"><i style="width:' +
    pct(remaining) +
    '"></i></div><div class="usage-buckets">' +
    (entry.buckets || [])
      .slice(0, 3)
      .map(function (bucket) {
        return (
          '<div class="usage-bucket"><div class="usage-bucket-top"><span>' +
          esc(
            [bucket.group, bucket.label].filter(Boolean).join(" · ") || "Quota",
          ) +
          "</span><strong>" +
          pct(bucket.remainingFraction) +
          '</strong></div><div class="progress"><i style="width:' +
          pct(bucket.remainingFraction) +
          '"></i></div></div>'
        );
      })
      .join("") +
    '</div><button class="btn" data-action="usage-detail:' +
    attr(entry.provider) +
    '">Dettagli provider</button></div></section>'
  );
}
function rulesPage() {
  var rules = (appState.rules || []).filter(function (rule) {
    var text = (
      rule.name +
      " " +
      (rule.description || "") +
      " " +
      (rule.scope || "")
    ).toLowerCase();
    if (ruleSearch && !text.includes(ruleSearch.toLowerCase())) return false;
    if (ruleFilter === "active" && !rule.enabled) return false;
    if (ruleFilter === "inactive" && rule.enabled) return false;
    if (ruleFilter === "global" && rule.scope !== "global") return false;
    if (ruleFilter === "local" && rule.scope === "global") return false;
    return true;
  });
  var globalRules = rules.filter(function (rule) {
      return rule.scope === "global";
    }),
    localRules = rules.filter(function (rule) {
      return rule.scope !== "global";
    });
  return (
    pageIntro("Guardrail chiari e controllabili.", appState.rules.length) +
    searchFilters(
      "Cerca regole…",
      [
        ["all", "Tutte"],
        ["active", "Attive"],
        ["inactive", "Disattivate"],
        ["global", "Globali"],
        ["local", "Locali"],
      ],
      ruleFilter,
      "rule-filter",
    ) +
    (globalRules.length
      ? '<div class="section-label"><strong>Globali</strong><span>' +
        globalRules.length +
        "</span></div>" +
        globalRules.map(ruleCard).join("")
      : "") +
    (localRules.length
      ? '<div class="section-label"><strong>Locali</strong><span>' +
        localRules.length +
        "</span></div>" +
        localRules.map(ruleCard).join("")
      : "") +
    (!rules.length
      ? '<div class="empty">' +
        icons.rules +
        "<strong>Nessuna regola</strong><p>Le regole si creano dal desktop.</p></div>"
      : "")
  );
}
function settingChoice(label, detail, actionKey, current, options) {
  return (
    '<section class="settings-card"><div class="settings-card-copy"><strong>' +
    esc(label) +
    "</strong><span>" +
    esc(detail) +
    '</span></div><div class="settings-chips">' +
    options
      .map(function (option) {
        return (
          '<button class="settings-chip ' +
          (String(current) === String(option[0]) ? "on" : "") +
          '" data-action="remote-pref:' +
          attr(actionKey) +
          ":" +
          attr(option[0]) +
          '">' +
          esc(option[1]) +
          "</button>"
        );
      })
      .join("") +
    "</div></section>"
  );
}
function providerSettingsCard(provider) {
  var preferences = appState.preferences || {};
  var defaults =
    (preferences.providerDefaults &&
      preferences.providerDefaults[provider.id]) ||
    {};
  var permissions = [
    ["read-only", "Lettura"],
    ["workspace-write", "Workspace"],
    ["full-access", "Completo"],
  ];
  return (
    '<section class="settings-card settings-provider"><div class="settings-provider-head"><span class="provider-mark">' +
    esc(providerShort(provider.id)) +
    '</span><span class="settings-card-copy"><strong>' +
    esc(provider.label) +
    "</strong><span>" +
    esc([defaults.model || "auto", defaults.reasoning || "auto"].join(" · ")) +
    '</span></span><button class="settings-default ' +
    (preferences.defaultProvider === provider.id ? "on" : "") +
    '" data-action="remote-pref:defaultProvider:' +
    attr(provider.id) +
    '">' +
    (preferences.defaultProvider === provider.id ? "Predefinito" : "Usa") +
    '</button></div><div class="settings-chips">' +
    permissions
      .map(function (option) {
        return (
          '<button class="settings-chip ' +
          (defaults.permission === option[0] ? "on" : "") +
          '" data-action="remote-provider-permission:' +
          attr(provider.id) +
          ":" +
          attr(option[0]) +
          '">' +
          esc(option[1]) +
          "</button>"
        );
      })
      .join("") +
    "</div></section>"
  );
}
function settingsPage() {
  var preferences = appState.preferences || {};
  var providers = (appState.providers || []).filter(function (provider) {
    return provider.available || provider.authenticated !== undefined;
  });
  var permissions = Object.values(preferences.providerDefaults || {}).map(
    function (entry) {
      return entry.permission;
    },
  );
  var commonPermission =
    permissions.length &&
    permissions.every(function (value) {
      return value === permissions[0];
    })
      ? permissions[0]
      : "mixed";
  var remoteMode = preferences.remoteAccessMode || "lan";
  return (
    pageIntro("Preferenze essenziali modificabili anche dal telefono.", "") +
    '<section class="settings-card settings-remote-summary"><span class="glyph">' +
    icons.shield +
    '</span><span class="settings-card-copy"><strong>Accesso remoto</strong><span>' +
    esc(
      remoteMode === "funnel"
        ? "Ovunque · Tailscale Funnel"
        : remoteMode === "tailnet"
          ? "Privata · Tailnet"
          : "Solo rete locale",
    ) +
    '</span></span><span class="status ready">Attivo</span></section>' +
    settingChoice(
      "Delega predefinita",
      "Come Relay gestisce le richieste ad altri agenti.",
      "delegationPolicy",
      preferences.delegationPolicy,
      [
        ["confirm", "Conferma"],
        ["automatic", "Automatica"],
        ["disabled", "Disattivata"],
      ],
    ) +
    settingChoice(
      "Politica quote",
      "Bilancia qualità e capacità residua dei provider.",
      "quotaPolicy",
      preferences.quotaPolicy,
      [
        ["balanced", "Bilanciata"],
        ["preserve", "Conserva"],
        ["unrestricted", "Libera"],
      ],
    ) +
    settingChoice(
      "Permesso iniziale globale",
      "Applica lo stesso livello alle nuove chat di tutti i provider.",
      "allPermissions",
      commonPermission,
      [
        ["read-only", "Lettura"],
        ["workspace-write", "Workspace"],
        ["full-access", "Completo"],
      ],
    ) +
    settingChoice(
      "Aggiornamento utilizzo",
      "Intervallo di lettura delle quote locali.",
      "usageAutoRefreshMinutes",
      preferences.usageAutoRefreshMinutes || 1,
      [
        [1, "1 min"],
        [5, "5 min"],
        [15, "15 min"],
        [30, "30 min"],
      ],
    ) +
    settingChoice(
      "Quote nel contesto agenti",
      "Permette a Relay di scegliere deleghe più responsabili.",
      "exposeUsageToAgents",
      preferences.exposeUsageToAgents ? "true" : "false",
      [
        ["true", "Attive"],
        ["false", "Disattive"],
      ],
    ) +
    '<div class="section-label"><strong>Provider</strong><span>' +
    providers.length +
    "</span></div>" +
    providers.map(providerSettingsCard).join("") +
    '<section class="settings-card"><div class="settings-card-copy"><strong>Aggiornamento Relay</strong><span>Installa una VSIX locale con reload e ripresa automatica.</span></div><button class="btn" data-action="open-sheet:update">' +
    icons.download +
    " Aggiorna da VSIX</button></section>"
  );
}

function mcpPage() {
  var snapshot = appState.mcp || { servers: [], errors: [] };
  var servers = snapshot.servers || [];
  var providers = ["claude", "codex", "antigravity", "copilot"];
  var body = pageIntro(
    "Server MCP rilevati. Dal telefono puoi attivarli o sospenderli.",
    servers.length,
  );
  if (snapshot.errors && snapshot.errors.length)
    body +=
      '<div class="sheet-info">' +
      snapshot.errors
        .map(function (item) {
          return esc(providerLabel(item.provider) + ": " + item.message);
        })
        .join("<br>") +
      "</div>";
  providers.forEach(function (provider) {
    var items = servers.filter(function (item) {
      return item.provider === provider;
    });
    if (!items.length) return;
    body +=
      '<div class="section-label"><strong>' +
      esc(providerLabel(provider)) +
      "</strong><span>" +
      items.length +
      "</span></div>" +
      items.map(mcpCard).join("");
  });
  if (!servers.length)
    body +=
      '<div class="empty">' +
      icons.workflow +
      "<strong>Nessun MCP trovato</strong><p>Aggiungi e configura i server dalla schermata desktop Relay.</p></div>";
  return body;
}
function mcpCard(server) {
  var state =
    server.status === "connected"
      ? "ready"
      : server.status === "failed"
        ? "bad"
        : "limited";
  var detail = [
    server.transport.toUpperCase(),
    server.scope === "global" ? "Globale" : "Progetto",
    server.target,
  ].join(" · ");
  return (
    '<section class="card"><div class="card-body rule-card"><div class="identity"><span class="glyph">' +
    icons.workflow +
    '</span><div class="identity-copy"><strong>' +
    esc(server.name) +
    "</strong><span>" +
    esc(detail) +
    '</span><small class="status ' +
    state +
    '">' +
    esc(server.status || "unknown") +
    '</small></div></div><button class="toggle ' +
    (server.enabled ? "on" : "") +
    '" data-action="toggle-mcp:' +
    attr(server.provider) +
    ":" +
    encodeURIComponent(server.name) +
    ":" +
    attr(server.scope) +
    ":" +
    !server.enabled +
    '" aria-label="' +
    (server.enabled ? "Disattiva" : "Attiva") +
    " " +
    attr(server.name) +
    '"><i></i></button></div></section>'
  );
}
function automationsPage() {
  var items = appState.automations || [];
  var body = pageIntro(
    "Task programmati. Girano quando l’editor con Relay è aperto.",
    items.length,
  );
  if (!items.length)
    return (
      body +
      '<div class="empty">' +
      icons.clock +
      "<strong>Nessuna automazione</strong><p>Creala dalla schermata desktop Relay, poi controllala da qui.</p></div>"
    );
  return body + items.map(automationCard).join("");
}
function automationCard(item) {
  var schedule = describeAutomation(item.schedule);
  var outcome = item.lastRun
    ? item.lastRun.outcome === "ok"
      ? "Completata"
      : item.lastRun.outcome === "error"
        ? "Errore"
        : "Saltata"
    : "Mai eseguita";
  var next =
    item.nextRunAt && item.enabled ? " · " + futureTime(item.nextRunAt) : "";
  return (
    '<section class="card"><div class="card-body"><div class="row"><div class="identity"><span class="glyph">' +
    icons.clock +
    '</span><div class="identity-copy"><strong>' +
    esc(item.name) +
    "</strong><span>" +
    esc(schedule) +
    "</span><small>" +
    esc(outcome + next) +
    '</small></div></div><button class="toggle ' +
    (item.enabled ? "on" : "") +
    '" data-action="toggle-automation:' +
    attr(item.id) +
    ":" +
    !item.enabled +
    '" aria-label="' +
    (item.enabled ? "Disattiva" : "Attiva") +
    " " +
    attr(item.name) +
    '"><i></i></button></div><div class="actions"><button class="btn primary" data-action="run-automation:' +
    attr(item.id) +
    '">' +
    icons.send +
    " Esegui ora</button></div></div></section>"
  );
}
function futureTime(value) {
  var ms = new Date(value).getTime() - Date.now();
  if (!isFinite(ms) || ms <= 0) return "ora";
  var minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return "tra " + minutes + "m";
  var hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  return "tra " + hours + "h" + (rest ? " " + rest + "m" : "");
}
function describeAutomation(schedule) {
  if (!schedule) return "Pianificazione non disponibile";
  if (schedule.kind === "interval")
    return "Ogni " + schedule.everyMinutes + " minuti";
  if (schedule.kind === "daily") return "Ogni giorno alle " + schedule.time;
  if (schedule.kind === "once")
    return "Una volta · " + new Date(schedule.at).toLocaleString("it-IT");
  var days = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  return (
    "Ogni " +
    (schedule.days || [])
      .map(function (day) {
        return days[day];
      })
      .join(", ") +
    " alle " +
    schedule.time
  );
}
function ruleCard(rule) {
  return (
    '<section class="card"><div class="card-body rule-card"><div class="identity"><span class="glyph">' +
    icons.rules +
    '</span><div class="identity-copy"><strong>' +
    esc(rule.name) +
    "</strong><span>" +
    esc(rule.description || "Guardrail Relay") +
    "</span><small>" +
    (rule.scope === "global" ? "Globale" : "Locale") +
    '</small></div></div><button class="toggle ' +
    (rule.enabled ? "on" : "") +
    '" data-action="toggle-rule:' +
    attr(rule.id) +
    ":" +
    !rule.enabled +
    '" aria-label="' +
    (rule.enabled ? "Disattiva" : "Attiva") +
    " " +
    attr(rule.name) +
    '"><i></i></button></div></section>'
  );
}
function searchFilters(placeholder, options, current, actionName) {
  return (
    '<label class="search">' +
    icons.search +
    '<input data-search="' +
    actionName +
    '" placeholder="' +
    attr(placeholder) +
    '"></label><div class="filters">' +
    options
      .map(function (option) {
        return (
          '<button class="filter ' +
          (current === option[0] ? "on" : "") +
          '" data-action="' +
          actionName +
          ":" +
          option[0] +
          '">' +
          esc(option[1]) +
          "</button>"
        );
      })
      .join("") +
    "</div>"
  );
}
function hydratePage() {
  if (section === "chat") hydrateComposer();
  document.querySelectorAll("[data-search]").forEach(function (input) {
    input.addEventListener("input", function () {
      if (input.getAttribute("data-search") === "agent-filter")
        agentSearch = input.value;
      else ruleSearch = input.value;
      render();
    });
  });
  var thread = document.getElementById("thread");
  if (thread) {
    if (lastConversationId !== currentConversation().id) {
      lastConversationId = currentConversation().id || "";
      lastMessageCount = (currentConversation().messages || []).length;
      requestAnimationFrame(function () {
        thread.scrollTop = thread.scrollHeight;
      });
    }
    thread.addEventListener(
      "scroll",
      function () {
        autoScroll =
          thread.scrollHeight - thread.clientHeight - thread.scrollTop < 96;
        if (autoScroll) hideNewMessages();
      },
      { passive: true },
    );
  }
}
function renderRemoteMentionPanel() {
  var panel = document.getElementById("remote-mention-panel");
  if (!panel) return;
  if (!remoteMentionOptions.length) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  panel.hidden = false;
  panel.innerHTML = remoteMentionOptions
    .map(function (item, index) {
      return '<button type="button" class="remote-mention-option ' + (index === remoteMentionIndex ? "active" : "") + '" data-remote-mention="' + index + '"><span>' + esc(item.label) + "</span><small>" + esc(item.detail) + "</small></button>";
    })
    .join("");
}
function updateRemoteMentions(input) {
  var cursor = input.selectionStart == null ? input.value.length : input.selectionStart;
  var before = input.value.slice(0, cursor);
  var match = /(?:^|\s)([@/])([^\s@/]*)$/.exec(before);
  if (!match) {
    remoteMentionOptions = [];
    remoteMentionRange = null;
    renderRemoteMentionPanel();
    return;
  }
  var start = cursor - match[0].trimStart().length;
  remoteMentionRange = { start: start, end: cursor };
  remoteMentionOptions = remoteMentionItems(match[1], match[2]);
  remoteMentionIndex = 0;
  renderRemoteMentionPanel();
}
function selectRemoteMention(input, index) {
  var option = remoteMentionOptions[index];
  if (!option || !remoteMentionRange) return;
  input.value = input.value.slice(0, remoteMentionRange.start) + option.token + " " + input.value.slice(remoteMentionRange.end);
  input.focus();
  var nextCursor = remoteMentionRange.start + option.token.length + 1;
  input.setSelectionRange(nextCursor, nextCursor);
  pendingPrompt = input.value;
  sessionStorage.setItem("relay_draft", pendingPrompt);
  remoteMentionOptions = [];
  remoteMentionRange = null;
  renderRemoteMentionPanel();
}
function hydrateComposer() {
  var form = document.getElementById("composer-form"),
    input = document.getElementById("prompt"),
    attachButton = document.getElementById("remote-attach-button"),
    attachInput = document.getElementById("remote-attachment-input"),
    mentionPanel = document.getElementById("remote-mention-panel");
  if (input) {
    input.value = pendingPrompt;
    input.style.height = "auto";
    input.style.height = Math.min(130, input.scrollHeight) + "px";
    input.addEventListener("input", function () {
      pendingPrompt = input.value;
      sessionStorage.setItem("relay_draft", pendingPrompt);
      input.style.height = "auto";
      input.style.height = Math.min(130, input.scrollHeight) + "px";
      updateRemoteMentions(input);
      syncComposerHeight();
    });
    input.addEventListener("keydown", function (event) {
      if (!remoteMentionOptions.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        remoteMentionIndex = (remoteMentionIndex + 1) % remoteMentionOptions.length;
        renderRemoteMentionPanel();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        remoteMentionIndex = (remoteMentionIndex + remoteMentionOptions.length - 1) % remoteMentionOptions.length;
        renderRemoteMentionPanel();
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        selectRemoteMention(input, remoteMentionIndex);
      } else if (event.key === "Escape") {
        remoteMentionOptions = [];
        remoteMentionRange = null;
        renderRemoteMentionPanel();
      }
    });
  }
  if (mentionPanel && input) {
    mentionPanel.addEventListener("click", function (event) {
      var target = event.target.closest("[data-remote-mention]");
      if (!target) return;
      selectRemoteMention(input, Number(target.getAttribute("data-remote-mention")));
    });
  }
  if (attachButton && attachInput) {
    attachButton.addEventListener("click", function () { attachInput.click(); });
    attachInput.addEventListener("change", function () {
      addRemoteFiles(Array.from(attachInput.files || []));
      attachInput.value = "";
    });
  }
  document.querySelectorAll("[data-attachment-index]").forEach(function (button) {
    button.addEventListener("click", function () {
      pendingRemoteAttachments.splice(Number(button.getAttribute("data-attachment-index")), 1);
      patchComposerState();
    });
  });
  observeComposerHeight();
  if (form)
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var run = currentRun();
      if (run) {
        action("cancelRun", { runId: run.id });
        return;
      }
      sendPrompt();
    });
}
function addRemoteFiles(files) {
  if (!files.length) return;
  var accepted = [];
  files.forEach(function (file) {
    if (pendingRemoteAttachments.length + accepted.length >= MAX_REMOTE_ATTACHMENTS) return toast("Massimo 10 allegati per messaggio.");
    if (file.size > MAX_REMOTE_ATTACHMENT_BYTES) return toast("Allegato troppo grande: massimo 20 MB.");
    accepted.push(file);
  });
  if (!accepted.length) return;
  pendingRemoteAttachments = pendingRemoteAttachments.concat(accepted);
  patchComposerState();
}
async function saveRemoteAttachments(files) {
  if (!files.length) return [];
  var requestId = "remote-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  var attachments = [];
  for (var i = 0; i < files.length; i += 1) {
    var file = files[i];
    var buffer = await file.arrayBuffer();
    attachments.push({ id: requestId + "-" + i, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, bytes: Array.from(new Uint8Array(buffer)) });
  }
  var result = await action("saveChatAttachments", { requestId: requestId, attachments: attachments }, { refresh: false });
  var saved = result && result.attachmentsSaved;
  if (!saved || saved.error) throw new Error((saved && saved.error) || "Salvataggio allegati non riuscito.");
  return saved.files || [];
}
function renderOverlays() {
  overlayRoot.innerHTML =
    (drawerOpen
      ? '<div class="backdrop" data-action="close-drawer"></div>' +
        drawerMarkup()
      : "") +
    (sheet
      ? '<div class="backdrop" data-action="close-sheet"></div>' + sheetMarkup()
      : "") +
    (previewState ? previewMarkup() : "");
  hydrateOverlay();
}
function drawerMarkup() {
  var current = appState.workspace || {};
  var conversations = (appState.conversations || [])
    .slice()
    .sort(function (a, b) {
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
  var running = conversations.filter(function (c) {
    return activeRuns().some(function (run) {
      return run.conversationId === c.id;
    });
  });
  var recent = conversations
    .filter(function (c) {
      return !running.includes(c);
    })
    .slice(0, 8);
  return (
    '<aside class="drawer"><div class="drawer-head"><strong>Conversazioni</strong><button class="icon-btn" data-action="close-drawer" aria-label="Chiudi">' +
    icons.close +
    '</button></div><button class="drawer-project" data-action="section:projects"><span class="glyph">' +
    icons.folder +
    '</span><span class="drawer-project-copy"><small>Progetto corrente</small><strong>' +
    esc(current.name || "Workspace") +
    "</strong><span>" +
    esc(compactPath(current.cwd || "")) +
    '</span></span><span class="connection-state"><i class="conversation-state done"></i></span></button><div class="drawer-scroll"><label class="search">' +
    icons.search +
    '<input id="drawer-search" placeholder="Cerca conversazioni…"></label>' +
    (running.length ? drawerGroup("In esecuzione", running, "running") : "") +
    (recent.length
      ? drawerGroup("Recenti", recent, "done")
      : '<div class="empty" style="margin-top:12px">' +
        icons.chat +
        "<strong>Nessuna conversazione</strong><p>Avvia una nuova chat nel progetto corrente.</p></div>") +
    '<div class="drawer-actions"><button class="btn primary" data-action="new-chat">' +
    icons.plus +
    ' Nuova chat</button><button class="btn" data-action="section:projects">' +
    icons.folder +
    " Apri progetto</button></div></div></aside>"
  );
}
function drawerGroup(title, items, stateName) {
  return (
    '<div class="drawer-section"><div class="drawer-section-title"><strong>' +
    esc(title) +
    "</strong><span>" +
    items.length +
    "</span></div>" +
    items
      .map(function (c) {
        var run = activeRuns().find(function (r) {
          return r.conversationId === c.id;
        });
        var stateClass = run ? (run.error ? "error" : "running") : stateName;
        return (
          '<button class="conversation-row ' +
          (c.id === currentConversation().id ? "active" : "") +
          '" data-action="conversation:' +
          attr(c.id) +
          '" data-conversation-search="' +
          attr((c.title + " " + providerLabel(c.provider)).toLowerCase()) +
          '"><i class="conversation-state ' +
          stateClass +
          '"></i><span class="conversation-copy"><strong>' +
          esc(c.title || "Nuova conversazione") +
          "</strong><span>" +
          esc(providerLabel(c.provider)) +
          " · " +
          relativeTime(c.updatedAt) +
          "</span></span>" +
          icons.chevron +
          "</button>"
        );
      })
      .join("") +
    "</div>"
  );
}
function sheetMarkup() {
  return (
    '<section class="sheet" id="active-sheet">' + renderSheet() + "</section>"
  );
}
function sheetFrame(title, subtitle, body, footer) {
  return (
    '<div class="sheet-handle" data-drag-handle></div><div class="sheet-head"><div><strong>' +
    esc(title) +
    "</strong><span>" +
    esc(subtitle) +
    '</span></div><button class="icon-btn" data-action="close-sheet" aria-label="Chiudi">' +
    icons.close +
    '</button></div><div class="sheet-body">' +
    body +
    "</div>" +
    (footer ? '<div class="sheet-footer">' + footer + "</div>" : "")
  );
}
function renderSheet() {
  if (sheet.type === "conversations") return conversationsSheet();
  if (sheet.type === "provider") return providerSheet();
  if (sheet.type === "model") return modelSheet();
  if (sheet.type === "controls") return controlsSheet();
  if (sheet.type === "agent") return agentSheet();
  if (sheet.type === "usage-detail") return usageDetailSheet(sheet.data);
  if (sheet.type === "page-menu") return pageMenuSheet();
  if (sheet.type === "more-nav") return moreNavSheet();
  if (sheet.type === "update") return updateSheet();
  return "";
}
function conversationsSheet() {
  var list = (appState.conversations || []).slice().sort(function (a, b) {
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
  var running = list.filter(function (c) {
    return activeRuns().some(function (run) {
      return run.conversationId === c.id;
    });
  });
  var recent = list
    .filter(function (c) {
      return !running.includes(c);
    })
    .slice(0, 10);
  var body =
    '<label class="search">' +
    icons.search +
    '<input id="conversation-search" placeholder="Cerca chat…"></label>' +
    (running.length ? drawerGroup("In esecuzione", running, "running") : "") +
    (recent.length ? drawerGroup("Recenti", recent, "done") : "");
  return sheetFrame(
    "Conversazioni",
    "Chat e attività del progetto corrente.",
    body,
    '<button class="btn primary wide" data-action="new-chat">' +
      icons.plus +
      " Nuova chat</button>",
  );
}
function providerSheet() {
  var current = currentConversation(),
    providers = appState.providers || [],
    selected =
      (pendingSelection && pendingSelection.provider) || current.provider;
  var body =
    '<div class="sheet-list">' +
    providers
      .map(function (provider, index) {
        var health = providerHealth(provider);
        return (
          '<button class="sheet-option ' +
          (provider.id === selected ? "active" : "") +
          '" data-action="pending-provider:' +
          attr(provider.id) +
          '"><span class="glyph">' +
          providerShort(provider.id) +
          '</span><span class="sheet-option-copy"><strong>' +
          esc(provider.label) +
          (index === 0
            ? '<small class="recommended">Consigliato</small>'
            : "") +
          "</strong><span>" +
          esc(providerDescription(provider.id)) +
          " · " +
          health.label +
          '</span></span><span class="radio">' +
          (provider.id === selected ? "✓" : "") +
          "</span></button>"
        );
      })
      .join("") +
    '</div><div class="sheet-info">Relay applicherà un modello coerente se quello corrente non è disponibile.</div>';
  return sheetFrame(
    "Scegli provider",
    "Cambia il motore della chat corrente.",
    body,
    '<button class="btn primary wide" data-action="confirm-provider">Conferma e continua</button>',
  );
}
function modelSheet() {
  var current = currentConversation(),
    provider = currentProvider(),
    models = ((provider && provider.models) || []).filter(function (model) {
      return !model.hidden;
    }),
    selected = (pendingSelection && pendingSelection.model) || current.model;
  var body =
    '<div class="sheet-list">' +
    (models.length
      ? models
          .map(function (model) {
            return (
              '<button class="sheet-option ' +
              (model.id === selected ? "active" : "") +
              '" data-action="pending-model:' +
              attr(model.id) +
              '"><span class="glyph">' +
              providerShort(current.provider) +
              '</span><span class="sheet-option-copy"><strong>' +
              esc(model.label || model.id) +
              "</strong><span>" +
              esc(model.description || model.family || "Modello disponibile") +
              '</span></span><span class="radio">' +
              (model.id === selected ? "✓" : "") +
              "</span></button>"
            );
          })
          .join("")
      : '<div class="empty"><strong>Nessun modello disponibile</strong><p>Il provider non ha restituito modelli selezionabili.</p></div>') +
    '</div><div class="sheet-info">Il modello influenza qualità, velocità e consumo della risposta.</div>';
  return sheetFrame(
    "Scegli modello",
    "Modelli disponibili dal provider selezionato.",
    body,
    '<button class="btn primary wide" data-action="confirm-model">Conferma e continua</button>',
  );
}
function controlsSheet() {
  var current = currentConversation(),
    model = ((currentProvider() && currentProvider().models) || []).find(
      function (item) {
        return item.id === current.model;
      },
    ),
    reasoning = (model && model.reasoning) || [],
    permissions = [
      ["read-only", "Sola lettura"],
      ["workspace-write", "Workspace"],
      ["full-access", "Accesso completo"],
    ];
  var body =
    '<button class="sheet-option" data-action="open-sheet:model"><span class="glyph">' +
    providerShort(current.provider) +
    '</span><span class="sheet-option-copy"><strong>' +
    esc(current.model || "Automatico") +
    "</strong><span>Scegli modello</span></span>" +
    icons.chevron +
    '</button><div class="section-label" style="margin-top:15px"><strong>Ragionamento</strong></div><div class="sheet-list">' +
    (reasoning.length
      ? reasoning
          .map(function (option) {
            return simpleOption(
              "reasoning",
              option.id,
              option.label || option.id,
              option.description || "",
              current.reasoning === option.id,
            );
          })
          .join("")
      : '<div class="sheet-info">Questo modello non espone livelli separati.</div>') +
    '</div><div class="section-label" style="margin-top:15px"><strong>Permessi</strong></div><div class="sheet-list">' +
    permissions
      .map(function (option) {
        return simpleOption(
          "permission",
          option[0],
          option[1],
          option[0] === "read-only"
            ? "Analisi senza modifiche"
            : option[0] === "workspace-write"
              ? "Può modificare il progetto aperto"
              : "Può operare anche fuori dal workspace",
          current.permission === option[0],
        );
      })
      .join("") +
    '</div><div class="section-label" style="margin-top:15px"><strong>Agente</strong></div><button class="sheet-option" data-action="open-sheet:agent"><span class="glyph">' +
    icons.agent +
    '</span><span class="sheet-option-copy"><strong>' +
    (selectedAgent() ? esc(selectedAgent().name) : "Nessun agente") +
    "</strong><span>Apri la selezione agenti</span></span>" +
    icons.chevron +
    "</button>";
  return sheetFrame(
    "Controlli avanzati",
    "Modello, ragionamento, permessi e agente.",
    body,
    "",
  );
}
function simpleOption(kind, value, label, description, active) {
  return (
    '<button class="sheet-option ' +
    (active ? "active" : "") +
    '" data-action="select-' +
    kind +
    ":" +
    attr(value) +
    '"><span class="glyph">' +
    (kind === "permission" ? icons.lock : icons.tune) +
    '</span><span class="sheet-option-copy"><strong>' +
    esc(label) +
    "</strong><span>" +
    esc(description) +
    '</span></span><span class="radio">' +
    (active ? "✓" : "") +
    "</span></button>"
  );
}
function agentSheet() {
  var current = selectedAgent(),
    agents = visibleAgents();
  var body =
    '<div class="sheet-list"><button class="sheet-option ' +
    (!current ? "active" : "") +
    '" data-action="clear-agent"><span class="glyph">' +
    icons.tune +
    '</span><span class="sheet-option-copy"><strong>Nessun agente</strong><span>Controllo manuale di provider e modello</span></span><span class="radio">' +
    (!current ? "✓" : "") +
    "</span></button>" +
    agents
      .map(function (agent) {
        var health = providerHealth(providerEntry(agent.provider));
        return (
          '<button class="sheet-option ' +
          (current && current.id === agent.id ? "active" : "") +
          '" data-action="select-agent:' +
          attr(agent.id) +
          '"><span class="glyph">' +
          icons.agent +
          '</span><span class="sheet-option-copy"><strong>' +
          esc(agent.name) +
          "</strong><span>" +
          esc(agent.specialization || providerLabel(agent.provider)) +
          " · " +
          health.label +
          '</span></span><span class="radio">' +
          (current && current.id === agent.id ? "✓" : "") +
          "</span></button>"
        );
      })
      .join("") +
    "</div>";
  return sheetFrame(
    "Seleziona agente",
    "Usa un profilo configurato sul desktop.",
    body,
    "",
  );
}
function usageDetailSheet(providerId) {
  var entry = (appState.usage || []).find(function (item) {
    return item.provider === providerId;
  });
  var body =
    entry && entry.buckets && entry.buckets.length
      ? '<div class="sheet-list">' +
        entry.buckets
          .map(function (bucket) {
            return (
              '<div class="sheet-option"><span class="glyph">' +
              icons.usage +
              '</span><span class="sheet-option-copy"><strong>' +
              esc(
                [bucket.group, bucket.label].filter(Boolean).join(" · ") ||
                  "Quota",
              ) +
              "</strong><span>" +
              (bucket.resetsAt
                ? "Reset " + new Date(bucket.resetsAt).toLocaleString("it-IT")
                : "Reset non disponibile") +
              "</span></span><span>" +
              pct(bucket.remainingFraction) +
              "</span></div>"
            );
          })
          .join("") +
        "</div>"
      : '<div class="empty"><strong>Nessun dettaglio</strong><p>Il provider non ha restituito bucket aggiuntivi.</p></div>';
  return sheetFrame(
    providerLabel(providerId),
    "Dettagli quota disponibili dalla CLI locale.",
    body,
    "",
  );
}
function moreNavSheet() {
  var items = [
    ["usage", "usage", "Utilizzo", "Quote e capacità provider"],
    ["rules", "rules", "Regole", "Guardrail e skill pubblicate"],
    ["mcp", "workflow", "MCP", "Server e connessioni strumenti"],
    ["settings", "settings", "Impostazioni", "Preferenze Relay dal telefono"],
  ];
  var body =
    '<div class="more-grid">' +
    items
      .map(function (item) {
        return (
          '<button class="more-card" data-action="section:' +
          item[0] +
          '"><span class="glyph">' +
          icons[item[1]] +
          "</span><span><strong>" +
          esc(item[2]) +
          "</strong><small>" +
          esc(item[3]) +
          "</small></span>" +
          icons.chevron +
          "</button>"
        );
      })
      .join("") +
    "</div>";
  return sheetFrame("Altro", "Strumenti e preferenze Relay.", body, "");
}

function pageMenuSheet() {
  var body =
    '<div class="sheet-list"><button class="sheet-option" data-action="refresh"><span class="glyph">' +
    icons.refresh +
    '</span><span class="sheet-option-copy"><strong>Aggiorna</strong><span>Richiede subito lo stato più recente a Relay.</span></span>' +
    icons.chevron +
    '</button><button class="sheet-option" data-action="open-sheet:update"><span class="glyph">' +
    icons.download +
    '</span><span class="sheet-option-copy"><strong>Aggiorna Relay da file VSIX</strong><span>Installa una nuova versione e ricarica l’editor mantenendo la sessione remota.</span></span>' +
    icons.chevron +
    "</button></div>";
  return sheetFrame(
    "Azioni",
    "Sincronizzazione, aggiornamento e stato della pagina.",
    body,
    "",
  );
}
function updateSheet() {
  var value = pendingUpdatePath || latestVsixPath();
  var confirm = sheet && sheet.data === "confirm";
  var body =
    '<div class="update-form"><label for="update-vsix-path">Percorso locale del file VSIX</label><input id="update-vsix-path" value="' +
    attr(value) +
    '" placeholder="/percorso/Relay-0_21_3.vsix" autocomplete="off" spellcheck="false">' +
    (confirm
      ? '<div class="update-warning"><strong>Conferma aggiornamento</strong><br>Relay installerà il VSIX e ricaricherà l’editor. La pagina resterà aperta e proverà a riconnettersi automaticamente per circa 10 secondi.</div>'
      : '<div class="sheet-info">Puoi usare un percorso assoluto oppure un file .vsix presente nel workspace. L’ultimo risultato VSIX della chat viene proposto automaticamente.</div>') +
    "</div>";
  var footer = confirm
    ? '<button class="btn primary wide" data-action="confirm-update">Installa e ricarica Relay</button>'
    : '<button class="btn primary wide" data-action="prepare-update">Continua</button>';
  return sheetFrame(
    "Aggiorna Relay",
    "Installazione controllata da un file VSIX locale.",
    body,
    footer,
  );
}
function prepareUpdate() {
  var input = document.getElementById("update-vsix-path");
  var value = String((input && input.value) || "").trim();
  if (!value || !value.toLowerCase().endsWith(".vsix")) {
    toast("Indica un file locale con estensione .vsix.");
    return;
  }
  pendingUpdatePath = value;
  sessionStorage.setItem("relay_update_vsix_path", value);
  sheet = { type: "update", data: "confirm" };
  renderOverlays();
}
async function confirmUpdate() {
  if (!pendingUpdatePath) {
    toast("Percorso VSIX non disponibile.");
    return;
  }
  closeSheet();
  setConnection("reconnecting");
  toast("Aggiornamento avviato. Relay si riconnetterà dopo il reload…");
  await action(
    "updateExtensionFromVsix",
    { path: pendingUpdatePath, confirmed: true },
    { refresh: false },
  );
}
function artifactAt(messageIndex, artifactIndex) {
  var message = (currentConversation().messages || [])[Number(messageIndex)];
  var artifact =
    message && Array.isArray(message.artifacts)
      ? message.artifacts[Number(artifactIndex)]
      : null;
  return artifact ? { message: message, artifact: artifact } : null;
}
async function requestPreviewAccess(message, artifact) {
  return request("/api/preview-ticket", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId: currentConversation().id,
      messageId: message.id,
      artifactId: artifact.id,
    }),
  });
}
async function downloadArtifact(messageIndex, artifactIndex) {
  var entry = artifactAt(messageIndex, artifactIndex);
  if (!entry) return;
  var paths = artifactPaths(entry.message, entry.artifact);
  try {
    var response = await fetch(paths.base, {
      credentials: "same-origin",
      headers: sessionToken ? { authorization: "Bearer " + sessionToken } : {},
    });
    if (!response.ok) {
      var data = {};
      try {
        data = await response.json();
      } catch (_) {}
      throw new Error(data.error || "Download non disponibile.");
    }
    var blob = await response.blob();
    var objectUrl = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = objectUrl;
    link.download = entry.artifact.name || "relay-file";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(objectUrl);
    }, 2000);
    toast("Download avviato.");
  } catch (error) {
    toast(error.message || "Download non disponibile.");
  }
}
async function shareArtifact(messageIndex, artifactIndex) {
  var entry = artifactAt(messageIndex, artifactIndex);
  if (!entry) return;
  try {
    var ticket = await requestPreviewAccess(entry.message, entry.artifact);
    var absoluteUrl = new URL(ticket.url, location.href).href;
    if (navigator.share) {
      await navigator.share({
        title: entry.artifact.name || "Risultato Relay",
        url: absoluteUrl,
      });
    } else {
      await navigator.clipboard.writeText(absoluteUrl);
      toast("Link temporaneo copiato.");
    }
  } catch (error) {
    toast(error.message || "Condivisione non disponibile.");
  }
}
async function openArtifactPreview(messageIndex, artifactIndex) {
  var entry = artifactAt(messageIndex, artifactIndex);
  if (!entry) return;
  previewState = {
    title: entry.artifact.name || "Anteprima Relay",
    src: "",
    image: artifactType(entry.artifact) === "image",
    loading: true,
    error: "",
  };
  renderOverlays();
  try {
    var ticket = await requestPreviewAccess(entry.message, entry.artifact);
    if (!previewState) return;
    previewState.src = ticket.url;
    previewState.loading = false;
    renderOverlays();
  } catch (error) {
    if (!previewState) return;
    previewState.loading = false;
    previewState.error = error.message || "Anteprima non disponibile.";
    renderOverlays();
  }
}
function closeArtifactPreview() {
  previewState = null;
  renderOverlays();
}
function openPreviewBrowser() {
  if (!previewState || !previewState.src) return;
  window.open(previewState.src, "_blank", "noopener,noreferrer");
}
async function shareCurrentPreview() {
  if (!previewState || !previewState.src) return;
  var absoluteUrl = new URL(previewState.src, location.href).href;
  try {
    if (navigator.share)
      await navigator.share({ title: previewState.title, url: absoluteUrl });
    else {
      await navigator.clipboard.writeText(absoluteUrl);
      toast("Link temporaneo copiato.");
    }
  } catch (error) {
    if (error && error.name !== "AbortError")
      toast("Condivisione non disponibile.");
  }
}
function previewMarkup() {
  var body = "";
  if (previewState.loading)
    body =
      '<div class="preview-loading"><span class="spinner"></span><span>Caricamento anteprima…</span></div>';
  else if (previewState.error)
    body =
      '<div class="preview-error-card"><strong>Anteprima non disponibile</strong><p>' +
      esc(previewState.error) +
      '</p><button class="btn" data-action="close-preview">Chiudi</button></div>';
  else
    body = previewState.image
      ? '<img id="preview-content" src="' +
        attr(previewState.src) +
        '" alt="' +
        attr(previewState.title) +
        '">'
      : '<iframe id="preview-content" src="' +
        attr(previewState.src) +
        '" title="' +
        attr(previewState.title) +
        '"></iframe>';
  return (
    '<div class="backdrop" data-action="close-preview"></div><section class="preview-modal"><header class="preview-head"><strong>' +
    esc(previewState.title) +
    '</strong><div class="preview-head-actions">' +
    (previewState.src
      ? '<button class="preview-icon-btn" data-action="share-preview" aria-label="Condividi">' +
        icons.share +
        '</button><button class="preview-icon-btn" data-action="open-preview-browser" aria-label="Apri nel browser">' +
        icons.external +
        "</button>"
      : "") +
    '<button class="preview-icon-btn" data-action="close-preview" aria-label="Chiudi anteprima">' +
    icons.close +
    '</button></div></header><div class="preview-body">' +
    body +
    "</div></section>"
  );
}
function hydrateOverlay() {
  var handle = document.querySelector("[data-drag-handle]");
  if (handle) {
    handle.addEventListener("pointerdown", function (event) {
      sheetStartY = event.clientY;
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointerup", function (event) {
      if (event.clientY - sheetStartY > 70) closeSheet();
    });
  }
  var search =
    document.getElementById("conversation-search") ||
    document.getElementById("drawer-search");
  if (search)
    search.addEventListener("input", function () {
      var query = search.value.toLowerCase();
      document
        .querySelectorAll("[data-conversation-search]")
        .forEach(function (row) {
          row.hidden = !row
            .getAttribute("data-conversation-search")
            .toLowerCase()
            .includes(query);
        });
    });
  var content = document.getElementById("preview-content"),
    modal = document.querySelector(".preview-modal");
  if (content && modal) {
    content.addEventListener("load", function () {
      modal.classList.add("is-loaded");
    });
    content.addEventListener("error", function () {
      modal.classList.add("is-error");
    });
  }
}
function openDrawer() {
  captureDraft();
  drawerOpen = true;
  renderOverlays();
}
function closeDrawer() {
  drawerOpen = false;
  renderOverlays();
}
function openSheet(type, data) {
  captureDraft();
  pendingSelection = null;
  sheet = { type: type, data: data };
  renderOverlays();
}
function closeSheet() {
  sheet = null;
  pendingSelection = null;
  renderOverlays();
}
function setSection(value) {
  captureDraft();
  section = value;
  sessionStorage.setItem("relay_section", value);
  drawerOpen = false;
  sheet = null;
  render();
  var scroll = document.querySelector(".page-scroll");
  if (scroll) scroll.scrollTop = 0;
}
function newChat() {
  closeSheet();
  closeDrawer();
  action("newConversation", { provider: currentConversation().provider });
  section = "chat";
  sessionStorage.setItem("relay_section", "chat");
}
function openConversation(id) {
  closeSheet();
  closeDrawer();
  action("selectConversation", { id: id });
  section = "chat";
  sessionStorage.setItem("relay_section", "chat");
  autoScroll = true;
}
function firstModel(provider) {
  var models = ((provider && provider.models) || []).filter(function (model) {
    return !model.hidden;
  });
  return (
    models.find(function (model) {
      return model.isDefault;
    }) || models[0]
  );
}
async function confirmProvider() {
  var id =
      (pendingSelection && pendingSelection.provider) ||
      currentConversation().provider,
    provider = providerEntry(id);
  if (!provider || !provider.available) {
    toast("Il provider selezionato non è disponibile.");
    return;
  }
  var model = firstModel(provider);
  await action("setSelection", {
    provider: id,
    model: model && model.id,
    reasoning: model && model.defaultReasoning,
    permission: currentConversation().permission,
  });
  closeSheet();
}
async function confirmModel() {
  var id =
    (pendingSelection && pendingSelection.model) || currentConversation().model;
  await action("setSelection", {
    provider: currentConversation().provider,
    model: id,
    reasoning: "auto",
    permission: currentConversation().permission,
  });
  closeSheet();
}
async function selectReasoning(id) {
  await action("setSelection", {
    provider: currentConversation().provider,
    model: currentConversation().model,
    reasoning: id,
    permission: currentConversation().permission,
  });
  closeSheet();
}
async function selectPermission(value) {
  await action("setPermission", { permission: value });
  closeSheet();
}
async function selectAgent(id) {
  await action("selectAgent", { agentId: id });
  closeSheet();
  section = "chat";
  render();
}
async function clearAgent() {
  var c = currentConversation();
  await action("setSelection", {
    provider: c.provider,
    model: c.model,
    reasoning: c.reasoning,
    permission: c.permission,
  });
  closeSheet();
}
async function sendPrompt() {
  var input = document.getElementById("prompt"),
    prompt = ((input && input.value) || "").trim(),
    attachments = pendingRemoteAttachments.slice();
  if ((!prompt && !attachments.length) || currentRun() || optimisticSend) return;
  var c = currentConversation();
  var previousPrompt = prompt;
  var previousAttachments = attachments.slice();
  optimisticSend = {
    prompt: attachmentDisplayPrompt(prompt, attachments),
    conversationId: c.id,
    startedAt: new Date().toISOString(),
  };
  pendingPrompt = "";
  pendingRemoteAttachments = [];
  sessionStorage.removeItem("relay_draft");
  if (input) {
    input.value = "";
    input.disabled = true;
  }
  autoScroll = true;
  patchChat();
  scrollBottom();
  var ok = false;
  try {
    var saved = await saveRemoteAttachments(attachments);
    var providerPrompt = saved.length ? attachmentPrompt(prompt, saved) : prompt;
    var displayPrompt = saved.length ? attachmentDisplayPrompt(prompt, attachments) : prompt;
    ok = await action(
      "sendMessage",
      {
        prompt: providerPrompt,
        displayPrompt: displayPrompt,
        provider: c.provider,
        model: c.model,
        reasoning: c.reasoning,
        permission: c.permission,
        agentId: c.agentId,
      },
      { refresh: false },
    );
  } catch (error) {
    toast(error.message || "Allegati non salvati.");
  }
  if (!ok) {
    optimisticSend = null;
    pendingPrompt = previousPrompt;
    pendingRemoteAttachments = previousAttachments;
    sessionStorage.setItem("relay_draft", pendingPrompt);
    patchChat();
    var restored = document.getElementById("prompt");
    if (restored) {
      restored.disabled = false;
      restored.value = pendingPrompt;
      restored.focus();
    }
  } else scheduleStateLoad(650);
}
function copyMessage(index) {
  var message = (currentConversation().messages || [])[Number(index)];
  if (!message) return;
  navigator.clipboard.writeText(message.text || message.content || "").then(
    function () {
      toast("Risposta copiata.");
    },
    function () {
      toast("Copia non disponibile.");
    },
  );
}
function filterAction(kind, value) {
  if (kind === "agent") agentFilter = value;
  else ruleFilter = value;
  render();
}
function dispatchAction(source) {
  var parts = String(source || "").split(":"),
    actionName = parts.shift(),
    value = parts.join(":");
  if (actionName === "reload") resumeConnection();
  else if (actionName === "pair") pairDevice();
  else if (actionName === "new-pairing")
    toast("Genera un nuovo QR dal pannello Remoto di Relay sul computer.");
  else if (actionName === "open-drawer") openDrawer();
  else if (actionName === "close-drawer") closeDrawer();
  else if (actionName === "open-sheet") openSheet(value);
  else if (actionName === "close-sheet") closeSheet();
  else if (actionName === "section") setSection(value);
  else if (actionName === "refresh") {
    closeSheet();
    load(true);
    toast("Sincronizzazione richiesta…");
  } else if (actionName === "new-chat") newChat();
  else if (actionName === "conversation") openConversation(value);
  else if (actionName === "toggle-live-details") {
    liveDetailsOpen = !liveDetailsOpen;
    patchChat();
  } else if (actionName === "scroll-bottom") scrollBottom();
  else if (actionName === "copy-message") copyMessage(value);
  else if (actionName === "project-picker")
    action("requestRemoteProjectPicker", {});
  else if (actionName === "open-project")
    action("requestRemoteProjectOpen", { path: decodeURIComponent(value) });
  else if (actionName === "select-agent") selectAgent(value);
  else if (actionName === "clear-agent") clearAgent();
  else if (actionName === "toggle-rule") {
    var values = value.split(":");
    action("toggleRule", { id: values[0], enabled: values[1] === "true" });
  } else if (actionName === "toggle-mcp") {
    var mcpValues = value.split(":");
    action("toggleMcp", {
      provider: mcpValues[0],
      name: decodeURIComponent(mcpValues[1]),
      scope: mcpValues[2],
      enabled: mcpValues[3] === "true",
    });
  } else if (actionName === "toggle-automation") {
    var autoValues = value.split(":");
    action("toggleAutomation", {
      id: autoValues[0],
      enabled: autoValues[1] === "true",
    });
  } else if (actionName === "run-automation") {
    action("runAutomationNow", { id: value });
  } else if (actionName === "agent-filter") filterAction("agent", value);
  else if (actionName === "rule-filter") filterAction("rule", value);
  else if (actionName === "pending-provider") {
    pendingSelection = { provider: value };
    renderOverlays();
  } else if (actionName === "confirm-provider") confirmProvider();
  else if (actionName === "pending-model") {
    pendingSelection = { model: value };
    renderOverlays();
  } else if (actionName === "confirm-model") confirmModel();
  else if (actionName === "select-reasoning") selectReasoning(value);
  else if (actionName === "select-permission") selectPermission(value);
  else if (actionName === "usage-detail") openSheet("usage-detail", value);
  else if (actionName === "prepare-update") prepareUpdate();
  else if (actionName === "confirm-update") confirmUpdate();
  else if (actionName === "resolve-run")
    action("resolveRunError", { runId: value });
  else if (actionName === "preview-artifact") {
    var indexes = value.split(":");
    openArtifactPreview(indexes[0], indexes[1]);
  } else if (actionName === "download-artifact") {
    var downloadIndexes = value.split(":");
    downloadArtifact(downloadIndexes[0], downloadIndexes[1]);
  } else if (actionName === "share-artifact") {
    var shareIndexes = value.split(":");
    shareArtifact(shareIndexes[0], shareIndexes[1]);
  } else if (actionName === "open-preview-browser") openPreviewBrowser();
  else if (actionName === "share-preview") shareCurrentPreview();
  else if (actionName === "remote-pref") {
    var prefValues = value.split(":");
    var prefKey = prefValues.shift();
    var prefValue = prefValues.join(":");
    if (prefKey === "allPermissions")
      action("updateAllProviderPermissions", { permission: prefValue });
    else {
      var parsedPref = prefValue;
      if (prefValue === "true" || prefValue === "false")
        parsedPref = prefValue === "true";
      else if (prefKey === "usageAutoRefreshMinutes")
        parsedPref = Number(prefValue);
      var patch = {};
      patch[prefKey] = parsedPref;
      action("updatePreferences", patch);
    }
  } else if (actionName === "remote-provider-permission") {
    var providerValues = value.split(":");
    action("updateProviderDefaults", {
      provider: providerValues[0],
      permission: providerValues[1],
    });
  } else if (actionName === "close-preview") closeArtifactPreview();
  else if (actionName === "copy-artifact-path")
    navigator.clipboard.writeText(decodeURIComponent(value)).then(
      function () {
        toast("Percorso copiato.");
      },
      function () {
        toast("Copia non disponibile.");
      },
    );
}
document.addEventListener("click", function (event) {
  var target =
    event.target && event.target.closest
      ? event.target.closest("[data-action]")
      : null;
  if (!target) return;
  event.preventDefault();
  dispatchAction(target.getAttribute("data-action") || "");
});
if (window.visualViewport) {
  function keyboard() {
    var viewport = window.visualViewport;
    var offset = Math.max(
      0,
      window.innerHeight - viewport.height - viewport.offsetTop,
    );
    document.documentElement.style.setProperty(
      "--keyboard-offset",
      offset + "px",
    );
    document.body.classList.toggle("keyboard-open", offset > 120);
  }
  window.visualViewport.addEventListener("resize", keyboard);
  window.visualViewport.addEventListener("scroll", keyboard);
  keyboard();
}
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") resumeConnection();
});
window.addEventListener("pageshow", resumeConnection);
window.addEventListener("online", resumeConnection);
window.addEventListener("beforeunload", function () {
  captureDraft();
  if (events) events.close();
  clearInterval(pollTimer);
});
load();
</script>
</body>
</html>`;
}
