// similarity.mjs — Jaro-Winkler string similarity, zero dependencies.
//
// Used by autonomous-review to de-duplicate CLAUDE.md proposals against
// existing CLAUDE.md content and against approvals/history.md (so items
// already proposed before — approved OR rejected — never re-surface).
//
// Returns a float in [0, 1]. Higher = more similar. 1.0 = exact match.
// Recommended threshold for "already covered": 0.85.

function jaro(s1, s2) {
  if (s1 === s2) return 1;
  const l1 = s1.length, l2 = s2.length;
  if (l1 === 0 || l2 === 0) return 0;

  const matchDistance = Math.floor(Math.max(l1, l2) / 2) - 1;
  const s1Matches = new Array(l1).fill(false);
  const s2Matches = new Array(l2).fill(false);

  let matches = 0;
  for (let i = 0; i < l1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, l2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < l1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  transpositions = transpositions / 2;

  return (
    matches / l1 +
    matches / l2 +
    (matches - transpositions) / matches
  ) / 3;
}

export function jaroWinkler(s1, s2, prefixScale = 0.1) {
  const j = jaro(s1, s2);
  let prefix = 0;
  const maxPrefix = Math.min(4, s1.length, s2.length);
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return j + prefix * prefixScale * (1 - j);
}

// Normalize text before comparison: lowercase, collapse whitespace, strip
// markdown-ish noise that doesn't change meaning.
export function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Split a (possibly multi-paragraph) reference into chunks we compare
// individually against a candidate. Splits on sentence/bullet boundaries.
function chunk(text) {
  return normalize(text)
    .split(/(?:[.!?]\s+|\s+[-*]\s+|\n+)/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
}

// Returns true if `candidate` is semantically already present in any of
// the reference strings. Splits each reference into sentences/bullets so
// a short candidate can match a single sentence inside a long reference.
export function alreadyCovered(candidate, references, threshold = 0.85) {
  const norm = normalize(candidate);
  if (!norm) return false;
  for (const ref of references) {
    for (const piece of chunk(ref)) {
      if (jaroWinkler(norm, piece) >= threshold) return true;
    }
  }
  return false;
}
