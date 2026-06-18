# GownApp System - Complete Sync Summary

## **The Big Picture**

Your app has **3 layers**:

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   MOBILE APP    │         │  BACKEND SERVER  │         │    WEB APP      │
│  (React Native) │◄───────►│ (DigitalOcean)   │◄───────►│  (React Website)│
│  On your phone  │  HTTPS  │  PostgreSQL DB   │  HTTPS  │  In browser     │
└─────────────────┘         └──────────────────┘         └─────────────────┘
   AsyncStorage                 plankton-app               Same backend
   (Local)                      (Cloud)                    (Cloud data)
```

---

## **How Everything Syncs**

### **Starting Point: Same Backend**

Both mobile and web talk to the **same server**:
```
const API_BASE_URL = "https://plankton-app-bjwn2.ondigitalocean.app"
```

- Mobile makes API calls here
- Web makes API calls here
- They access the **same PostgreSQL database**

Result: **They always see the same data** ✓

---

## **Scenario 1: Web → Mobile (User Uses Web First)**

```
Step 1: Customer uses WEB BROWSER
        ├─ Logs in
        ├─ Browses gowns
        └─ Adds 3 items to cart

Step 2: Data saved in BACKEND DATABASE
        ├─ users table: email, profile
        ├─ user_carts table: cart items
        └─ All persisted

Step 3: Same customer opens MOBILE APP
        ├─ Enters email + OTP
        ├─ App initializes ShopContext
        └─ Condition: "Is user logged in?" → YES

Step 4: Mobile SYNCS from server
        POST /api/mobile/cart
        Header: X-User-Email: customer@example.com
        ↓
        Backend queries database:
        SELECT items FROM user_carts 
        WHERE email = 'customer@example.com'
        ↓
        Returns: [{id: 1, qty: 1}, {id: 2, qty: 1}, {id: 3, qty: 1}]

Step 5: Mobile receives cart items
        ├─ Saves to phone storage (AsyncStorage)
        ├─ Updates React state
        └─ UI shows: "3 items in cart"

RESULT: Mobile sees same 3 items from web! ✓
```

---

## **Scenario 2: Mobile → Web (User Uses Mobile First)**

```
Step 1: Customer uses MOBILE APP
        ├─ Logs in
        ├─ Browses gowns
        └─ Adds 2 items to cart

Step 2: Mobile syncs immediately
        └─ POST /api/mobile/cart
           Body: {
             items: [{id: 10, qty: 1}, {id: 20, qty: 2}],
             syncedAt: "2026-05-19T10:30:00Z"
           }

Step 3: Backend updates database
        └─ UPDATE user_carts
           SET items = [...],
               last_synced = '2026-05-19T10:30:00Z'
           WHERE email = 'customer@example.com'

Step 4: Same customer opens WEB BROWSER
        ├─ Logs in with same email
        ├─ Web app calls GET /api/gowns, GET /api/cart
        └─ Fetches from same database

Step 5: Web receives cart items
        ├─ Renders in browser
        └─ Shows: "2 items in cart"

RESULT: Web sees same 2 items from mobile! ✓
```

---

## **Scenario 3: Both Using at Same Time**

```
MOBILE APP              DATABASE              WEB APP
(on phone)          (DigitalOcean)          (browser)

User adds item:
    │
    └─ POST /api/mobile/cart ──────→
                                    └─ Updates DB
                                    
Meanwhile, web user is browsing...
                                    GET /api/cart ←─
                                    ↓
                                    Sees NEW item
                                    (Just added by mobile)

Web user removes item:
                            ←──────────────
                            (Web makes request)
                                    │
                                    └─ Updates DB

Mobile app periodically syncs (every 5 mins):
    │
    └─ POST /api/recommendations/track ──────→
       (Sends all interactions: views, favorites)

RESULT: Real-time sync between devices! ✓
```

---

## **Data Flow Diagram**

```
┌─────────────────────────────────────────────────────────────────┐
│                    MOBILE APP (React Native)                    │
├─────────────────────────────────────────────────────────────────┤
│ Local Storage                                                   │
│ ├─ AsyncStorage (SQLite)                                       │
│ ├─ Cart items                                                  │
│ ├─ User email                                                  │
│ ├─ Favorites                                                   │
│ └─ Recommendations cache                                       │
└────────────┬──────────────────────────────────────────┬────────┘
             │ HTTPS                              HTTPS │
             │ API Calls                                │
             │ (Fetch/Save)                            │
             ↓                                          ↑
┌─────────────────────────────────────────────────────────────────┐
│            DIGITALOCEAN BACKEND (Node.js + Express)             │
├─────────────────────────────────────────────────────────────────┤
│ API Endpoints:                                                  │
│ ├─ POST /api/mobile/cart        (save cart)                    │
│ ├─ GET /api/mobile/cart         (fetch cart)                   │
│ ├─ POST /api/mobile/sync-user   (sync user data)               │
│ ├─ POST /api/recommendations/track (send interactions)         │
│ ├─ GET/POST /api/orders         (orders)                       │
│ └─ GET /api/gowns              (catalog)                       │
│                                                                 │
│ PostgreSQL Database:                                            │
│ ├─ users table (email, password, profile)                      │
│ ├─ user_carts table (cart items per user)                      │
│ ├─ orders table (order history)                                │
│ ├─ gowns table (product catalog)                               │
│ ├─ interactions table (views/favorites/cart_adds)              │
│ └─ device_tokens table (trusted devices)                       │
└────────────┬──────────────────────────────────────────┬────────┘
             │ HTTPS                              HTTPS │
             │ API Calls                                │
             │ (Fetch/Save)                            │
             ↓                                          ↑
┌─────────────────────────────────────────────────────────────────┐
│                    WEB APP (React Website)                      │
├─────────────────────────────────────────────────────────────────┤
│ Browser Storage                                                 │
│ ├─ LocalStorage (browser cache)                                │
│ ├─ Cart items                                                  │
│ ├─ User session                                                │
│ ├─ Preferences                                                 │
│ └─ Auth tokens                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## **The Sync Mechanism - How It Works**

### **On App Load (Mobile)**

```javascript
// App.js
useEffect(() => {
  const [gownsData, cartData, userData] = await Promise.all([
    fetchGowns(),      // Get catalog
    loadCart(),        // Load LOCAL from phone
    loadUser(),        // Load LOCAL from phone
  ]);

  // KEY PART: If user logged in, fetch from server
  if (userData?.email) {
    const serverCart = await fetchCartFromServer(userData.email);
    // Cloud cart OVERRIDES local cart
    setCart(serverCart);
  }
});
```

**What This Does:**
- Load fast from local storage (instant)
- Then check backend for latest data (if online)
- Cloud always wins (most up-to-date)

---

### **When User Adds Item (Mobile)**

```javascript
const addToCart = async (id, quantity) => {
  // 1. Update LOCAL state immediately (instant UI)
  setCart([...cart, {id, qty: quantity}]);
  
  // 2. Save to phone storage (persistent)
  await saveCart(updatedCart);
  
  // 3. Sync to backend (background, fire-and-forget)
  await saveCartToServer(email, updatedCart);
  
  // 4. Track for recommendations
  await trackInteraction(email, id, "cart_add");
};
```

**Timeline:**
```
0ms   → User clicks button
1ms   → Local state updates
2ms   → UI re-renders (FAST!)
5ms   → Saved to phone storage
10ms  → Background sync starts
100ms → Server received request
150ms → Database updated
```

**User Experience:**
- ✓ Instant feedback (no waiting)
- ✓ Works offline
- ✓ Cloud syncs automatically

---

### **Periodic Sync (Every 5 Minutes)**

```javascript
// ShopContext.js
useEffect(() => {
  const interval = setInterval(() => {
    syncInteractionsToServer();  // Queue: views, favorites, cart_adds
  }, 5 * 60 * 1000);  // 5 minutes
  
  return () => clearInterval(interval);
}, []);
```

**What Gets Sent:**
```
Queue of interactions:
[
  { userEmail: "john@example.com", gownId: 123, eventType: "view", timestamp: "..." },
  { userEmail: "john@example.com", gownId: 456, eventType: "favorite", timestamp: "..." },
  { userEmail: "john@example.com", gownId: 789, eventType: "cart_add", timestamp: "..." }
]
↓
POST /api/recommendations/track
↓
Backend updates interactions table
↓
Recommendation engine re-calculates
↓
Next sync to mobile gets updated recommendations
```

---

## **The Endpoints - Complete List**

| HTTP Method | Endpoint | Direction | Payload |
|-------------|----------|-----------|---------|
| `GET` | `/api/mobile/cart` | Server → Mobile | Returns: `{items: [...]}` |
| `POST` | `/api/mobile/cart` | Mobile → Server | Sends: `{items: [...], syncedAt: "..."}` |
| `POST` | `/api/mobile/sync-user` | Mobile → Server | Sends: `{email, profile, ...}` |
| `POST` | `/api/recommendations/track` | Mobile → Server | Sends: `{interactions: [...]}` |
| `GET` | `/api/gowns` | Both → Server | Returns: Full catalog |
| `POST` | `/api/auth/login` | Both → Server | Sends: `{email, password}` |
| `POST` | `/api/auth/otp` | Mobile → Server | Sends: `{email}` |
| `GET` | `/api/orders` | Both → Server | Returns: User's orders |

---

## **Storage - Where Data Lives**

### **On Mobile Phone**
```
AsyncStorage (SQLite Database)
├─ gowns catalog (fetched once, cached)
├─ user object {email, name, role, ...}
├─ cart [{id, qty}, {id, qty}, ...]
├─ favorites [id, id, id, ...]
├─ interactions (for recommendations)
└─ sync timestamps
```

**Lost if:** App uninstalled  
**Kept if:** App updates  
**Access:** Only by this app

### **On Backend (DigitalOcean)**
```
PostgreSQL Database
├─ users (permanent accounts)
├─ user_carts (persistent cart data)
├─ orders (order history)
├─ gowns (product catalog)
├─ interactions (behavior tracking)
└─ device_tokens (trusted devices)
```

**Lost if:** Server deleted  
**Kept if:** App uninstalled  
**Access:** Mobile + Web + Admin panel

### **On Web Browser**
```
Browser LocalStorage / SessionStorage
├─ auth token
├─ user session
└─ UI preferences
```

**Lost if:** Browser cache cleared  
**Kept if:** Close tab  
**Access:** Only by web app

---

## **Error Handling & Fallbacks**

### **Mobile Goes Offline**

```
User adds item to cart:
├─ LOCAL: Saved to phone ✓
├─ SYNC: Tries to send to server...
│         └─ Network error!
├─ FALLBACK: Uses local only
└─ RESULT: Cart works offline ✓

When online again:
├─ App detects connection
├─ Queued items sent to server
└─ Sync completes ✓
```

### **Server Down**

```
Mobile tries POST /api/mobile/cart:
├─ Server responds: 500 Error
├─ FALLBACK: Returns { ok: true, local: true }
└─ RESULT: Works with local storage only

Web tries to fetch cart:
├─ Server unreachable
├─ FALLBACK: Shows cached data
└─ RESULT: Still functional
```

---

## **Real Example: Multi-Device Shopping**

```
FRIDAY MORNING:

Mobile (at home):
  └─ User browses gowns
  └─ Adds mermaid gown to cart (qty: 1)
  └─ APP SYNCS to backend
  └─ Backend: user_carts table updated

     ↓ (same day, afternoon)

Web Browser (at work):
  └─ User logs in
  └─ Cart shows: "1 item in cart"
  └─ Adds A-line gown (qty: 1)
  └─ Web syncs to backend
  └─ Backend: user_carts table updated

     ↓ (evening, back home)

Mobile App:
  └─ User returns to app
  └─ App syncs with backend
  └─ Sees both items now: mermaid + A-line ✓
  └─ Can proceed to checkout

RESULT: Seamless shopping across devices!
```

---

## **TL;DR - The 3 Key Points**

### **1. Single Source of Truth**
```
Mobile and Web → Same Backend Database
└─ Both always see latest data
```

### **2. Three Layers**
```
Device Storage (fast, local)
         ↓ SYNC ↓
Cloud Database (persistent, shared)
         ↓ SYNC ↓
Browser Storage (cached)
```

### **3. Fire-and-Forget Pattern**
```
User action → Instant local update
             + Background server sync
             = Best UX (fast + reliable)
```

---

## **For Defense Presentation**

Show this flow:

```
"When a customer adds an item on mobile:
1. Item saved LOCALLY (instant - user sees it)
2. Saved to DEVICE STORAGE (won't lose if app crashes)
3. Background sync sends to SERVER (async, non-blocking)
4. SERVER UPDATES DATABASE (permanent)
5. When customer uses WEB - same database, same item visible"
```

**Why This Matters:**
- ✓ Works offline
- ✓ No data loss
- ✓ Multi-device sync
- ✓ Professional UX (instant feedback)
- ✓ Reliable (cloud backup)
