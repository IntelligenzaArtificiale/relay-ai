export interface SkillLike {
  name: string;
  description?: string;
}

export interface SkillGroup<T extends SkillLike> {
  name: string;
  description: string;
  items: T[];
}

export function groupSkillsByName<T extends SkillLike>(items: readonly T[] | undefined): SkillGroup<T>[] {
  const groups = new Map<string, SkillGroup<T>>();
  for (const item of items ?? []) {
    const name = item.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      if (!existing.description && item.description) existing.description = item.description;
    } else {
      groups.set(key, { name, description: item.description ?? '', items: [item] });
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}