/**
 * Apriori Association Rules Engine - Mobile Version
 * ───────────────────────────────────────────────────
 * Mines frequent itemsets from user session baskets (sets of gown IDs
 * viewed/added together in a session).
 *
 * Storage key: 'jce_baskets'
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const BASKET_KEY = "jce_baskets";
const MAX_BASKETS = 500;
const MIN_SUPPORT = 0.02;
const MIN_CONFIDENCE = 0.3;
const MAX_ITEMSET_SIZE = 3;

export async function loadBaskets() {
  try {
    const raw = await AsyncStorage.getItem(BASKET_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return parsed.map((b) => new Set(b));
  } catch {
    return [];
  }
}

export async function saveBaskets(baskets) {
  try {
    const trimmed = baskets.slice(-MAX_BASKETS);
    await AsyncStorage.setItem(BASKET_KEY, JSON.stringify(trimmed.map((b) => [...b])));
  } catch (err) {
    console.warn("Failed to save baskets:", err);
  }
}

/**
 * Record a basket (set of gown IDs viewed/added in session).
 */
export async function recordBasket(gownIds) {
  if (!gownIds || gownIds.length < 2) return;
  const baskets = await loadBaskets();
  baskets.push(new Set(gownIds.map(String)));
  await saveBaskets(baskets);
}

function support(itemset, baskets) {
  const items = [...itemset];
  const count = baskets.filter((b) => items.every((i) => b.has(i))).length;
  return baskets.length === 0 ? 0 : count / baskets.length;
}

function generateCandidates(frequentSets, size) {
  const candidates = [];
  const list = [...frequentSets];

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const union = new Set([...list[i], ...list[j]]);
      if (union.size === size) {
        const key = [...union].sort().join("|");
        if (!candidates.some((c) => [...c].sort().join("|") === key)) {
          candidates.push(union);
        }
      }
    }
  }
  return candidates;
}

export async function apriori() {
  const baskets = await loadBaskets();
  if (baskets.length === 0) return [];

  const L = []; // frequent itemsets

  // Size-1 itemsets
  const items = new Set();
  baskets.forEach((b) => b.forEach((item) => items.add(item)));

  let current = [];
  for (const item of items) {
    const s = support(new Set([item]), baskets);
    if (s >= MIN_SUPPORT) {
      current.push(new Set([item]));
    }
  }

  L.push(...current);

  // Size-k itemsets
  for (let k = 2; k <= MAX_ITEMSET_SIZE && current.length > 0; k++) {
    const candidates = generateCandidates(current, k);
    current = candidates.filter((c) => support(c, baskets) >= MIN_SUPPORT);
    L.push(...current);
  }

  return L;
}

export async function getAprioriRecommendations(seedGown, allGowns, topN = 4) {
  if (!seedGown) return [];

  const frequentSets = await apriori();
  const seedId = String(seedGown?.id);

  // Find rules where seedGown is the antecedent
  const consequents = new Map();

  for (const itemset of frequentSets) {
    if (itemset.has(seedId) && itemset.size >= 2) {
      const items = [...itemset];
      const supp = support(itemset, await loadBaskets());
      const antecedent = new Set(items.filter((i) => i !== seedId));

      if (antecedent.size > 0) {
        const suppAntecedent = support(antecedent, await loadBaskets());
        const confidence = suppAntecedent > 0 ? supp / suppAntecedent : 0;

        if (confidence >= MIN_CONFIDENCE) {
          items
            .filter((i) => i !== seedId)
            .forEach((consequent) => {
              consequents.set(consequent, (consequents.get(consequent) || 0) + confidence);
            });
        }
      }
    }
  }

  // Convert to gown objects
  const recommendations = Array.from(consequents.entries())
    .map(([gownId, score]) => ({
      gown: allGowns.find((g) => String(g?.id) === gownId),
      score,
    }))
    .filter((s) => s.gown)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return recommendations.map((s) => s.gown);
}
