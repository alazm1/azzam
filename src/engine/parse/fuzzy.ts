/** Damerau-Levenshtein distance (adjacent transpositions count as one edit). */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

/** 0..1 similarity; 1 = identical. */
export function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const dist = editDistance(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

export interface FuzzyMatch<K> {
  key: K;
  score: number;
  variant: string;
}

/** Finds the best matching variant across all candidate keys. */
export function bestMatch<K>(text: string, candidates: Array<[K, string[]]>, minScore: number): FuzzyMatch<K> | null {
  let best: FuzzyMatch<K> | null = null;
  for (const [key, variants] of candidates) {
    for (const v of variants) {
      const score = similarity(text, v);
      if (score >= minScore && (!best || score > best.score)) best = { key, score, variant: v };
    }
  }
  return best;
}
