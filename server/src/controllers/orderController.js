/**
 * Plate Pilot - Orders & POS Controller
 */

const db = require("../config/db");

/**
 * List Orders for Restaurant
 */
async function getOrders(req, res, next) {
  try {
    const { id } = req.params;
    const { status, limit } = req.query;

    let sql = "SELECT * FROM orders WHERE restaurant_id = ?";
    const params = [id];

    if (status && status !== "all") {
      sql += " AND status = ?";
      params.push(status);
    }

    sql += " ORDER BY created_at DESC";
    if (limit) {
      sql += ` LIMIT ${parseInt(limit)}`;
    } else {
      sql += " LIMIT 100";
    }

    const orders = await db.query(sql, params);

    // Fetch items for each order
    const result = [];
    for (const ord of orders) {
      const items = await db.query(
        "SELECT * FROM order_items WHERE order_id = ? AND restaurant_id = ?;",
        [ord.id, id]
      );
      result.push({
        id: ord.id,
        restaurantId: ord.restaurant_id,
        type: ord.type,
        tableNumber: ord.table_number,
        customer: ord.customer_name,
        customerPhone: ord.customer_phone,
        paymentStatus: ord.payment_status,
        paymentMethod: ord.payment_method,
        subtotal: parseFloat(ord.subtotal),
        discountAmount: parseFloat(ord.discount_amount || 0),
        taxAmount: parseFloat(ord.tax_amount || 0),
        total: parseFloat(ord.total),
        status: ord.status,
        source: ord.source,
        receivedTime: ord.received_time,
        timeAgo: ord.time_ago,
        createdAt: ord.created_at,
        items: items.map(it => ({
          name: it.name,
          price: parseFloat(it.price),
          qty: it.qty,
          itemTotal: parseFloat(it.item_total)
        }))
      });
    }

    return res.json({
      success: true,
      count: result.length,
      orders: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create New POS Order
 */
async function createOrder(req, res, next) {
  try {
    const { id } = req.params;
    const {
      type,
      tableNumber,
      customer,
      customerPhone,
      items,
      paymentMethod,
      discountAmount,
      taxAmount,
      source
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: "Order must contain at least one item." });
    }

    const rest = await db.queryOne("SELECT * FROM restaurants WHERE id = ?;", [id]);
    if (!rest) {
      return res.status(404).json({ success: false, error: "Restaurant not found." });
    }

    if (rest.status === "suspended") {
      return res.status(403).json({ success: false, error: `Cannot place order: "${rest.name}" is suspended.` });
    }

    // Generate Order ID using outlet prefix
    const prefix = rest.order_prefix || "PP-";
    const countRes = await db.queryOne("SELECT COUNT(*) AS count FROM orders WHERE restaurant_id = ?;", [id]);
    const orderNum = (countRes ? countRes.count : 0) + 101;
    const orderId = `${prefix}${orderNum}`;

    let subtotal = 0;
    const normalizedItems = items.map(it => {
      const price = parseFloat(it.price) || 0;
      const qty = parseInt(it.qty) || 1;
      const itemTotal = price * qty;
      subtotal += itemTotal;
      return {
        name: it.name || it.title,
        price,
        qty,
        itemTotal
      };
    });

    const discount = parseFloat(discountAmount) || 0;
    const tax = parseFloat(taxAmount) || 0;
    const total = Math.max(0, subtotal - discount + tax);

    const now = new Date();
    const receivedTime = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // 1. Insert Order Header
    await db.execute(
      `INSERT INTO orders (id, restaurant_id, type, table_number, customer_name, customer_phone, payment_status, payment_method, subtotal, discount_amount, tax_amount, total, status, source, received_time, time_ago)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        orderId,
        id,
        type || "Dine-in",
        tableNumber ? parseInt(tableNumber) : null,
        customer || "Guest",
        customerPhone || "",
        `PAID (${(paymentMethod || "UPI").toUpperCase()})`,
        (paymentMethod || "UPI").toUpperCase(),
        subtotal,
        discount,
        tax,
        total,
        "active",
        source || "pos",
        receivedTime,
        "Just now"
      ]
    );

    // 2. Insert Order Items
    for (const it of normalizedItems) {
      await db.execute(
        `INSERT INTO order_items (order_id, restaurant_id, name, price, qty, item_total)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [orderId, id, it.name, it.price, it.qty, it.itemTotal]
      );
    }

    // 3. Update Restaurant GMV
    await db.execute(
      "UPDATE restaurants SET gmv = gmv + ? WHERE id = ?;",
      [total, id]
    );

    return res.status(201).json({
      success: true,
      message: `Order ${orderId} created successfully.`,
      order: {
        id: orderId,
        restaurantId: id,
        type: type || "Dine-in",
        customer: customer || "Guest",
        subtotal,
        discountAmount: discount,
        taxAmount: tax,
        total,
        status: "active",
        receivedTime,
        timeAgo: "Just now",
        items: normalizedItems
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Single Order
 */
async function getOrderById(req, res, next) {
  try {
    const { id, orderId } = req.params;
    const ord = await db.queryOne("SELECT * FROM orders WHERE restaurant_id = ? AND id = ?;", [id, orderId]);

    if (!ord) {
      return res.status(404).json({ success: false, error: "Order not found." });
    }

    const items = await db.query("SELECT * FROM order_items WHERE restaurant_id = ? AND order_id = ?;", [id, orderId]);

    return res.json({
      success: true,
      order: {
        id: ord.id,
        restaurantId: ord.restaurant_id,
        type: ord.type,
        tableNumber: ord.table_number,
        customer: ord.customer_name,
        paymentStatus: ord.payment_status,
        paymentMethod: ord.payment_method,
        subtotal: parseFloat(ord.subtotal),
        discountAmount: parseFloat(ord.discount_amount || 0),
        taxAmount: parseFloat(ord.tax_amount || 0),
        total: parseFloat(ord.total),
        status: ord.status,
        source: ord.source,
        receivedTime: ord.received_time,
        createdAt: ord.created_at,
        items: items.map(it => ({
          name: it.name,
          price: parseFloat(it.price),
          qty: it.qty,
          itemTotal: parseFloat(it.item_total)
        }))
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Order Status (active, ready, completed, void)
 */
async function updateOrderStatus(req, res, next) {
  try {
    const { id, orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ["active", "ready", "completed", "void"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      });
    }

    const existing = await db.queryOne("SELECT * FROM orders WHERE restaurant_id = ? AND id = ?;", [id, orderId]);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Order not found." });
    }

    await db.execute("UPDATE orders SET status = ? WHERE restaurant_id = ? AND id = ?;", [status, id, orderId]);

    return res.json({
      success: true,
      message: `Order ${orderId} status updated to ${status.toUpperCase()}.`,
      status
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Store Dashboard Sales Metrics
 */
async function getDashboardMetrics(req, res, next) {
  try {
    const { id } = req.params;
    const orders = await db.query("SELECT * FROM orders WHERE restaurant_id = ?;", [id]);

    const completedOrActive = orders.filter(o => o.status !== "void");
    const totalRevenue = completedOrActive.reduce((acc, o) => acc + (parseFloat(o.total) || 0), 0);
    const activeOrdersCount = orders.filter(o => o.status === "active").length;
    const readyOrdersCount = orders.filter(o => o.status === "ready").length;
    const avgTicket = completedOrActive.length > 0 ? (totalRevenue / completedOrActive.length).toFixed(2) : "0.00";

    const itemsSoldRes = await db.queryOne(
      "SELECT SUM(qty) AS total_items FROM order_items WHERE restaurant_id = ?;",
      [id]
    );

    return res.json({
      success: true,
      metrics: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        ordersCount: completedOrActive.length,
        activeOrdersCount,
        readyOrdersCount,
        avgTicket: parseFloat(avgTicket),
        itemsSold: itemsSoldRes ? (itemsSoldRes.total_items || 0) : 0
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOrders,
  createOrder,
  getOrderById,
  updateOrderStatus,
  getDashboardMetrics
};
