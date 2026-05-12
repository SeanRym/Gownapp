# ✨ Mobile Recommendation System - Quick Start

## What Was Added

I've implemented a **complete recommendation system** for your mobile app that syncs with your web platform. Both mobile and web now use the same 4-engine recommendation algorithm.

### 📱 Files Created in Mobile App

```
src/
├── utils/recommender/
│   ├── contentBased.js          ← TF-IDF algorithm (similar gowns)
│   ├── knnCollaborative.js      ← User-based recommendations
│   ├── apriori.js               ← Frequently bought together
│   └── hybridRecommender.js     ← Combines all 3 algorithms
└── services/
    └── recommendations.js        ← Interaction tracking & syncing
```

### 🎯 What It Does

1. **Tracks User Actions**
   - View gown → Recorded as "view"
   - Favorite → Recorded as "favorite"
   - Add to cart → Recorded as "cart_add"

2. **Shows Recommendations**
   - When viewing a gown detail: "You might also like" section appears
   - Uses hybrid algorithm (40% content + 35% KNN + 25% apriori)

3. **Syncs to Backend**
   - Every 5 minutes automatically
   - On logout (saves session basket)
   - Fire-and-forget (doesn't block user actions)

4. **Learns from Both Platforms**
   - Mobile user favorited → Web sees it
   - Web user added to cart → Mobile knows it
   - Unified data = better recommendations

---

## 🚀 Getting Started

### 1. **No Changes Needed on Mobile** ✅
The mobile app is ready to use. Just rebuild and test.

```bash
expo prebuild --clean
npm run android  # or iOS
```

### 2. **Update Backend (DigitalOcean)**
Your web app already has the `/api/recommendations` endpoint. For production:

**Current**: Stores in temp file `/tmp/jce-recommender/interactions.json`  
**Recommended**: Store in PostgreSQL for persistence

See [RECOMMENDATIONS_SETUP.md](./RECOMMENDATIONS_SETUP.md) for SQL migration guide.

### 3. **Test It Out**

On **mobile**:
1. Open a gown detail
2. View the "You might also like" section at bottom
3. Favorite a gown
4. Add items to cart

On **web**:
1. Log in with same email
2. Check your account → recommendations should match mobile's actions

---

## 📊 How Recommendations Work

### 4 Algorithms

| Algorithm | What It Does | Example |
|-----------|-------------|---------|
| **Content-Based** | Finds gowns with similar attributes (color, style, fabric) | If you view a "mermaid silhouette", recommend other mermaid gowns |
| **KNN Collaborative** | Finds users like you, suggests their favorites | If 10 similar users liked gown X, you'll see it too |
| **Apriori (Market Basket)** | Finds patterns (frequently bought together) | Gowns often viewed together in same session |
| **Hybrid** | Combines all 3 with smart weighting | Best overall recommendations |

### Interaction Weights

- **View** = 1 point (light signal)
- **Favorite** = 3 points (medium signal)
- **Cart Add** = 5 points (strong signal)
- **Inquiry** = 7 points (very strong intent)

---

## 🔄 Data Sync Flow

```
User Action on Mobile
    ↓
Local tracking (instant recommendations)
    ↓
Queue for server sync
    ↓
Every 5 minutes: POST to /api/recommendations
    ↓
Backend stores in database
    ↓
Web user logs in → Sees mobile user's actions in recommendations
```

---

## 📋 Files Modified

1. **src/context/ShopContext.js**
   - Added import for tracking
   - Track cart adds and favorites
   - Periodic sync every 5 minutes
   - Save session on logout

2. **src/screens/GownDetailScreen.js**
   - Added imports for recommendations
   - Load and display recommendations
   - Track view on load
   - Show "You might also like" section

---

## ⚙️ Configuration

All settings are in `src/services/recommendations.js`:

```javascript
const WEIGHTS = {
  contentBased: 0.4,  // 40% weight
  knn: 0.35,          // 35% weight
  apriori: 0.25,      // 25% weight
};

const SYNC_INTERVAL = 5 * 60 * 1000;  // 5 minutes
const K = 10;  // 10 nearest neighbors
const MIN_SUPPORT = 0.02;  // 2% basket support
const MIN_CONFIDENCE = 0.3;  // 30% confidence
```

---

## ✅ Verification

After setup, verify:

1. [ ] Mobile builds without errors
2. [ ] Gown detail shows "You might also like" section (when logged in)
3. [ ] Clicking recommendations navigates to that gown
4. [ ] No console warnings about missing imports
5. [ ] Backend receives POST to `/api/recommendations` every 5 mins
6. [ ] Web app shows mobile user's actions in recommendations

---

## 🐛 Troubleshooting

### No Recommendations Showing
- **Check**: Are you logged in? (Required for tracking)
- **Check**: Gown detail screen loaded? (Triggers view tracking)
- **Check**: Enough interaction data? (Needs ~5+ interactions)

### Sync Not Working
- **Check**: Is backend `/api/recommendations` endpoint available?
- **Check**: Network logs in mobile app
- **Check**: Backend error logs on DigitalOcean

### Different Recommendations on Mobile vs Web
- **Check**: Are you using same email? (Unique user identifier)
- **Check**: Did web endpoint update database? (May be temp file mode)

---

## 📚 More Info

- See [RECOMMENDATIONS_SETUP.md](./RECOMMENDATIONS_SETUP.md) for detailed backend setup
- See [SYSTEM_DOCUMENTATION.md](./SYSTEM_DOCUMENTATION.md) for full architecture
- Check test files in `/tests/` for algorithm examples

---

## 🎉 That's It!

Your mobile app now has a full recommendation system that:
- ✅ Works instantly (local algorithms)
- ✅ Syncs to backend (shared learning)
- ✅ Coordinates with web (unified experience)
- ✅ Handles offline (queues for sync when online)

Enjoy better recommendations! 🎀
