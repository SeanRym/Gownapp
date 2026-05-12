/**
 * Hybrid Recommender Engine - Mobile Version
 * ───────────────────────────────────────────
 * Combines Content-Based, KNN Collaborative, and Apriori recommendations
 * with weighted voting for best overall recommendations.
 */

import { getContentBasedRecommendations } from "./contentBased";
import { getKnnRecommendations } from "./knnCollaborative";
import { getAprioriRecommendations } from "./apriori";

const WEIGHTS = {
  contentBased: 0.4,
  knn: 0.35,
  apriori: 0.25,
};

/**
 * Get hybrid recommendations combining all 3 engines.
 */
export async function getHybridRecommendations(
  seedGown,
  userId,
  allGowns,
  topN = 4
) {
  if (!seedGown || !allGowns || allGowns.length === 0) return [];

  // Run all three engines in parallel
  const [contentBased, knn, apriori] = await Promise.all([
    Promise.resolve(getContentBasedRecommendations(seedGown, allGowns, 10)),
    getKnnRecommendations(userId, allGowns, 10),
    getAprioriRecommendations(seedGown, allGowns, 10),
  ]);

  // Score each gown across all engines
  const scores = new Map();

  contentBased.forEach((gown, idx) => {
    const gownId = String(gown?.id);
    const score = (scores.get(gownId) || 0) + (1 - idx / 10) * WEIGHTS.contentBased;
    scores.set(gownId, score);
  });

  knn.forEach((gown, idx) => {
    const gownId = String(gown?.id);
    const score = (scores.get(gownId) || 0) + (1 - idx / 10) * WEIGHTS.knn;
    scores.set(gownId, score);
  });

  apriori.forEach((gown, idx) => {
    const gownId = String(gown?.id);
    const score = (scores.get(gownId) || 0) + (1 - idx / 10) * WEIGHTS.apriori;
    scores.set(gownId, score);
  });

  // Convert to gown objects and sort
  const recommendations = Array.from(scores.entries())
    .map(([gownId, score]) => ({
      gown: allGowns.find((g) => String(g?.id) === gownId),
      score,
    }))
    .filter((s) => s.gown)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return recommendations.map((s) => s.gown);
}
