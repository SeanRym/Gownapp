# GownApp Sync - Brief Explanation

## How Mobile ↔ Web Sync Works

### **The Basic Flow**

```
MOBILE APP                          BACKEND SERVER                      WEB APP
(on phone)                    (DigitalOcean - plankton-app)           (web browser)
    ↓                                     ↓                                  ↓
    └──────────── HTTPS REQUEST ──────────→
                  POST /api/mobile/cart
                  Body: {items: [...]}
                                          ↓
                                   Update PostgreSQL
                                          ↓
    ←──────────── RESPONSE ─────────────────
                  {ok: true}
                                          ↓
                                   ← GET from web
                                   Fetch same data
                                          ↓
                                   User sees same cart!
```

---

## **When Data Syncs**

### **1. User Logs In (Mobile)**
```
User enters email + OTP
    ↓
App checks: "Is user logged in?"
    ↓
YES → Fetch cart from server
    ↓
GET https://plankton-app-bjwn2.ondigitalocean.app/api/mobile/cart
    ↓
Server responds with user's cart from database
    ↓
Mobile saves to phone storage + shows in UI
```

**Code:**
```javascript
if (userData?.email) {
  const serverCart = await fetchCartFromServer(userData.email);
  setCart(serverCart);  // Use server cart
}
```

---

### **2. User Adds Item (Mobile)**
```
User clicks "Add to Cart"
    ↓
Local state updated INSTANTLY (fast UI)
    ↓
Background: POST to server with new cart
    ↓
Server updates database
    ↓
User doesn't wait (async)
```

**Code:**
```javascript
const addToCart = async (id, qty) => {
  const result = await addItemToCart(email, id, qty, cart, gowns);
  setCart(result.cart);  // UI updates NOW
  // Server sync happens in background
};
```

---

### **3. Every 5 Minutes (Background)**
```
Mobile checks: "Any interactions to sync?"
    ↓
Sends all views/favorites/cart_adds to server
    ↓
Server updates recommendations database
    ↓
Fire-and-forget (user doesn't notice)
```

**Code:**
```javascript
setInterval(() => {
  syncInteractionsToServer();  // Every 5 mins
}, 5 * 60 * 1000);
```

---

## **Key Endpoints**

| Request | Endpoint | Direction | What It Does |
|---------|----------|-----------|-------------|
| `GET /api/mobile/cart` | Fetch | Server → Mobile | Get user's cart from database |
| `POST /api/mobile/cart` | Save | Mobile → Server | Update user's cart in database |
| `POST /api/recommendations/track` | Sync | Mobile → Server | Send user interactions (views, favorites) |

---

## **Storage Layers**

```
DEVICE (Phone)
└─ AsyncStorage (SQLite)
   ├─ Cart items (fast access)
   ├─ User email
   └─ Favorites

        ↓ SYNC ↓

BACKEND (DigitalOcean)
└─ PostgreSQL Database
   ├─ user_carts table (cart items)
   ├─ users table (accounts)
   ├─ interactions table (views/favorites)
   └─ orders table (purchases)

        ↓ SYNC ↓

WEB APP (Browser)
└─ Can access same database
   └─ Shows same cart, orders, profile
```

---

## **Multi-Device Scenario**

```
PHONE:
  User adds gown to cart
  Saved locally + synced to backend ✓

SERVER DATABASE:
  Stores: cart = [{id: 123, qty: 2}]

WEB BROWSER:
  User logs in
  Fetches same cart from server
  Sees: "1 item in cart" ✓

RESULT: Both platforms see same data!
```

---

## **Offline Capability**

```
NO INTERNET:
  ├─ User can still browse (local gowns catalog cached)
  ├─ User can add to cart (saved to phone only)
  └─ Sync queue stored locally

INTERNET RETURNS:
  ├─ App detects connection
  ├─ Automatically syncs queued items to server
  └─ Cloud & local now in sync ✓
```

---

## **Error Handling**

```
Network error during sync?
  ├─ Data already saved locally ✓
  ├─ Cart works offline ✓
  └─ Retry sync in 5 mins

Server endpoint down?
  ├─ Fallback to local-only mode
  ├─ User can still shop
  └─ Sync resumes when server back up
```

---

## **Fire-and-Forget Pattern**

```
User Action:
  └─ Add to cart button clicked
     ↓
Immediate Update (Blocking):
  └─ Local state updated
  └─ UI re-renders
  └─ User sees item in cart INSTANTLY

Background Sync (Non-blocking):
  └─ POST to server happens after
  └─ User doesn't wait
  └─ Doesn't freeze UI
```

**Why This is Good:**
- ✓ Instant feedback to user
- ✓ Doesn't depend on network speed
- ✓ Works offline
- ✓ Professional UX

---

## **TL;DR**

1. **Local First** → Data saved on phone immediately (fast)
2. **Cloud Second** → Background sync to server happens async
3. **Multi-Device Sync** → Web/mobile access same database
4. **Offline Safe** → Works without internet, syncs when online

**Endpoints:**
- `GET /api/mobile/cart` ← Fetch from server
- `POST /api/mobile/cart` ← Save to server
- `POST /api/recommendations/track` ← Send interactions

**Timing:**
- Instant: Local update
- Background: Server sync
- Every 5 mins: Auto-sync interactions
