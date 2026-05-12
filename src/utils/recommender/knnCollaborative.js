/**
 * KNN Collaborative Filtering Engine - Mobile Version
 * ────────────────────────────────────────────────────
 * Finds K users most similar to current user based on interaction vectors,
 * then suggests gowns those similar users interacted with.
 *
 * Interaction events and weights:
 *   view      → 1
 *   favorite  → 3
 *   cart_add  → 5
 *   inquiry   → 7
 *
 * Data stored in AsyncStorage under 'jce_interactions'
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export const EVENT_WEIGHTS = {
  view: 1,
  favorite: 3,
  cart_add: 5,
  inquiry: 7,
};

const STORAGE_KEY = "jce_interactions";
const K = 10;

export async function loadInteractions() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function saveInteractions(data) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("Failed to save interactions:", err);
  }
}

/**
 * Record an interaction event.
 * eventType: 'view', 'favorite', 'cart_add', 'inquiry'
 */
export async function recordInteraction(userId, gownId, eventType) {
  if (!userId || !gownId || !eventType) return;

  const weight = EVENT_WEIGHTS[eventType];
  if (!weight) return;

  const data = await loadInteractions();
  if (!data[userId]) data[userId] = {};

  const key = String(gownId);
  const current = data[userId][key] || 0;
  const decay = 1 / (1 + 0.3 * (current / weight));
  data[userId][key] = Math.round((current + weight * decay) * 100) / 100;

  await saveInteractions(data);
}

/**
 * Compute cosine similarity between two interaction vectors.
 */
function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  const allKeys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);

  for (const key of allKeys) {
    const a = vecA[key] || 0;
    const b = vecB[key] || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Get KNN collaborative recommendations for a user.
 */
export async function getKnnRecommendations(userId, allGowns, topN = 4) {
  const data = await loadInteractions();

  const userVec = data[userId] || {};
  if (Object.keys(userVec).length === 0) return [];

  // Find K nearest neighbors
  const similarities = Object.entries(data)
    .filter(([uid]) => uid !== userId)
    .map(([uid, vec]) => ({
      userId: uid,
      similarity: cosineSimilarity(userVec, vec),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, K);

  if (similarities.length === 0) return [];

  // Aggregate neighbor interactions
  const neighborScores = {};
  const userGowns = new Set(Object.keys(userVec));

  similarities.forEach(({ userId: neighborId, similarity }) => {
    Object.entries(data[neighborId] || {}).forEach(([gownId, score]) => {
      if (!userGowns.has(gownId)) {
        neighborScores[gownId] = (neighborScores[gownId] || 0) + score * similarity;
      }
    });
  });

  // Convert to gown objects and sort
  const recommendations = Object.entries(neighborScores)
    .map(([gownId, score]) => ({
      gown: allGowns.find((g) => String(g?.id) === gownId),
      score,
    }))
    .filter((s) => s.gown)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return recommendations.map((s) => s.gown);
}
