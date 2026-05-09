# 🎀 GownApp System Documentation

---

## 1. System Overview & Architecture

### Core Technology Stack
- **Framework**: React Native (Expo 55.0.8)
- **State Management**: React Context API
- **Navigation**: React Navigation v7 (Native Stack + Bottom Tabs)
- **AR Engine**: Vision Camera v4 + Custom Pose Detection Plugin
- **Storage**: AsyncStorage (Local persistence)
- **UI Icons**: Expo Icons (Ionicons)
- **Build System**: EAS, Gradle (Android), Xcode (iOS)

### Application Flow
```
1. App Initializes
   ├── Load Admin Credentials
   ├── Initialize Sync Endpoint
   └── Set Credentials Ready Flag

2. ShopProvider Activates
   ├── Load Gowns Catalog
   ├── Load User Data
   ├── Load Cart Items
   └── Load Favorites

3. Navigation System
   ├── AppNavigator (Root)
   ├── TabNavigator (5 main tabs)
   └── StackNavigator (Modal screens)

4. User Ready to Browse
```

---

## 2. Global State Management (ShopContext)

### Context Provider
📁 Location: `src/context/ShopContext.js`

### State Variables
| Variable | Type | Purpose |
|----------|------|---------|
| `gowns` | Array | Catalog of all available gowns from backend |
| `user` | Object | Current logged-in user (email, name, role) |
| `cart` | Array | Cart items `[{id, qty}]` persisted to storage |
| `favoritesIds` | Array | IDs of user's bookmarked gowns |
| `loading` | Boolean | Initial data load indicator |
| `lastSyncedAt` | String | Last backend sync timestamp |

### Core State Functions
- **addToCart(id, qty)** → Validates stock → Updates cart → Syncs backend
- **removeFromCart(id)** → Removes item → Saves to storage
- **updateCartQty(id, qty)** → Validates stock → Updates quantity
- **toggleFavorite(id)** → Add/remove from favorites → Save locally
- **reloadGowns()** → Fetch fresh catalog from backend
- **logout()** → Clear user data + cart + favorites

### Data Persistence Architecture
```
✓ On App Load
  ├── Fetch: Gowns from API
  ├── Load: User from localStorage
  ├── Load: Cart from localStorage
  └── Load: Favorites from localStorage

✓ On User Action
  ├── Update State (ShopContext)
  ├── Save to localStorage (AsyncStorage)
  └── Sync to backend (if connected)

✓ Data Sync Flow
  State Change → Local Storage → Backend Sync → ✓ Persisted
```

---

## 3. Authentication System

### Service Location
📁 `src/services/auth.js`

### OTP-Based Login Flow (5 Steps)
```
Step 1: User enters email
        ↓ sendLoginOtp(email)
Step 2: Backend generates OTP code
        ↓ Sends via Email (Nodemailer)
Step 3: User enters OTP in app
        ↓ verifyLoginOtp(email, otp)
Step 4: OTP verified ✓
        ↓ Returns JWT device token
Step 5: Token stored in device_tokens table
        ↓ Device marked as "Trusted"
        (Next login on same device skips OTP)
```

### OTP Storage (Development Mode)
```javascript
// Key: jce_mobile_otp_store
// Stored in AsyncStorage on device

{
  "user@email.com": {
    otp: "123456",        // 6-digit code
    expiresAt: 1234567890 // Expires in 5 minutes
  }
}
```

### Validation Rules Applied
- **Email**: Valid format, converted to lowercase, trimmed
- **OTP Code**: 6-digit number, 5-minute expiry
- **Password** (Signup): 
  - Minimum 8 characters
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 number
  - At least 1 special character

### Authentication Files
| File | Responsibility |
|------|-----------------|
| 📄 `auth.js` | OTP generation, verification logic |
| 📄 `authLocal.js` | Store/retrieve user from device |
| 📄 `authValidation.js` | Email/password validation rules |

---

## 4. How Data Flows

### 4.1 User Registration/Login
```
1. User enters email/password → SignupScreen
2. Submit to /api/auth/register
3. Backend validates → Creates users record with hashed password
4. Client stores user in localStorage via authLocal.js
5. ShopProvider loads user on app start
```

### 4.2 Authentication (OTP Flow)
```
1. User enters email → LoginScreen
2. Send to /api/auth/otp → Backend generates & emails OTP
3. User enters OTP → verifyLoginOtp()
4. Backend returns JWT device token
5. Token stored in device_tokens table (trust for 30 days)
6. Next login on same device skips OTP
```

### 4.3 Gowns Catalog
```
Request: GET /api/gowns
Response includes:
├── id: Unique gown ID
├── name: Gown name
├── price: Display price
├── description: Details
├── images: {
│   ├── primary (is_primary = true) - Main thumbnail
│   ├── is_tryon_asset (is_tryon_asset = true) - AR overlay
│   └── is_back - Back view image
├── colors: Available color variations
├── fabrics: Material types
├── sizes: Available sizes
└── stockQty: Current inventory count

Data Source: PostgreSQL (USE_DB env var) or JSON file (gowns.json)
```

### 4.4 Shopping Cart
```
Client-Side Storage (LocalStorage):
├── Key: Cart items as [{id, qty}]
├── Persists across sessions
└── NOT synced to DB by default

On Checkout:
├── Cart sent to /api/orders
├── Backend creates order + order_items records
├── User can view in "My Orders" page
└── Admin can track in AdminOrdersScreen
```

### 4.5 Checkout & Orders
```
1. User clicks "Checkout" → CartScreen → CheckoutScreen
2. Validates:
   ├── User must be logged in
   ├── Cart not empty
   ├── Stock available for all items
   └── Shipping address provided
3. Submit to POST /api/orders
4. Backend creates:
   ├── orders record (email, total, shipping address)
   ├── order_items for each cart item
   └── order_payments record
5. Payment processed (stores payment_method)
6. Order confirmation email sent
7. User redirected to OrderPlacedScreen
8. Clears cart from localStorage
```

### 4.6 Virtual Try-On (AR)
```
1. User selects gown with is_tryon_asset = true
2. Navigates to ARTryOnScreen
3. Camera Permission requested
4. Vision Camera captures video frame
5. ML Model detects:
   ├── Body pose (joints/landmarks)
   ├── Body segmentation (background removal)
   └── Pose points mapped to gown overlay
6. Gown image (SVG/PNG) overlayed on body:
   ├── Position: Scaled to body size
   ├── Rotation: Adjusted to body angle
   └── Animation: Updates per frame
7. User can:
   ├── Take screenshot (react-native-view-shot)
   ├── Save to device (expo-media-library)
   ├── Share (expo-sharing)
   └── Rotate device for different angles
```

---

## 5. Navigation Structure

### Navigation Location
📁 `src/navigation/AppNavigator.js`

### Tab Navigator (Bottom Tabs)
Visible when user is authenticated:
| Tab | Component | Icon | Shows To |
|-----|-----------|------|----------|
| Home | HomeScreen | home | All |
| Catalogue | GownsScreen | storefront | All |
| Favorites | FavoritesScreen | heart | All |
| Admin | AdminPanelScreen | shield | Admins only |
| Profile | ProfileScreen | person | All |

### Stack Navigator (Modal Screens)
Layered on top of tabs for detailed views:
- **Gowns** → Browse with filters
- **AR Try-On** → Virtual fitting room
- **Cart** → Review items
- **GownDetail** → Full product page
- **Checkout** → Payment & shipping
- **Login/Signup** → Auth screens
- **My Orders** → Order history
- **Order Detail** → Single order view
- **Admin Routes** → Admin-only screens

### Navigation Flow Example
```
MainTabs (Home)
  ↓ User taps "Try AR"
StackNavigator → ARTryOnScreen
  ↓ User goes back
MainTabs (Home)
  ↓ User taps "Admin" tab
MainTabs → AdminPanelScreen
  ↓ User taps "View Stats"
StackNavigator → AdminStatsScreen
```

---

## 6. Admin Panel System

### Admin Panel Location
📁 `src/screens/AdminPanelScreen.js`

### Routes & Access Control
| Route | Endpoint | Purpose | Permission |
|-------|----------|---------|-----------|
| `/admin/contents` | GET/POST | Manage CMS (header, announcements, theme) | admin_contents |
| `/admin/gowns` | GET/POST/PUT | Add/edit/delete gowns | admin_gowns |
| `/admin/orders` | GET/PUT | View & update order status | admin_orders |
| `/admin/stats` | GET | Revenue, orders, trends | admin_stats |
| `/admin/users` | GET | View all users | admin_users |

### Access Control Utility
📄 `src/utils/access.js`
```javascript
canAccess(user, permission)
// Checks if user has role with specific permission
// Example: canAccess(user, "admin_stats")
```

### Admin Stats Screen
**Location**: 📄 `src/screens/AdminStatsScreen.js`

**Features**:
- **Date Range Filters**: Today, Last 7 days, Last 30 days, This year, All time
- **Metrics Displayed**:
  - Total Revenue (formatted as PHP)
  - Total Orders Count
  - Active Orders (paid, processing, ready, shipped)
  - Average Order Value
  - Revenue Trends (daily/monthly/yearly)
  - Top Selling Gowns

- **Order Status Colors**:
  - 🔵 Placed: #2d5be3
  - 🟡 Pending Payment: #856404
  - 🟢 Paid: #155724
  - 🟣 Processing: #4a2c82
  - 🔷 Ready: #0a5276
  - 🔶 Shipped: #0c5460
  - ✅ Completed: #155724
  - ❌ Cancelled: #721c24

- **Export Options**:
  - PDF Report (via expo-print)
  - Share PDF (expo-sharing)

---

## 7. Key Frontend Components

### Component Library
| Component | Location | Purpose |
|-----------|----------|---------|
| **Header** | `src/screens/*.js` | Navigation, search, cart count |
| **ProductCard** | UI component | Gown tile (image, name, price, add-to-cart) |
| **Collection** | UI component | Grid of product cards with filters |
| **TryOnCamera** | `src/ar/NativePoseCamera.js` | Video camera with pose overlay |
| **GownOverlay** | `src/ar/GownSvgOverlay.js` | SVG gown rendered on canvas |
| **RecommendationPanel** | UI component | Carousel of suggested gowns |
| **CartItem** | UI component | Single cart entry with qty controls |
| **OrderCard** | UI component | Order summary with status badge |

---

## 8. AR Try-On System

### AR Engine Location
📁 `src/ar/`

### Components Involved
| File | Function |
|------|----------|
| 📄 `NativePoseCamera.js` | Camera + pose detection wrapper |
| 📄 `GownSvgOverlay.js` | SVG rendering on canvas |
| 📄 `GownNativeSegmentationOverlay.js` | Background removal |
| 📄 `posePluginToLandmarks.js` | Converts pose data to body points |
| 📄 `smoothPoseTransform.js` | Smooths pose jitter |
| 📄 `autoFit.js` | Scales gown to fit body |

### How Pose Detection Works
```
1. Vision Camera captures frame
2. ML Model detects 33 body landmarks:
   ├── Head (nose, eyes, ears)
   ├── Arms (shoulders, elbows, wrists)
   ├── Torso (spine, hips)
   └── Legs (knees, ankles)
3. Pose normalized & smoothed
4. Gown positioned at:
   ├── X: Shoulder center
   ├── Y: Shoulder height
   ├── Scale: Based on shoulder width
   └── Rotation: Based on body angle
5. Rendered on Canvas per frame
```

### Gown Image Requirements
For AR try-on, gowns need:
- ✅ `is_tryon_asset = true` flag in database
- ✅ PNG/SVG format with transparent background
- ✅ Full-length gown image (no person)
- ✅ Centered on canvas
- ✅ High resolution (min 1024x2048px recommended)

### Custom Native Plugin
📁 `packages/vision-camera-native-segmentation/`
- Android: Java implementation for segmentation
- iOS: Objective-C implementation
- Removes background in real-time for clean overlay

---

## 9. Utility Functions

### Key Utilities
| File | Functions |
|------|-----------|
| **authValidation.js** | Email regex, password strength checker |
| **authClient.js** | Login, register, logout functions |
| **cartClient.js** | Add/remove/update cart items |
| **storage.js** | LocalStorage helper (user, cart, favorites) |
| **id.js** | ID normalization (handles MongoDB ObjectId) |
| **access.js** | Permission checker for admin/user roles |
| **datetime.js** | Date parsing, formatting |
| **adminCredentials.js** | Admin secret key management |

### Storage Keys (AsyncStorage)
```
KEY_USER = "jce_user_data"
KEY_CART = "jce_cart_items"
KEY_FAVORITES = "jce_favorites"
KEY_LAST_SYNC = "jce_last_sync_timestamp"
```

---

## 10. Backend API Endpoints

### Auth Endpoints
```
POST /api/auth/register
  → { email, password, name }
  ← { ok, userId, message }

POST /api/auth/otp
  → { email }
  ← { ok, devMode, otp (dev only) }

POST /api/auth/verify-otp
  → { email, otp }
  ← { ok, token, deviceId }

POST /api/auth/logout
  → { }
  ← { ok }
```

### Product Endpoints
```
GET /api/gowns
  ← [ { id, name, price, images[], colors[], sizes[], stockQty } ]

GET /api/gowns/:id
  ← { id, name, description, price, images, inventory }

POST /api/gowns (admin)
  → { name, price, images, colors, sizes, stockQty }
  ← { ok, gownId }

PUT /api/gowns/:id (admin)
  → { name, price, stockQty, ... }
  ← { ok }
```

### Order Endpoints
```
POST /api/orders
  → { items: [{id, qty}], shippingAddress, paymentMethod }
  ← { ok, orderId, total }

GET /api/orders
  ← [ { id, email, total, status, createdAt, items[] } ]

GET /api/orders/:id
  ← { id, email, items[], status, shippingAddress, timeline }

PUT /api/orders/:id (admin)
  → { status }
  ← { ok }
```

### Admin Endpoints
```
GET /api/admin/stats?range=today
  ← { totalRevenue, orderCount, avgValue, topGowns, trends[] }

GET /api/admin/users
  ← [ { id, email, name, orderCount, totalSpent } ]

GET /api/admin/contents?section=header
  ← { section, content, colors, theme }

POST /api/admin/contents (admin)
  → { section, content, colors }
  ← { ok }
```

---

## 11. Data Models

### User Model
```javascript
{
  _id: ObjectId,
  email: String (unique),
  passwordHash: String,
  name: String,
  role: String ('user' | 'admin'),
  avatar: String (URL),
  phone: String,
  createdAt: Date,
  lastLogin: Date,
  preferences: {
    notifications: Boolean,
    newsletter: Boolean
  }
}
```

### Gown Model
```javascript
{
  _id: ObjectId,
  name: String,
  description: String,
  price: Number,
  colors: [String],
  fabrics: [String],
  sizes: [String],
  images: [{
    url: String,
    is_primary: Boolean,
    is_tryon_asset: Boolean,
    is_back: Boolean
  }],
  stockQty: Number,
  reviews: [{
    userId: ObjectId,
    rating: Number,
    text: String
  }],
  createdAt: Date,
  updatedAt: Date
}
```

### Order Model
```javascript
{
  _id: ObjectId,
  email: String,
  userId: ObjectId,
  items: [{
    gownId: ObjectId,
    name: String,
    size: String,
    color: String,
    quantity: Number,
    price: Number
  }],
  subtotal: Number,
  shippingFee: Number,
  total: Number,
  status: String ('placed' | 'paid' | 'processing' | 'ready' | 'shipped' | 'completed' | 'cancelled'),
  shippingAddress: {
    street: String,
    city: String,
    postalCode: String,
    country: String
  },
  paymentMethod: String,
  createdAt: Date,
  updatedAt: Date
}
```

---

## 12. Environment Variables

### Required .env Variables
```
USE_DB=true                    # Use PostgreSQL (false = use gowns.json)
DATABASE_URL=postgres://...    # PostgreSQL connection
BACKEND_URL=http://localhost:3001
EXPO_PUBLIC_API_URL=http://...
NODE_ENV=development
```

---

## 13. Common Data Flows - User Perspective

### Scenario 1: New User Buys a Gown
```
1. App loads → ShopProvider fetches gowns
2. User sees "Catalogue" tab
3. Browses gowns → Taps one → GownDetailScreen
4. Views images, colors, sizes
5. Clicks "Add to Cart" (if not logged in, redirected to LoginScreen)
6. Enters email → Receives OTP → Verifies
7. Cart updated in ShopContext + localStorage
8. User continues shopping or clicks "Cart"
9. Reviews items in CartScreen
10. Clicks "Checkout" → CheckoutScreen
11. Enters shipping address + payment method
12. Submits order → Backend creates order record
13. Redirected to OrderPlacedScreen (shows confirmation)
14. Can view order in "My Orders" section anytime
```

### Scenario 2: Admin Checks Daily Revenue
```
1. Admin logs in (has role='admin')
2. Sees "Admin" tab in navigation
3. Navigates to AdminPanelScreen
4. Selects "View Stats"
5. AdminStatsScreen opens with "today" filter
6. Displays:
   - Total revenue from orders placed today
   - Number of orders
   - Active orders (not yet shipped)
   - Top selling gowns
7. Admin can change date range (today → last 30 days)
8. Can export as PDF report
9. Can share PDF via email/messaging
```

### Scenario 3: User Tries On a Gown in AR
```
1. User in GownDetailScreen sees "Try AR" button
2. Gown must have is_tryon_asset = true
3. Navigates to ARTryOnScreen
4. Requests camera permission
5. Video stream shows user + gown overlay
6. Can rotate device to see different angles
7. Pose detection updates in real-time
8. Takes screenshot (saved to device)
9. Can share screenshot on social media
10. Returns to gown detail
```

---

## 14. Performance Considerations

### Optimization Strategies
- **Image Lazy Loading**: Gown images load on scroll
- **Pose Smoothing**: Reduces jitter, improves AR experience
- **Local Caching**: Gowns cached in ShopContext
- **Cart Batching**: Multiple cart changes batched to single save
- **Pagination**: Admin screens paginate orders/users
- **Debouncing**: Search & filters debounced to reduce API calls

### Known Limitations
- ⚠️ Cart not synced to backend by default (only on checkout)
- ⚠️ AR performance depends on device camera capabilities
- ⚠️ OTP expires after 5 minutes
- ⚠️ Large image files may cause lag on lower-end devices

---

## 15. Development Commands

```bash
# Start dev server
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios

# Web preview
npm run web

# Build for production (EAS)
eas build --platform android
eas build --platform ios
```

---

## 16. File Structure Summary

```
src/
├── screens/          ← All page/view components
├── context/          ← Global state (ShopContext)
├── services/         ← API calls & backend integration
├── navigation/       ← Navigation configuration
├── ar/              ← AR/pose detection logic
├── theme/           ← Design tokens & styling
├── utils/           ← Helper functions
└── data/            ← Sample data (gowns.json)
```

---

**Last Updated**: May 5, 2026
