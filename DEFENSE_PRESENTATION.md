# GownApp System - Defense Presentation Guide
## Complete System Overview & Architecture Explanation

---

## 1. **WHAT IS GOWNAPP?**

**GownApp** is a mobile-first bridal e-commerce application that allows customers to:
- Browse and purchase bridal gowns and dresses online
- Use **Augmented Reality (AR)** to virtually try on gowns before buying
- Receive **AI-powered product recommendations** based on their preferences
- Manage their shopping experience (cart, orders, favorites)
- Have a secure admin panel for staff to manage inventory and orders

**Platform:** React Native with Expo (runs on iOS & Android)  
**Build System:** EAS (Expo Application Services), Gradle (Android), Xcode (iOS)

---

## 2. **TECHNOLOGY STACK**

| Layer | Technology |
|-------|-----------|
| **Frontend Framework** | React Native (Expo 55.0.8) |
| **State Management** | React Context API (ShopContext) |
| **Navigation** | React Navigation v7 (Tabs + Stack Navigator) |
| **AR/ML Engine** | Vision Camera v4 + ML Kit Pose Detection |
| **Local Storage** | AsyncStorage (persistent device data) |
| **UI Components** | Expo Icons (Ionicons) |
| **Build & Deploy** | EAS + Gradle + Xcode |

---

## 3. **SYSTEM ARCHITECTURE OVERVIEW**

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERFACE LAYER                     │
│  (5 Main Tabs: Home, Catalog, Favorites, Admin, Profile)   │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│            NAVIGATION LAYER (React Navigation)              │
│  ├─ TabNavigator (5 main tabs)                             │
│  └─ StackNavigator (modal screens like checkout)           │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│         GLOBAL STATE LAYER (ShopContext)                    │
│  ├─ User data (logged-in customer info)                    │
│  ├─ Gowns catalog                                          │
│  ├─ Shopping cart                                          │
│  ├─ Favorites list                                         │
│  └─ Sync status & timestamps                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│        SERVICES LAYER (Business Logic)                      │
│  ├─ Authentication (auth.js, authLocal.js)                │
│  ├─ Cart Management (cart.js)                             │
│  ├─ Gown Catalog (gowns.js)                               │
│  ├─ Orders (orders.js)                                    │
│  ├─ Recommendations (recommendations.js)                  │
│  ├─ AR Segmentation (ar/*.js)                             │
│  └─ Data Sync (sync.js)                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│         STORAGE LAYER (Local & Cloud)                       │
│  ├─ AsyncStorage (on-device persistence)                  │
│  ├─ Backend API (cloud sync)                              │
│  └─ ML Kit / Vision Camera (native AR processing)         │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. **KEY FEATURES & HOW THEY WORK**

### 4.1 **AUTHENTICATION SYSTEM (OTP-Based)**

**The Problem Solved:** Secure login without complex passwords for mobile users

**The Flow:**

```
Step 1: Customer enters email
           ↓
Step 2: Backend generates 6-digit OTP code
           ↓
Step 3: OTP sent via email to customer
           ↓
Step 4: Customer enters OTP in app
           ↓
Step 5: OTP verified ✓
           ↓
Step 6: Backend returns JWT device token
           ↓
Step 7: Device marked as "TRUSTED" (30 days)
           ↓
Next Login: Same device = NO OTP needed! (Faster return)
```

**Files Involved:**
- `src/services/auth.js` → OTP generation & verification logic
- `src/services/authLocal.js` → Storing/retrieving user from device
- `src/screens/LoginScreen.js` → UI for entering email and OTP
- `src/screens/SignupScreen.js` → Registration with password validation

**Validation Rules:**
- Email: Valid format, lowercase, trimmed
- OTP: 6 digits, expires in 5 minutes
- Password (signup): Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char

---

### 4.2 **SHOPPING CART SYSTEM (With Cloud Sync)**

**Key Concept:** Cart data lives in TWO places:
1. **Local Storage** (on your phone) - Fast access, works offline
2. **Backend Server** (cloud) - Synced for multi-device access

**The Workflow:**

```
User adds item to cart (GownDetailScreen)
     ↓
addToCart() function in ShopContext validates:
  ├─ Is user logged in? (require auth)
  ├─ Is item in stock? (check inventory)
  └─ Add item with quantity
     ↓
Update local ShopContext state INSTANTLY (fast UI)
     ↓
Save to AsyncStorage (on-device persistence)
     ↓
Sync to backend API (async, fire-and-forget)
     ↓
User can proceed to checkout with their items
```

**Multi-Device Sync:**
- When user logs in on mobile, app fetches cart from cloud
- If cloud cart exists, it OVERWRITES local cart
- All future changes sync back to cloud
- User can now access same cart on web and mobile!

**Files:**
- `src/services/cart.js` → Cart API calls
- `src/context/ShopContext.js` → Global cart state management

---

### 4.3 **AUGMENTED REALITY (AR) TRY-ON**

**The Problem Solved:** "Will this gown look good on me?" → Try it virtually before buying!

**Technology Stack:**
- **Vision Camera v4** → Captures real-time video from phone camera
- **ML Kit Pose Detection** → Detects human pose (head, shoulders, arms, torso)
- **Native Segmentation** → Extracts person silhouette from background
- **Custom SVG Overlay** → Renders gown image on top of detected pose

**How It Works:**

```
User taps "AR Try-On" on gown detail
     ↓
App requests camera permission
     ↓
NativePoseCamera component activates:
  ├─ Captures video frames at 12 FPS
  ├─ Detects pose landmarks (head, shoulders, arms, body)
  ├─ Optionally segments person from background
  └─ Emits pose data + frame info to React component
     ↓
GownSvgOverlay calculates gown position:
  ├─ Scale gown to match detected body width
  ├─ Position at detected shoulder position
  ├─ Apply perspective transformation
  └─ Render as SVG overlay on video feed
     ↓
User sees real-time gown visualization on their body!
```

**Technical Details:**
- Frame processor runs at 12 FPS (balances accuracy vs phone performance)
- Segmentation runs at 5 FPS (lower due to processing cost)
- All processing happens on-device (NO cloud calls = faster + private)
- Uses worklets (Reanimated library) for smooth performance

**Files:**
- `src/ar/NativePoseCamera.js` → Camera + pose detection
- `src/ar/GownSvgOverlay.js` → SVG rendering + pose transforms
- `src/ar/smoothPoseTransform.js` → Smoothing jittery pose data
- `src/screens/ARTryOnScreen.js` → UI/UX for AR feature

**Algorithms Used:**
- **Pose Detection:** ML Kit's pose detection (detects 17 body landmarks)
- **Auto-Fit:** Custom algorithm to scale & position gown based on user dimensions
- **Smoothing:** Kalman filter-like smoothing to reduce jitter

---

### 4.4 **INTELLIGENT RECOMMENDATIONS (Hybrid ML System)**

**The Problem Solved:** "What should I buy next?" → AI learns from your behavior + similar customers

**Four Recommendation Engines (Ensemble Approach):**

| Engine | Algorithm | What It Does |
|--------|-----------|-------------|
| **Content-Based** | TF-IDF | "You viewed a mermaid gown → recommend similar mermaid gowns" |
| **KNN Collaborative** | K-Nearest Neighbors | "10 users like you favored this gown → you should see it too" |
| **Apriori (Market Basket)** | Association Rules | "Gowns X + Y are often viewed together → recommend Y if viewing X" |
| **Hybrid** | Weighted Voting | Combines all 3 with weights: 40% content + 35% KNN + 25% apriori |

**How Interactions Are Tracked:**

```
User Action              Points Assigned
─────────────────────────────────────────
View gown                1 point   (light signal)
Favorite gown            3 points  (medium signal)
Add to cart              5 points  (strong signal)
Submit inquiry           7 points  (very strong intent)
```

**The Data Flow:**

```
Step 1: User views/favorites/adds gown
           ↓
Step 2: Action tracked locally (instant, no network needed)
           ↓
Step 3: Interaction stored in device AsyncStorage
           ↓
Step 4: Every 5 minutes: Sync interactions to backend
           ↓
Step 5: Backend updates user profile with interaction history
           ↓
Step 6: Next time: All 4 engines re-evaluate recommendations
           ↓
Step 7: "You might also like" section shows top 4 gowns
```

**Example Scenario:**

```
You view 3 mermaid gowns (3 views × 1 pt = 3 pts for mermaid style)
You favorite 1 white gown (1 fav × 3 pts = 3 pts for white color)
You add A-line gown to cart (1 cart add × 5 pts = 5 pts for A-line)

System learns: You prefer mermaid + white + A-line styles

Next gown you view:
  ├─ Content-Based finds: 8 other mermaid gowns ✓
  ├─ KNN finds: 12 users with your taste liked these 5 gowns ✓
  ├─ Apriori finds: Customers viewing mermaid also liked these 3 ✓
  └─ Hybrid scores & ranks → Top 4 shown in "You might also like"
```

**Files:**
- `src/utils/recommender/hybridRecommender.js` → Master algorithm
- `src/utils/recommender/contentBased.js` → Content-based engine
- `src/utils/recommender/knnCollaborative.js` → KNN engine
- `src/utils/recommender/apriori.js` → Market basket engine
- `src/services/recommendations.js` → Interaction tracking & syncing

---

### 4.5 **ADMIN DASHBOARD & INVENTORY MANAGEMENT**

**Admin Capabilities:**
- View all orders with status tracking
- Manage gown catalog (add/edit/delete/archive)
- Monitor sales analytics (revenue, order counts, trends)
- Manage staff accounts and permissions

**Role-Based Access Control:**

```
Regular Customer:
├─ View: Home, Catalog, Favorites, Profile
├─ Actions: Browse, Add to cart, Checkout, View orders
└─ Access: ❌ Admin tab

Admin/Staff:
├─ View: All customer tabs + Admin tab
├─ Sub-sections: Orders, Gowns, Stats, Users
├─ Actions: Create/edit/delete gowns, manage inventory
└─ Access: ✓ Full admin panel
```

**Admin Panel Flow:**

```
User presses "Admin" tab
     ↓
Check: Does user have admin_tab permission?
  ├─ YES: Show admin hub
  └─ NO: Hide admin tab entirely
     ↓
Admin hub shows 4 cards:
  ├─ Catalogue → AdminGownsScreen (manage inventory)
  ├─ Orders → AdminOrdersScreen (view/process orders)
  ├─ Sales Dashboard → AdminStatsScreen (analytics)
  └─ Users → AdminUsersScreen (manage staff accounts)
     ↓
Each screen pulls data from backend APIs
```

**Files:**
- `src/screens/AdminPanelScreen.js` → Hub/dashboard
- `src/screens/AdminGownsScreen.js` → Inventory management
- `src/screens/AdminOrdersScreen.js` → Order management
- `src/screens/AdminStatsScreen.js` → Analytics & reporting
- `src/screens/AdminUsersScreen.js` → Staff management
- `src/utils/access.js` → Permission checking logic

---

## 5. **DATA FLOW & SYNCHRONIZATION**

### Application Initialization Sequence:

```
App.js starts
     ↓
1. Load admin credentials (for secure API access)
2. Initialize sync endpoint (establish backend connection)
     ↓
Credentials ready ✓
     ↓
ShopProvider activates:
  ├─ Fetch gowns catalog from API (parallel)
  ├─ Load user from local storage (parallel)
  ├─ Load cart from local storage (parallel)
  ├─ Load favorites from local storage (parallel)
     ↓
User logged in?
  ├─ YES: Fetch cart from backend (cloud sync)
  │        └─ If cloud has cart → overwrite local ✓
  └─ NO: Use local cart
     ↓
Sync interval started:
  ├─ Every 5 mins: Sync recommendations/interactions
  ├─ Every sync: Fire-and-forget to backend
  └─ Non-blocking (doesn't freeze UI)
     ↓
App ready for user!
```

### Real-Time Update Sequence (Example: Add to Cart):

```
User clicks "Add to Cart" button
     ↓
addToCart(gownId, quantity) called
     ↓
Validations:
  ├─ Is user logged in? (require auth)
  ├─ Fetch gown from state (get current price/stock)
  ├─ Check stock available?
  └─ Generate unique cart item ID
     ↓
State update:
  ├─ Update ShopContext cart array
  ├─ UI re-renders INSTANTLY (fast feedback)
  └─ Toast notification shows success
     ↓
Persist to device:
  └─ Save updated cart to AsyncStorage (on-device)
     ↓
Sync to cloud (async, no await):
  ├─ POST to /api/cart/addItem
  ├─ Backend updates user's cloud cart
  └─ If error: Silent fail (user doesn't notice)
     ↓
User sees item in cart immediately!
(Backend sync happens in background)
```

### Multi-Device Sync Example:

```
Scenario: User has phone + web browser

On Mobile:
  1. Add gown X to cart → Saved locally + synced to backend

On Web (different tab):
  1. Sign in with same email
  2. Backend returns cart with gown X included
  3. User sees gown X in their web cart!
     ↓
Data consistency achieved across devices ✓

Scenario: Offline then Online:

On Mobile (Offline):
  1. Add gown to cart → Saved locally only
  2. No internet → Sync fails silently

When Online:
  1. App reconnects → Sync triggered
  2. Cart sent to backend
  3. "Last synced at: 2 min ago" indicator updates
     ↓
All changes preserved! ✓
```

---

## 6. **HOW EVERYTHING CONNECTS (Integration Points)**

### Authentication → Shopping:

```
User logs in (LoginScreen)
     ↓
JWT token stored in device_tokens table (backend)
     ↓
ShopContext loads user data
     ↓
User can now:
  ├─ Add items to cart ✓
  ├─ View past orders ✓
  ├─ Manage favorites ✓
  └─ Get personalized recommendations ✓
```

### Recommendations → Shopping:

```
User views gown detail
     ↓
GownDetailScreen calls trackInteraction("view", gownId)
     ↓
Interaction logged to local storage
     ↓
Hybrid recommender calculates top 4 similar gowns
     ↓
"You might also like" section displays recommendations
     ↓
User clicks recommended gown → Cycles continues ✓
```

### AR → Inventory:

```
User taps "Try AR"
     ↓
ARTryOnScreen loads gown image + dimensions
     ↓
Vision Camera activates with pose detection
     ↓
User sees virtual gown on their body in real-time
     ↓
User decides to buy?
  ├─ YES: Navigate to checkout
  └─ NO: Continue browsing (recommendations kick in)
```

### Admin → Orders → Recommendations:

```
Admin processes order (marks as shipped)
     ↓
Order status updated in backend
     ↓
Customer gets order update notification
     ↓
System tracks: "Customer bought this gown" (interaction)
     ↓
Recommendation engine learns from purchase
     ↓
Next time customer logs in: Personalized recommendations shown ✓
```

---

## 7. **KEY TECHNICAL DECISIONS & WHY**

### Decision 1: React Context API (Not Redux)
- **Why:** Simpler for team, sufficient for app scale
- **Trade-off:** Redux would handle complex state better at enterprise scale

### Decision 2: OTP Authentication (Not Password)
- **Why:** Better UX on mobile, reduces forgot password issues
- **Trade-off:** Requires email delivery, adds network call

### Decision 3: On-Device ML Processing (AR)
- **Why:** Privacy, speed, offline capability
- **Trade-off:** Less accurate than cloud ML, but acceptable for AR try-on

### Decision 4: Hybrid Recommendations (Not Single Algorithm)
- **Why:** Ensemble approach more robust, different algorithms catch different patterns
- **Trade-off:** Higher computation cost, more complex implementation

### Decision 5: AsyncStorage + Cloud Sync (Not Cloud-Only)
- **Why:** Works offline, fast local access, better UX
- **Trade-off:** Data consistency challenges, need sync logic

### Decision 6: Expo (Not Bare React Native)
- **Why:** Faster development, built-in mobile services, easier deployment
- **Trade-off:** Limited native module support, larger app size

---

## 8. **SECURITY CONSIDERATIONS**

```
🔒 Authentication:
  ├─ OTP tokens expire in 5 minutes
  ├─ Device tokens expire in 30 days
  └─ JWT used for API authorization

🔒 Data Protection:
  ├─ Cart synced only after authentication
  ├─ User data only visible to that user
  └─ Admin operations require admin role

🔒 On-Device Storage:
  ├─ AsyncStorage used (not encrypted by default in dev)
  ├─ Production: Consider Android Keystore / iOS Keychain
  └─ Sensitive data: Tokens, user emails

🔒 API Communication:
  ├─ HTTPS only (enforced at backend)
  ├─ Backend validates all requests
  └─ Rate limiting prevents abuse
```

---

## 9. **PERFORMANCE OPTIMIZATIONS**

```
⚡ UI/UX Performance:
  ├─ Lazy loading of gown images
  ├─ Virtualized lists (scrolling long catalogs)
  ├─ Debounced search/filter operations
  └─ Memoized components to prevent re-renders

⚡ AR Performance:
  ├─ Pose detection throttled to 12 FPS (not 30)
  ├─ Segmentation throttled to 5 FPS (expensive operation)
  ├─ Pose smoothing to reduce jitter
  └─ Native frame processor (worklets) for speed

⚡ Network Performance:
  ├─ Async syncs (don't block user actions)
  ├─ Batch API calls where possible (parallel Promise.all)
  ├─ Cache gowns catalog (fetched once on startup)
  └─ Fire-and-forget non-critical updates

⚡ Storage Performance:
  ├─ AsyncStorage operates in background thread
  ├─ Only essential data persisted
  └─ Regular cleanup of old data
```

---

## 10. **DEPLOYMENT ARCHITECTURE**

```
Local Development:
  └─ npm run start → Expo Go app or prebuild locally

Testing:
  ├─ Android emulator + Android Studio
  ├─ iOS simulator + Xcode
  └─ Physical device testing

Production Build:
  ├─ EAS CLI: eas build -p android --profile production
  ├─ EAS CLI: eas build -p ios --profile production
  ├─ Generates signed APK (Android) + IPA (iOS)
  └─ Ready for Google Play Store + Apple App Store

Deployment:
  ├─ EAS Submit: eas submit -p android --profile production
  ├─ EAS Submit: eas submit -p ios --profile production
  └─ Manual app store reviews + approval

Backend API:
  ├─ DigitalOcean server running Node.js/Express
  ├─ PostgreSQL database for persistent data
  └─ Endpoints for auth, gowns, cart, orders, recommendations
```

---

## 11. **NAVIGATION STRUCTURE (User Journeys)**

### Main Navigation:

```
┌─ Home Tab ──→ Featured gowns, recommendations, hero banner
├─ Catalog Tab → Browse all gowns, filter by type/price
├─ Favorites Tab → Bookmarked gowns, quick add-to-cart
├─ Admin Tab → (Staff only) Dashboard
└─ Profile Tab → User account, orders, logout

Modal Screens (Stack Navigator):
├─ GownDetail → Full gown info, AR try-on, recommendations
├─ ARTryOn → Virtual try-on experience
├─ Cart → Review items, update quantities
├─ Checkout → Payment info, order confirmation
├─ MyOrders → Track user's past orders
├─ OrderDetail → Full order information
├─ Auth → Login/Signup/ForgotPassword
└─ Admin Sub-screens:
    ├─ AdminOrders → View/manage all orders
    ├─ AdminGowns → Create/edit gown listings
    ├─ AdminStats → Sales analytics
    └─ AdminUsers → Manage staff accounts
```

---

## 12. **TESTING THE SYSTEM (What Panelists Should See)**

### Recommended Demo Flow:

1. **Browse & Recommendations:**
   - Open app → Home screen
   - Tap gown → View recommendation section ("You might also like")

2. **Authentication:**
   - Logout → Login screen
   - Enter email → Tap "Get OTP"
   - Check console logs → Show OTP generated
   - Enter OTP → Login successful

3. **AR Try-On:**
   - Go to gown detail → Tap "Try with AR"
   - Show gown overlaid on live camera feed
   - Move device → Show real-time tracking

4. **Shopping:**
   - Add gown to cart → Show instant UI update
   - Go to cart → See item with quantity controls
   - Proceed to checkout → Show order placement

5. **Admin Panel:**
   - Login with admin account
   - Show admin tab (hidden for regular users)
   - Show order management, gown inventory, analytics

6. **Multi-Device Sync:**
   - Add item on mobile
   - Open web app (if available) → Show same cart

---

## 13. **KEY FILES AT A GLANCE**

| File/Folder | Purpose |
|-------------|---------|
| `App.js` | App entry point, initialization |
| `src/context/ShopContext.js` | Global state management |
| `src/navigation/AppNavigator.js` | Navigation structure |
| `src/screens/` | All UI screens (18 screens total) |
| `src/services/` | Business logic (auth, cart, orders, etc.) |
| `src/ar/` | AR/ML components (pose, segmentation, overlays) |
| `src/utils/recommender/` | Recommendation engines |
| `src/theme/brand.js` | Design tokens (colors, fonts) |

---

## 14. **UNIQUE VALUE PROPOSITIONS**

1. **AR Try-On:** First-to-market feature for bridal gowns - reduces returns, increases confidence
2. **Hybrid Recommendations:** ML ensemble approach = more accurate suggestions than single algorithm
3. **Mobile-First:** Native mobile app = faster, more responsive than web
4. **Offline Capable:** Works without internet, syncs when online
5. **On-Device ML:** AR processing on device = privacy + speed, no cloud dependency
6. **Multi-Device:** Cart syncs across phone, tablet, web seamlessly

---

## 15. **WHAT MAKES THIS IMPRESSIVE FOR PANELISTS**

✅ **Technical Complexity:**
- AR with real-time pose detection on mobile
- Hybrid ML recommendation system
- Smart data synchronization architecture

✅ **User Experience:**
- Seamless multi-device sync
- Offline-capable with cloud fallback
- AR try-on reduces purchase anxiety

✅ **Scalability:**
- Stateless backend (can add more servers)
- Efficient caching strategies
- Async processing prevents bottlenecks

✅ **Security:**
- OTP-based auth (modern & secure)
- Role-based access control
- Data encryption in transit

✅ **Business Impact:**
- Reduced return rates (AR confirmation)
- Increased average order value (better recommendations)
- Multi-channel experience (mobile + web)

---

**End of System Overview. Ready for Q&A!**
