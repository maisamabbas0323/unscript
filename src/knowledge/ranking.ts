/**
 * Priority ordering helpers for knowledge rules.
 *
 * The Sanity Knowledge Base documents priority semantics explicitly:
 * transformation rules — "Higher runs first"; preservation rules — "Higher
 * wins". These helpers encode exactly that and nothing else.
 */

export interface Prioritized {
  priority?: number;
}

/** Sort a copy of items by priority descending (higher first). */
export function sortByPriorityDesc<T extends Prioritized>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/** Deduplicate items by their `_id`, keeping the first occurrence. */
export function uniqueById<T extends { _id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item._id)) continue;
    seen.add(item._id);
    out.push(item);
  }
  return out;
}

/** Join two priority-sorted lists, deduped by id and re-sorted by priority. */
export function mergeByPriority<T extends Prioritized & { _id: string }>(...lists: T[][]): T[] {
  return sortByPriorityDesc(uniqueById(lists.flat()));
}
