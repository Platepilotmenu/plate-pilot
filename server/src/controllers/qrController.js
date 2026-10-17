/**
 * Plate Pilot - Public Customer QR Dining Controller
 * No authentication required - Publicly accessible by dining customers
 */

const db = require("../config/db");

/**
 * Get Public Menu & Dining Info for Table QR Code
 */
async function getTableQrMenu(req, res, next) {
  try {
    const { restId, tableNum } = req.params;

    const rest = await db.queryOne("SELECT id, name, cuisine, address, status, order_prefix FROM restaurants WHERE id = ?;", [restId]);
    if (!rest) {
      return res.status(404).json({ success: false, error: "Restaurant not found." });
    }

    if (rest.status === "suspended") {
      return res.status(403).json({ success: false, error: "This restaurant is currently closed for digital ordering." });
    }

    const qrSettings = await db.queryOne("SELECT * FROM qr_settings WHERE restaurant_id = ?;", [restId]);
    if (qrSettings && !qrSettings.enabled) {
      return res.status(403).json({ success: false, error: "QR Ordering is temporarily disabled by this restaurant." });
    }

    // Categories
    const categories = await db.query(
      "SELECT id, name FROM categories WHERE restaurant_id = ? ORDER BY sort_order ASC, name ASC;",
      [restId]
    );

    // Menu Items (In-stock only for customers)
    const items = await db.query(
      "SELECT id, category_id, title, subtitle, price, image, stock FROM menu_items WHERE restaurant_id = ? AND in_stock = 1 ORDER BY title ASC;",
      [restId]
    );

    // Active Offers
    const offers = await db.query(
      "SELECT id, code, title, discount_type, value, min_order, description FROM offers WHERE restaurant_id = ? AND active = 1;",
      [restId]
    );

    return res.json({
      success: true,
      restaurant: {
        id: rest.id,
        name: rest.name,
        cuisine: rest.cuisine,
        address: rest.address
      },
      tableNumber: parseInt(tableNum) || 1,
      wifi: qrSettings ? { ssid: qrSettings.wifi_ssid, password: qrSettings.wifi_password } : null,
      upiId: qrSettings ? qrSettings.upi_id : null,
      categories,
      menuItems: items.map(it => ({
        id: it.id,
        category: it.category_id,
        title: it.title,
        subtitle: it.subtitle,
        price: parseFloat(it.price),
        image: it.image
      })),
      offers: offers.map(o => ({
        code: o.code,
        title: o.title,
        discountType: o.discount_type,
        value: parseFloat(o.value),
        minOrder: parseFloat(o.min_order || 0),
        description: o.description
      }))
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Customer Places Self-Order via QR
 */
async function placeCustomerQrOrder(req, res, next) {
  try {
    const { restId } = req.params;
    const { tableNumber, customerName, customerPhone, items, offerCode, paymentMethod } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: "Cart is empty. Please add items." });
    }

    const rest = await db.queryOne("SELECT * FROM restaurants WHERE id = ?;", [restId]);
    if (!rest || rest.status === "suspended") {
      return res.status(403).json({ success: false, error: "Restaurant is unavailable." });
    }

    // Generate Order ID
    const prefix = rest.order_prefix || "PP-";
    const countRes = await db.queryOne("SELECT COUNT(*) AS count FROM orders WHERE restaurant_id = ?;", [restId]);
    const orderNum = (countRes ? countRes.count : 0) + 101;
    const orderId = `${prefix}${orderNum}`;

    let subtotal = 0;
    const normalizedItems = [];

    for (const itemReq of items) {
      const itemRow = await db.queryOne("SELECT * FROM menu_items WHERE restaurant_id = ? AND id = ?;", [restId, itemReq.id]);
      const price = itemRow ? parseFloat(itemRow.price) : (parseFloat(itemReq.price) || 0);
      const name = itemRow ? itemRow.title : itemReq.name;
      const qty = parseInt(itemReq.qty) || 1;
      const itemTotal = price * qty;
      subtotal += itemTotal;

      normalizedItems.push({
        id: itemReq.id,
        name,
        price,
        qty,
        itemTotal
      });
    }

    // Apply Offer if provided
    let discountAmount = 0;
    if (offerCode) {
      const cleanCode = offerCode.trim().toUpperCase();
      const offer = await db.queryOne("SELECT * FROM offers WHERE restaurant_id = ? AND code = ? AND active = 1;", [restId, cleanCode]);
      if (offer && subtotal >= parseFloat(offer.min_order || 0)) {
        if (offer.discount_type === "pct") {
          discountAmount = (subtotal * parseFloat(offer.value)) / 100;
        } else {
          discountAmount = Math.min(subtotal, parseFloat(offer.value));
        }
      }
    }

    const total = Math.max(0, subtotal - discountAmount);
    const now = new Date();
    const receivedTime = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Insert Order
    await db.execute(
      `INSERT INTO orders (id, restaurant_id, type, table_number, customer_name, customer_phone, payment_status, payment_method, subtotal, discount_amount, tax_amount, total, status, source, received_time, time_ago)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        orderId,
        restId,
        `Dine-in • Table ${String(tableNumber || 1).padStart(2, "0")}`,
        parseInt(tableNumber) || 1,
        customerName || "Table Guest",
        customerPhone || "",
        `PAID (${(paymentMethod || "UPI").toUpperCase()})`,
        (paymentMethod || "UPI").toUpperCase(),
        subtotal,
        discountAmount,
        0,
        total,
        "active",
        "qr_customer",
        receivedTime,
        "Just now"
      ]
    );

    // Insert Items
    for (const it of normalizedItems) {
      await db.execute(
        `INSERT INTO order_items (order_id, restaurant_id, name, price, qty, item_total)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [orderId, restId, it.name, it.price, it.qty, it.itemTotal]
      );
    }

    // Update GMV
    await db.execute("UPDATE restaurants SET gmv = gmv + ? WHERE id = ?;", [total, restId]);

    return res.status(201).json({
      success: true,
      message: "Order placed successfully! Kitchen has received your order.",
      order: {
        id: orderId,
        restaurantName: rest.name,
        tableNumber: parseInt(tableNumber) || 1,
        customerName: customerName || "Table Guest",
        subtotal,
        discountAmount,
        total,
        status: "active",
        receivedTime,
        items: normalizedItems
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Customer Track Order Status
 */
async function trackOrderStatus(req, res, next) {
  try {
    const { orderId } = req.params;
    const ord = await db.queryOne("SELECT * FROM orders WHERE id = ?;", [orderId]);

    if (!ord) {
      return res.status(404).json({ success: false, error: "Order not found." });
    }

    const rest = await db.queryOne("SELECT name FROM restaurants WHERE id = ?;", [ord.restaurant_id]);
    const items = await db.query("SELECT name, price, qty FROM order_items WHERE order_id = ?;", [orderId]);

    return res.json({
      success: true,
      order: {
        id: ord.id,
        restaurantName: rest ? rest.name : "Restaurant",
        type: ord.type,
        customer: ord.customer_name,
        status: ord.status,
        receivedTime: ord.received_time,
        total: parseFloat(ord.total),
        items: items.map(it => ({ name: it.name, qty: it.qty, price: parseFloat(it.price) }))
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getTableQrMenu,
  placeCustomerQrOrder,
  trackOrderStatus
};
