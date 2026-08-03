import { el } from './dom.js';
import { classifyLinkTarget } from '../core/resource-classifier.js';

export interface MarkdownRenderOptions { agents?: Array<{ id: string; name: string }> }

interface MentionToken {
  rawText: string;
  displayText: string;
  entityId: string;
  entityType: 'provider' | 'agent' | 'file' | 'directory' | 'skill';
  start: number;
  endExclusive: number;
  resolvedValue: string;
}

export function renderMarkdown(text: string, options: MarkdownRenderOptions = {}): HTMLElement {
  const container = el('div', 'markdown');
  const blocks = splitCodeBlocks(text);
  for (const block of blocks) {
    if (block.type === 'code') {
      const wrapper = el('div', 'code-block');
      const header = el('div', 'code-block__header');
      header.append(el('span', '', block.language || 'code'));
      const copy = el('button', 'code-block__copy', 'Copia');
      copy.type = 'button';
      copy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(block.content);
        copy.textContent = 'Copiato';
        setTimeout(() => { copy.textContent = 'Copia'; }, 1200);
      });
      header.append(copy);
      const pre = el('pre');
      const code = el('code');
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

function renderTextBlock(container: HTMLElement, text: string, options: MarkdownRenderOptions): void {
  const lines = text.split(/\r?\n/);
  let list: HTMLUListElement | HTMLOListElement | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? '';
    const line = rawLine.trimEnd();
    const next = lines[index + 1]?.trim() ?? '';

    if (isTableHeader(line, next)) {
      list = undefined;
      const tableLines = [line];
      index += 2; // Skip the separator line as well.
      while (index < lines.length) {
        const row = lines[index]?.trimEnd() ?? '';
        if (!row.trim() || !row.includes('|')) {
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
      list = undefined;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      list = undefined;
      const level = Math.min(3, heading[1]!.length);
      const node = el(level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4');
      appendInline(node, heading[2]!, options);
      container.append(node);
      continue;
    }
    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const shouldOrder = Boolean(ordered);
      if (!list || (shouldOrder && list.tagName !== 'OL') || (!shouldOrder && list.tagName !== 'UL')) {
        list = el(shouldOrder ? 'ol' : 'ul');
        container.append(list);
      }
      const item = el('li');
      appendInline(item, (ordered?.[1] ?? unordered?.[1])!, options);
      list.append(item);
      continue;
    }
    if (line.startsWith('> ')) {
      list = undefined;
      const quote = el('blockquote');
      appendInline(quote, line.slice(2), options);
      container.append(quote);
      continue;
    }
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      list = undefined;
      container.append(el('hr'));
      continue;
    }
    list = undefined;
    const paragraph = el('p');
    appendInline(paragraph, line.trim(), options);
    container.append(paragraph);
  }
}

function isTableHeader(line: string, separator: string): boolean {
  if (!line.includes('|') || !separator.includes('|')) return false;
  const cells = tableCells(separator);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function renderTable(lines: string[], options: MarkdownRenderOptions): HTMLElement {
  const wrapper = el('div', 'markdown-table-wrap');
  const table = el('table', 'markdown-table');
  const headerCells = tableCells(lines[0] ?? '');
  const head = el('thead');
  const headRow = el('tr');
  for (const cell of headerCells) {
    const th = el('th');
    appendInline(th, cell.trim(), options);
    headRow.append(th);
  }
  head.append(headRow);
  table.append(head);

  if (lines.length > 1) {
    const body = el('tbody');
    for (const line of lines.slice(1)) {
      const row = el('tr');
      const cells = tableCells(line);
      for (let index = 0; index < headerCells.length; index += 1) {
        const td = el('td');
        appendInline(td, (cells[index] ?? '').trim(), options);
        row.append(td);
      }
      body.append(row);
    }
    table.append(body);
  }
  wrapper.append(table);
  return wrapper;
}

function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  let escaped = false;
  for (const character of trimmed) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      current += character;
      continue;
    }
    if (character === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  cells.push(current);
  return cells;
}

function appendInline(parent: HTMLElement, text: string, options: MarkdownRenderOptions): void {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(([^)]+)\)|@agent\[[^\]]+\]|@file\[[^\]]+\]|@dir\[[^\]]+\]|\/[^\s/][^\n]*?(?=\s|$)|@"[^"]+"|@[A-Za-z0-9_À-ÖØ-öø-ÿ_.-]+)/g;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    if (match.index > index) parent.append(document.createTextNode(text.slice(index, match.index)));
    const token = match[0];
    const mentionToken = parseMentionToken(token, match.index, options);
    if (mentionToken) {
      parent.append(renderMentionChip(mentionToken));
    } else if (token.startsWith('`')) {
      const value = token.slice(1, -1);
      const code = el('code', 'inline-code', value);
      const classification = classifyLinkTarget(value);
      if (['workspace_file', 'workspace_directory', 'absolute_file', 'absolute_directory', 'binary_file'].includes(classification.kind)) {
        code.dataset.relayResource = value;
        code.classList.add('inline-file-link');
        code.title = 'Apri nell’editor';
        code.tabIndex = 0;
        code.setAttribute('role', 'link');
        code.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') code.click();
        });
      }
      parent.append(code);
    } else if (token.startsWith('**')) {
      parent.append(el('strong', '', token.slice(2, -2)));
    } else {
      const link = el('a', 'markdown-link');
      const labelEnd = token.indexOf('](');
      const target = (match[2] ?? '').trim();
      link.textContent = token.slice(1, labelEnd);
      if (/^https?:\/\//i.test(target)) {
        link.href = target;
        link.target = '_blank';
        link.rel = 'noreferrer';
      } else if (['workspace_file', 'workspace_directory', 'absolute_file', 'absolute_directory', 'binary_file'].includes(classifyLinkTarget(target).kind)) {
        link.href = '#';
        link.dataset.relayResource = target;
        link.classList.add('markdown-file-link');
        link.title = 'Apri nell’editor';
      } else {
        link.href = target || '#';
        link.title = target ? 'Link non classificato come risorsa locale' : '';
      }
      parent.append(link);
    }
    index = match.index + token.length;
  }
  if (index < text.length) parent.append(document.createTextNode(text.slice(index)));
}

function parseMentionToken(token: string, start: number, options: MarkdownRenderOptions): MentionToken | undefined {
  const agent = resolveAgentMention(token, options.agents ?? []);
  if (agent) {
    return { rawText: token, displayText: `@${agent.name}`, entityId: agent.id, entityType: 'agent', start, endExclusive: start + token.length, resolvedValue: agent.name };
  }
  const file = token.match(/^@file\[([^\]]+)\]$/i)?.[1];
  if (file) return { rawText: token, displayText: file, entityId: file, entityType: 'file', start, endExclusive: start + token.length, resolvedValue: file };
  const directory = token.match(/^@dir\[([^\]]+)\]$/i)?.[1];
  if (directory) return { rawText: token, displayText: directory, entityId: directory, entityType: 'directory', start, endExclusive: start + token.length, resolvedValue: directory };
  if (/^\/[^\s/]/.test(token)) {
    const name = token.slice(1);
    return { rawText: token, displayText: `/${name}`, entityId: name, entityType: 'skill', start, endExclusive: start + token.length, resolvedValue: name };
  }
  const provider = token.match(/^@(codex|claude|antigravity|copilot)$/i)?.[1];
  if (provider) return { rawText: token, displayText: `@${provider}`, entityId: provider.toLowerCase(), entityType: 'provider', start, endExclusive: start + token.length, resolvedValue: provider.toLowerCase() };
  return undefined;
}

function renderMentionChip(token: MentionToken): HTMLElement {
  const mention = el('span', `mention-chip mention-chip--${token.entityType}`);
  mention.title = `${token.entityType}: ${token.resolvedValue}`;
  mention.dataset.rawText = token.rawText;
  mention.dataset.entityType = token.entityType;
  mention.dataset.entityId = token.entityId;
  if (token.entityType === 'file' || token.entityType === 'directory') mention.dataset.relayResource = token.resolvedValue;
  const mark = token.entityType === 'provider' ? '@' : token.entityType === 'agent' ? '✦' : token.entityType === 'file' ? 'F' : token.entityType === 'directory' ? 'D' : '/';
  mention.append(el('span', 'mention-chip__mark', mark), el('span', 'mention-chip__label', token.displayText));
  return mention;
}

function resolveAgentMention(token: string, agents: Array<{ id: string; name: string }>): { id: string; name: string } | undefined {
  const legacy = token.match(/^@agent\[([^\]]+)\]$/i)?.[1];
  if (legacy) return agents.find((agent) => agent.id === legacy);
  const visible = token.startsWith('@"') ? token.slice(2, -1) : token.startsWith('@') ? token.slice(1) : '';
  if (!visible) return undefined;
  return agents.find((agent) => agent.name.toLowerCase() === visible.toLowerCase());
}

function splitCodeBlocks(text: string): Array<{ type: 'text' | 'code'; content: string; language?: string }> {
  const blocks: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
  const pattern = /```([^\n]*)\n([\s\S]*?)```/g;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    if (match.index > index) blocks.push({ type: 'text', content: text.slice(index, match.index) });
    blocks.push({ type: 'code', content: match[2] ?? '', language: (match[1] ?? '').trim() });
    index = match.index + match[0].length;
  }
  if (index < text.length) blocks.push({ type: 'text', content: text.slice(index) });
  return blocks.length ? blocks : [{ type: 'text', content: text }];
}



function looksLikeWorkspaceResource(value: string): boolean {
  const candidate = value.trim();
  if (!candidate || candidate.length > 320 || /[\n\r]/.test(candidate)) return false;
  return ['workspace_file', 'workspace_directory', 'absolute_file', 'absolute_directory', 'binary_file'].includes(classifyLinkTarget(candidate).kind);
}
