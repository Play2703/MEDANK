/**
 * High-Performance Levenshtein Distance Utility
 * Computes minimum edit distance between two strings with early exit optimization.
 * Uses O(min(N, M)) space and early termination when distance exceeds maxThreshold.
 */

export function levenshteinDistance(
  a: string,
  b: string,
  maxThreshold = 2
): number {
  if (a === b) return 0;
  if (!a) return b ? b.length : 0;
  if (!b) return a.length;

  const lenA = a.length;
  const lenB = b.length;

  // Early exit: length difference already exceeds threshold
  if (Math.abs(lenA - lenB) > maxThreshold) {
    return maxThreshold + 1;
  }

  // Optimize space by making sure s2 is the shorter string
  const s1 = lenA >= lenB ? a : b;
  const s2 = lenA >= lenB ? b : a;
  const n = s1.length;
  const m = s2.length;

  // Row buffer for DP state
  let prevRow = new Array<number>(m + 1);
  let currRow = new Array<number>(m + 1);

  for (let j = 0; j <= m; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= n; i++) {
    currRow[0] = i;
    const char1 = s1[i - 1];
    let minInRow = currRow[0];

    for (let j = 1; j <= m; j++) {
      const char2 = s2[j - 1];
      const cost = char1 === char2 ? 0 : 1;

      currRow[j] = Math.min(
        prevRow[j] + 1,       // Deletion
        currRow[j - 1] + 1,   // Insertion
        prevRow[j - 1] + cost // Substitution
      );

      if (currRow[j] < minInRow) {
        minInRow = currRow[j];
      }
    }

    // Early termination if all values in the current row exceed threshold
    if (minInRow > maxThreshold) {
      return maxThreshold + 1;
    }

    // Swap row buffers
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  return prevRow[m];
}

/**
 * Checks if candidate is within acceptable typo tolerance (distance <= maxDistance)
 */
export function isTypoMatch(
  source: string,
  candidate: string,
  maxDistance = 2
): boolean {
  if (!source || !candidate) return false;
  // Minimum length check to avoid noise on short acronyms/words
  if (source.length < 4 && maxDistance >= 2) {
    maxDistance = 1;
  }
  if (source.length < 3) {
    return source === candidate;
  }
  return levenshteinDistance(source, candidate, maxDistance) <= maxDistance;
}
