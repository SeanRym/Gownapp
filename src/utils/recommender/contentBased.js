/**
 * Content-Based Filtering (CBF) Engine - Mobile Version
 * ──────────────────────────────────────────────────────
 * Computes cosine similarity between gowns using TF-IDF weighted
 * vector of their attributes: type, color, silhouette, and description.
 *
 * Cold-start friendly — works with zero user interaction data.
 */

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'is','it','its','this','that','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could','should',
  'may','might','can','our','your','their','his','her','my','we','you',
  'they','he','she','i','very','just','so','as','from','by','about',
]);

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function extractTerms(gown) {
  const terms = {};

  const addField = (value, weight) => {
    if (!value) return;
    tokenize(String(value)).forEach((t) => {
      terms[t] = (terms[t] || 0) + weight;
    });
  };

  // Structured fields — high weight
  addField(gown.type, 3);
  addField(gown.color, 3);
  addField(gown.silhouette, 3);

  // Unstructured — lower weight
  addField(gown.description, 1);
  addField(gown.name, 2);

  return terms;
}

function buildTfIdf(gowns) {
  const rawTerms = gowns.map(extractTerms);

  const df = {};
  rawTerms.forEach((terms) => {
    Object.keys(terms).forEach((t) => {
      df[t] = (df[t] || 0) + 1;
    });
  });

  const N = gowns.length;

  return rawTerms.map((terms) => {
    const vec = {};
    const totalTermWeight = Object.values(terms).reduce((s, v) => s + v, 0) || 1;

    Object.entries(terms).forEach(([t, tf]) => {
      const tfNorm = tf / totalTermWeight;
      const idf = Math.log((N + 1) / ((df[t] || 0) + 1)) + 1;
      vec[t] = tfNorm * idf;
    });

    return vec;
  });
}

function cosine(vecA, vecB) {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const [term, valA] of Object.entries(vecA)) {
    const valB = vecB[term] || 0;
    dot += valA * valB;
    magA += valA * valA;
  }

  for (const valB of Object.values(vecB)) {
    magB += valB * valB;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Get content-based recommendations for a seed gown.
 * Returns topN most similar gowns.
 */
export function getContentBasedRecommendations(seedGown, allGowns, topN = 4) {
  if (!seedGown || allGowns.length === 0) return [];

  const vectors = buildTfIdf(allGowns);
  const seedIdx = allGowns.findIndex((g) => String(g?.id) === String(seedGown?.id));
  if (seedIdx === -1) return [];

  const seedVec = vectors[seedIdx];
  const scores = allGowns
    .map((g, idx) => ({
      gown: g,
      score: idx === seedIdx ? -1 : cosine(seedVec, vectors[idx]),
    }))
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return scores.map((s) => s.gown);
}
