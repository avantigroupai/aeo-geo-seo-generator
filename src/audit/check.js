export const STATUS_SCORE = { pass: 1, warn: 0.5, fail: 0, info: null };

export function check(def) {
  return {
    evidence: [],
    snippet: null,
    ...def,
  };
}

/** Weighted 0–100 score for a set of checks. `info` checks are excluded. */
export function scoreOf(checks) {
  let earned = 0;
  let possible = 0;
  for (const c of checks) {
    const v = STATUS_SCORE[c.status];
    if (v == null) continue;
    earned += v * c.weight;
    possible += c.weight;
  }
  if (!possible) return 0;
  return Math.round((earned / possible) * 100);
}

export function grade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 55) return 'D';
  if (score >= 40) return 'E';
  return 'F';
}
