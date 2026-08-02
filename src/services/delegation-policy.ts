import type { ModelOption, RelayDelegationTaskRequest, RunPermission } from '../core/types.js';

export function inferDelegationPermission(options: {
  task: RelayDelegationTaskRequest;
  originalPrompt: string;
  agentPermission?: RunPermission;
  providerDefault: RunPermission;
}): RunPermission {
  const repairPattern = /(?:risolvi|sistema|correggi|ripara|applica\s+(?:il|la|una)?\s*fix|esegui\s+(?:il|la|una)?\s*fix|implementa|modifica\s+(?:il|la|i|le)?\s*(?:codice|file|progetto)|fai\s+la\s+build|rifai\s+la\s+build|fix(?:a|are)?|repair|implement|apply\s+(?:the\s+)?fix|patch\s+(?:the\s+)?code|make\s+the\s+changes|build\s+the\s+project)/i;
  const analysisOnlyPattern = /(?:solo|soltanto|purely)\s+(?:analisi|ricerca|ispezione|review)|non\s+(?:modificare|toccare|scrivere|applicare)|without\s+(?:editing|modifying)|read[- ]only/i;
  const taskRepair = repairPattern.test(options.task.prompt);
  const taskAnalysisOnly = analysisOnlyPattern.test(options.task.prompt);
  const originalExplicitRepair = /(?:delega|chiedi|affida|passa).{0,100}(?:risolvi|sistema|correggi|ripara|fix|implementa|applica)/i.test(options.originalPrompt);
  if ((taskRepair && !taskAnalysisOnly) || (originalExplicitRepair && !taskAnalysisOnly)) return 'danger-full-access';
  return options.task.permission ?? options.agentPermission ?? options.providerDefault;
}

export function chooseEconomicalTemplateModel(models: ModelOption[]): string {
  const visible = models.filter((model) => !model.hidden && model.id !== 'auto');
  const economical = visible.find((model) => /(?:nano|mini|flash|haiku|small|light|econom)/i.test(`${model.id} ${model.label} ${model.description ?? ''}`));
  return economical?.id ?? visible.find((model) => model.isDefault)?.id ?? 'auto';
}
