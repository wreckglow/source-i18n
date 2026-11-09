/** Dice coefficient over character bigrams. Cheap, dependency-free, good enough. */
export function similarity(a: string, b: string): number {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (x === y) return 1
  if (x.length < 4 || y.length < 4) return 0

  const grams = (value: string): Map<string, number> => {
    const map = new Map<string, number>()
    for (let i = 0; i < value.length - 1; i += 1) {
      const gram = value.slice(i, i + 2)
      map.set(gram, (map.get(gram) ?? 0) + 1)
    }
    return map
  }

  const left = grams(x)
  const right = grams(y)
  let intersection = 0
  let total = 0

  for (const [gram, count] of left) {
    total += count
    const other = right.get(gram)
    if (other) intersection += Math.min(count, other)
  }
  for (const count of right.values()) total += count

  return total === 0 ? 0 : (2 * intersection) / total
}

/**
 * Finds the best translation-memory candidate for a new source string.
 * Used when a source text was edited: the old translation is usually a good
 * starting point, marked as fuzzy for a human to review.
 */
export function findTranslationMemory(
  source: string,
  candidates: { id: string; source: string; translation: string }[],
  threshold = 0.82,
): { id: string; translation: string; score: number } | undefined {
  let best: { id: string; translation: string; score: number } | undefined
  for (const candidate of candidates) {
    const score = similarity(source, candidate.source)
    if (score >= threshold && (!best || score > best.score)) {
      best = { id: candidate.id, translation: candidate.translation, score }
    }
  }
  return best
}
