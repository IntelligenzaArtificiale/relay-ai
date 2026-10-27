// Read the complete app-server catalog; model slugs and effort levels belong to Codex.
import type { ModelOption } from '../core/types.js';

interface CodexModel {
  id?: string;
  model?: string;
  displayName?: string;
  description?: string;
  hidden?: boolean;
  isDefault?: boolean;
  defaultReasoningEffort?: string;
  supportedReasoningEfforts?: Array<{ reasoningEffort?: string; description?: string }>;
}

interface CodexModelPage { data?: CodexModel[]; nextCursor?: string | null; }

export async function readCodexModels(
  request: (params: { limit: number; includeHidden: boolean; cursor?: string }) => Promise<CodexModelPage>
): Promise<ModelOption[]> {
  const models = new Map<string, ModelOption>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await request({ limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) });
    for (const model of page.data ?? []) {
      const id = model.model || model.id;
      if (!id || model.hidden) continue;
      models.set(id, {
        id,
        label: model.displayName || id,
        ...(model.description ? { description: model.description } : {}),
        ...(model.isDefault !== undefined ? { isDefault: model.isDefault } : {}),
        reasoning: (model.supportedReasoningEfforts ?? []).flatMap((entry) => entry.reasoningEffort ? [{
          id: entry.reasoningEffort,
          label: entry.reasoningEffort.replace(/^./, (letter) => letter.toUpperCase()),
          ...(entry.description ? { description: entry.description } : {})
        }] : []),
        ...(model.defaultReasoningEffort ? { defaultReasoning: model.defaultReasoningEffort } : {})
      });
    }
    cursor = page.nextCursor || undefined;
    if (cursor && cursors.has(cursor)) throw new Error('Codex ha ripetuto il cursore del catalogo modelli.');
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...models.values()];
}
