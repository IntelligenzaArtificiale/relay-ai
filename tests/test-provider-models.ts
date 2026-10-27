// Catalog and routing regressions; no provider accounts or network required.
import assert from 'node:assert/strict';
import { readCodexModels } from '../src/providers/codex-models.js';
import { CLAUDE_MODEL_DISCOVERY_ID, claudeFallbackModels, mergeClaudeModels, parseClaudeModels } from '../src/providers/claude-models.js';
import { claudeResultError, claudeResultModel } from '../src/providers/claude-output.js';
import { ANTIGRAVITY_FALLBACK_MODELS, antigravityDiscoveredModels, parseAntigravityModels } from '../src/providers/antigravity-models.js';
import { normalizeRunSelection } from '../src/services/model-capabilities.js';
import { chooseDelegationModel, chooseDelegationReasoning, modelTier } from '../src/services/delegation-router.js';
import type { ModelOption, ProviderId, ProviderStatus } from '../src/core/types.js';

const status = (id: ProviderId, models: ModelOption[]): ProviderStatus => ({ id, label: id, available: true, executable: id, models });

export async function testProviderModels(): Promise<void> {
  const requests: any[] = [];
  const codex = await readCodexModels(async (params) => {
    requests.push(params);
    return params.cursor ? { data: [
      { id: 'catalog-astra', model: 'gpt-6-astra', supportedReasoningEfforts: [{ reasoningEffort: 'max' }, { reasoningEffort: 'ultra' }] },
      { id: 'gpt-6-luna', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] },
      { id: 'internal', hidden: true }
    ], nextCursor: null } : { data: [{ model: 'gpt-6.1-sol', isDefault: true, defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }], nextCursor: 'second' };
  });
  assert.equal(requests[1].cursor, 'second');
  assert.deepEqual(codex.map((model) => model.id), ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna']);
  assert.equal(codex[1].reasoning[1].id, 'ultra');
  assert.equal(normalizeRunSelection({ provider: 'codex', model: 'gpt-6-astra', reasoning: 'ultra', providers: [status('codex', codex)] }).changed, false);
  assert.equal(normalizeRunSelection({ provider: 'codex', model: 'gpt-6.1-sol', reasoning: 'none', providers: [status('codex', codex)] }).reasoning, 'low');
  await assert.rejects(readCodexModels(async () => ({ data: [], nextCursor: 'loop' })), /cursore/);
  await assert.rejects(readCodexModels(async () => { throw new Error('offline'); }), /offline/);
  console.log('  PASS Codex pagination, canonical slugs, native efforts and invalid effort normalization');

  const response = (models: unknown[]) => JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: CLAUDE_MODEL_DISCOVERY_ID, response: { models } } });
  const claude = mergeClaudeModels(parseClaudeModels('not-json\n' + response([
    { value: 'sonnet', resolvedModel: 'claude-sonnet-5-5', supportsEffort: true, supportedEffortLevels: ['low', 'high', 'max', 'future'] },
    { value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001', supportsEffort: false },
    { value: null }, null
  ])));
  assert.equal(claude.find((model) => model.id === 'sonnet')?.label, 'Sonnet 5.5 · automatico');
  assert.deepEqual(claude.find((model) => model.id === 'sonnet')?.reasoning.map((effort) => effort.id), ['low', 'high', 'max']);
  assert.equal(claude.find((model) => model.id === 'haiku')?.reasoning.length, 0);
  assert.equal(claude.filter((model) => model.isDefault).length, 1);
  assert.deepEqual(parseClaudeModels('{"type":"control_response","response":{"subtype":"error"}}'), []);
  for (const id of ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1']) {
    const selection = normalizeRunSelection({ provider: 'claude', model: id, reasoning: 'max', providers: [status('claude', claude)] });
    assert.equal(selection.model, id);
    assert.equal(selection.reasoning, 'max');
  }
  assert.equal(claudeFallbackModels().find((model) => model.id === 'claude-opus-5-5')?.defaultReasoning, 'medium');
  assert.equal(claudeResultModel({ modelUsage: { 'claude-haiku-5-5': { inputTokens: 4 } } }, 'haiku'), 'claude-haiku-5-5');
  assert.equal(claudeResultModel({ modelUsage: { aux: {}, main: { canonicalModel: 'claude-sonnet-5-5' } } }, 'main'), 'claude-sonnet-5-5');
  assert.equal(claudeResultModel({ modelUsage: { aux: {}, main: {} } }, 'selected'), 'selected');
  assert.equal(claudeResultError({ type: 'result', is_error: true, errors: ['model unavailable'] }), 'model unavailable');
  assert.equal(claudeResultError({ type: 'result', subtype: 'error_during_execution' }), 'Claude Code: error_during_execution');
  assert.equal(claudeResultError({ type: 'result', subtype: 'success', result: 'OK' }), undefined);
  console.log('  PASS Claude versioned choices, native aliases/efforts, actual model and terminal errors');

  const agy = parseAntigravityModels('\u001b[32mFetching available models...\u001b[0m\ngemini-3.8-flash-low\tGemini 3.8 Flash (Low)\ngemini-4-argon  Gemini 4 Argon\nclaude-sonnet-5-5 Claude Sonnet 5.5 (Thinking)\ngemini-3.8-flash-low\tGemini 3.8 Flash (Low)');
  assert.deepEqual(agy.map((model) => model.id), ['gemini-3.8-flash-low', 'gemini-4-argon', 'claude-sonnet-5-5']);
  assert.equal(agy[2].family, 'Claude and GPT');
  assert.equal(parseAntigravityModels('Gemini 3.8 Flash (Low)')[0].id, 'gemini-3.8-flash-low');
  assert.equal(parseAntigravityModels('Gemini 99 Unverified').length, 0);
  const available = antigravityDiscoveredModels(agy);
  assert.deepEqual(available.map((model) => model.id), ['auto', ...agy.map((model) => model.id)]);
  assert.equal(available.some((model) => model.id === 'gemini-3.5-flash-low'), false);
  assert.ok(ANTIGRAVITY_FALLBACK_MODELS.some((model) => model.id === 'gemini-3.8-flash-low'));
  assert.equal(normalizeRunSelection({ provider: 'antigravity', model: 'gemini-3.8-flash-low', providers: [status('antigravity', available)] }).model, 'gemini-3.8-flash-low');
  console.log('  PASS Gemini 3.8/Argon and new Claude slugs; successful inventory replaces obsolete fallbacks');

  assert.equal(modelTier('gpt-6-luna'), 0);
  assert.equal(modelTier('gpt-6.1-terra'), 0);
  assert.equal(modelTier('gpt-6.1-sol'), 1);
  assert.equal(modelTier('gpt-6-astra'), 2);
  assert.equal(modelTier('claude-fable-5-1'), 2);
  assert.equal(modelTier('gemini-4-argon'), 2);
  assert.equal(chooseDelegationModel(codex, 'complex', 'balanced', undefined), 'gpt-6-astra');
  assert.equal(chooseDelegationModel(codex, 'light', 'preserve', undefined), 'gpt-6-luna');
  assert.equal(chooseDelegationModel(available, 'complex', 'balanced', undefined), 'gemini-4-argon');
  assert.equal(chooseDelegationModel(available, 'light', 'preserve', undefined), 'gemini-3.8-flash-low');
  assert.equal(chooseDelegationReasoning(codex, 'gpt-6-astra', 'complex', 'balanced', undefined), 'max');
  console.log('  PASS current model families retain fast, balanced and complex routing roles');
}
