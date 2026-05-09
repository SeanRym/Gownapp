/**
 * BACKEND ENDPOINT GUIDE FOR CART SYNC
 * Add these endpoints to your Express/Node.js backend
 */

// ============================================
// 1. GET /api/cart
// ============================================
// Fetch user's cart from database
// 
// Headers:
//   - X-User-Email: user@example.com
//
// Response (200):
// {
//   "items": [
//     { "id": "gown_id_1", "qty": 2 },
//     { "id": "gown_id_2", "qty": 1 }
//   ],
//   "lastUpdated": "2024-05-05T10:30:00Z"
// }
//
// Example SQL query:
// SELECT items FROM user_carts WHERE email = $1

app.get('/api/cart', authenticateUser, async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];
    if (!userEmail) {
      return res.status(400).json({ error: 'User email required' });
    }

    // Query database
    const result = await db.query(
      'SELECT items, updated_at FROM user_carts WHERE email = $1',
      [userEmail.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.json({ items: [], lastUpdated: new Date().toISOString() });
    }

    const cart = result.rows[0];
    res.json({
      items: cart.items || [],
      lastUpdated: cart.updated_at
    });
  } catch (err) {
    console.error('Error fetching cart:', err);
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});


// ============================================
// 2. POST /api/cart
// ============================================
// Save/Update user's cart to database
// Syncs across all devices (mobile, web, etc)
//
// Headers:
//   - X-User-Email: user@example.com
//
// Body:
// {
//   "items": [
//     { "id": "gown_id_1", "qty": 2 },
//     { "id": "gown_id_2", "qty": 1 }
//   ],
//   "syncedAt": "2024-05-05T10:30:00Z"
// }
//
// Response (200):
// {
//   "ok": true,
//   "items": [...],
//   "syncedAt": "2024-05-05T10:30:00Z"
// }
//
// Example SQL:
// INSERT INTO user_carts (email, items, updated_at)
// VALUES ($1, $2, NOW())
// ON CONFLICT (email) DO UPDATE SET
//   items = $2,
//   updated_at = NOW()

app.post('/api/cart', authenticateUser, async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];
    if (!userEmail) {
      return res.status(400).json({ error: 'User email required' });
    }

    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items must be an array' });
    }

    // Validate items format
    const validItems = items.filter(item => 
      item.id && Number.isFinite(item.qty) && item.qty > 0
    );

    // Upsert to database
    const result = await db.query(
      `INSERT INTO user_carts (email, items, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (email) DO UPDATE SET
         items = $2,
         updated_at = NOW()
       RETURNING items, updated_at`,
      [userEmail.toLowerCase(), JSON.stringify(validItems)]
    );

    const cart = result.rows[0];
    res.json({
      ok: true,
      items: JSON.parse(cart.items),
      syncedAt: cart.updated_at
    });
  } catch (err) {
    console.error('Error saving cart:', err);
    res.status(500).json({ error: 'Failed to save cart' });
  }
});


// ============================================
// 3. DELETE /api/cart
// ============================================
// Clear user's cart
//
// Headers:
//   - X-User-Email: user@example.com
//
// Response (200):
// { "ok": true, "message": "Cart cleared" }

app.delete('/api/cart', authenticateUser, async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];
    if (!userEmail) {
      return res.status(400).json({ error: 'User email required' });
    }

    await db.query(
      'UPDATE user_carts SET items = $1, updated_at = NOW() WHERE email = $2',
      [JSON.stringify([]), userEmail.toLowerCase()]
    );

    res.json({ ok: true, message: 'Cart cleared' });
  } catch (err) {
    console.error('Error clearing cart:', err);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});


// ============================================
// DATABASE SCHEMA (PostgreSQL)
// ============================================
// Create this table in your database:

CREATE TABLE user_carts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  items JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE
);

CREATE INDEX idx_user_carts_email ON user_carts(email);
CREATE INDEX idx_user_carts_updated_at ON user_carts(updated_at);


// ============================================
// Example: Migration Script
// ============================================

-- If you're using migration tool (e.g., db-migrate, Flyway)
-- Create migration file: migrations/create_user_carts_table.sql

BEGIN;

CREATE TABLE user_carts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  items JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE
);

CREATE INDEX idx_user_carts_email ON user_carts(email);
CREATE INDEX idx_user_carts_updated_at ON user_carts(updated_at);

COMMIT;


// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================
// Make sure your endpoints verify the user:

function authenticateUser(req, res, next) {
  // Option 1: Check JWT token
  const token = req.headers.authorization?.split(' ')[1];
  
  // Option 2: Check X-User-Email header (for now, for quick implementation)
  const userEmail = req.headers['x-user-email'];
  
  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  req.userEmail = userEmail;
  next();
}


// ============================================
// INTEGRATION WITH CHECKOUT
// ============================================
// When user completes checkout:

app.post('/api/orders', authenticateUser, async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];
    const { items, shippingAddress, paymentMethod } = req.body;

    // 1. Create order in database
    const orderResult = await db.query(
      `INSERT INTO orders (email, items, shipping_address, total, status, created_at)
       VALUES ($1, $2, $3, $4, 'placed', NOW())
       RETURNING id`,
      [userEmail, JSON.stringify(items), JSON.stringify(shippingAddress), calculateTotal(items)]
    );

    // 2. Clear user's cart after checkout
    await db.query(
      'UPDATE user_carts SET items = $1 WHERE email = $2',
      [JSON.stringify([]), userEmail]
    );

    // 3. Send confirmation email
    // ... email logic ...

    res.json({
      ok: true,
      orderId: orderResult.rows[0].id,
      message: 'Order placed successfully'
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});


// ============================================
// ADMIN ENDPOINT: Export Carts
// ============================================
// Optional: View all user carts (admin only)

app.get('/api/admin/carts', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT email, items, updated_at 
       FROM user_carts 
       ORDER BY updated_at DESC 
       LIMIT 100`
    );

    res.json({
      ok: true,
      carts: result.rows,
      total: result.rows.length
    });
  } catch (err) {
    console.error('Error fetching carts:', err);
    res.status(500).json({ error: 'Failed to fetch carts' });
  }
});
