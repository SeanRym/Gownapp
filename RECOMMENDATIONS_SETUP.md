# Recommendation System Implementation Guide
## Mobile & Web Synchronization

This guide explains how the recommendation system works across mobile and web, and how to ensure proper synchronization via DigitalOcean.

---

## 📱 Mobile Implementation

### What Was Added

1. **Recommendation Algorithms** (in `src/utils/recommender/`)
   - `contentBased.js` - TF-IDF + Cosine similarity
   - `knnCollaborative.js` - K-nearest neighbors collaborative filtering
   - `apriori.js` - Market basket analysis
   - `hybridRecommender.js` - Combines all three

2. **Interaction Tracking** (in `src/services/recommendations.js`)
   - Tracks user actions: view, favorite, cart_add, inquiry
   - Queues interactions for server sync
   - Syncs every 5 minutes automatically
   - Saves session basket on logout

3. **Integration Points**
   - **GownDetailScreen**: Shows "You might also like" recommendations when viewing a gown
   - **ShopContext**: Tracks cart additions and favorites
   - **Periodic Sync**: Background sync every 5 minutes

### How Mobile Syncs

```
User Action (view/favorite/cart)
    ↓
trackInteraction() records locally + queues for sync
    ↓
syncInteractionsToServer() sends to /api/recommendations (every 5 mins)
    ↓
Backend stores interactions (shared with web)
    ↓
Both web and mobile generate recommendations from same data
```

---

## 🌐 Web-Mobile Sync via Backend

### Recommended Backend Setup

For proper synchronization, your DigitalOcean backend should:

#### 1. **Use Database Instead of Temp Files**

Replace the temp file storage (`/tmp/jce-recommender/interactions.json`) with a PostgreSQL table:

```sql
CREATE TABLE user_interactions (
  id SERIAL PRIMARY KEY,
  user_email VARCHAR(255) NOT NULL,
  gown_id VARCHAR(50) NOT NULL,
  event_type VARCHAR(20) NOT NULL,
  interaction_score DECIMAL(10, 4) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  device_type VARCHAR(20), -- 'web' or 'mobile'
  UNIQUE(user_email, gown_id, event_type)
);

CREATE INDEX idx_interactions_email ON user_interactions(user_email);
CREATE INDEX idx_interactions_gown ON user_interactions(gown_id);
```

#### 2. **Update /api/recommendations Endpoint**

Modify your backend API to:

```javascript
// POST /api/recommendations - Record interactions
async function POST(request) {
  const { userId, gownId, eventType, events } = await request.json();

  if (Array.isArray(events)) {
    // Mobile batch sync
    for (const event of events) {
      const weight = EVENT_WEIGHTS[event.eventType] || 1;
      await db.query(
        `INSERT INTO user_interactions (user_email, gown_id, event_type, interaction_score, device_type)
         VALUES ($1, $2, $3, $4, 'mobile')
         ON CONFLICT (user_email, gown_id, event_type)
         DO UPDATE SET interaction_score = interaction_score + $4`,
        [event.userEmail, event.gownId, event.eventType, weight]
      );
    }
  }
  // ... handle single events
  return { ok: true };
}

// GET /api/recommendations?userId=xxx - Retrieve for any device
async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  
  const result = await db.query(
    `SELECT gown_id, interaction_score FROM user_interactions
     WHERE user_email = $1
     ORDER BY interaction_score DESC`,
    [userId]
  );
  
  return Response.json(result.rows);
}
```

#### 3. **Test Synchronization**

After setup:
1. On **mobile**: Add item to cart, favorite a gown
2. Check **database**: Interactions should appear in `user_interactions` table
3. On **web**: View user's profile → recommendations should include items from mobile
4. Vice versa: Favorite on **web** should show up in **mobile** recommendations

---

## 🔄 Data Flow (Complete)

```
┌─────────────────┐                 ┌──────────────────┐
│  Mobile App     │                 │   Web App        │
│  (React Native) │                 │   (Next.js)      │
└────────┬────────┘                 └────────┬─────────┘
         │                                    │
         │ User Action                        │ User Action
         │ (view/favorite/add)                │ (click/view/like)
         │                                    │
         ├──────► trackInteraction()          │
         │                                    │
         ├─► localStorage + sync queue        │ POST to /api/recommendations
         │                                    │
         └──────────────────┬──────────────────┘
                            │
                       Every 5 mins
                            │
                    /api/recommendations
                         POST
                            │
                ┌───────────────────────┐
                │   DigitalOcean        │
                │   PostgreSQL          │
                │ user_interactions     │
                │ (unified data)        │
                └───────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
          Used by Mobile           Used by Web
          (KNN, Content-Based,    (Same algorithms,
           Apriori, Hybrid)       same data source)
```

---

## 📊 Recommendation Quality

### Cold Start (New User)
- **First 5 views**: Content-based recommendations work
- **First 10 items**: KNN collaborative filtering kicks in
- **First 50 items**: Market basket analysis becomes effective

### Warm Start (Active User)
- All three engines produce high-quality recommendations
- Hybrid engine weighs them: 40% content, 35% KNN, 25% apriori

---

## 🛠️ Configuration

### Mobile (Already Set)

```javascript
// src/services/recommendations.js
const API_BASE_URL = // from config/apiEnv.js (points to DigitalOcean)
const TRACK_EVENTS = ['view', 'favorite', 'cart_add', 'inquiry']
const SYNC_INTERVAL = 5 * 60 * 1000 // 5 minutes
```

### Web (Review Existing)

```javascript
// app/utils/recommender files
const MIN_SUPPORT = 0.02 // 2% basket support
const MIN_CONFIDENCE = 0.3 // 30% confidence
const K = 10 // 10 nearest neighbors
```

---

## ⚠️ Important Notes

1. **User Email as ID**
   - Both platforms use email as the unique user identifier
   - Ensure emails are lowercased and consistent

2. **Event Weights**
   - view → 1 point
   - favorite → 3 points
   - cart_add → 5 points
   - inquiry → 7 points

3. **Storage Limits**
   - Mobile localStorage: Limited (~10MB), old interactions auto-evict
   - Database: Unlimited, persistence recommended
   - Web localStorage: Limited (~10MB), old baskets auto-evict

4. **Privacy**
   - All interactions are user-specific (email-based)
   - Consider adding GDPR compliance for deletion
   - No personally identifiable data is stored except email

---

## ✅ Verification Checklist

- [ ] Backend has `/api/recommendations` endpoint
- [ ] Database table `user_interactions` is created
- [ ] Mobile interactions sync to backend every 5 minutes
- [ ] Web reads from same database for recommendations
- [ ] User emails match between mobile and web
- [ ] Recommendations appear in both platforms for same user
- [ ] No errors in console or backend logs

---

## 🚀 Next Steps

1. **Update backend** to use database instead of temp files
2. **Deploy** the changes to DigitalOcean
3. **Test** mobile → web recommendation sync
4. **Monitor** `/api/recommendations` logs for errors
5. **Optimize** weights and K value based on user feedback

---

## 📝 API Endpoints Summary

| Endpoint | Method | Purpose | Device |
|----------|--------|---------|--------|
| `/api/recommendations` | POST | Record interactions | mobile, web |
| `/api/recommendations` | GET | Retrieve interaction history | mobile, web |
| Local algorithms | - | Generate recs | mobile, web |

---

**Questions?** Check the backend logs and ensure the /api/recommendations endpoint is properly configured to store and retrieve data persistently.
