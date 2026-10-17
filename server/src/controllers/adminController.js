/**
 * Plate Pilot - Super Admin Central Controller
 * Strictly accessible only by the Plate Pilot App Owner
 */

const db = require("../config/db");
const { signToken } = require("../middleware/auth");
const { PLATFORM_SUPER_ADMIN } = require("../config/seedData");

/**
 * Platform SaaS Metrics
 */
async function getSaaSMetrics(req, res, next) {
  try {
    const restaurants = await db.query("SELECT * FROM restaurants;");
    const totalOutlets = restaurants.length;
    const activeOutlets = restaurants.filter(r => r.status === "active").length;
    const suspendedOutlets = restaurants.filter(r => r.status === "suspended").length;
    const pendingOutlets = restaurants.filter(r => r.status === "pending").length;

    // Platform GMV
    const gmvTotal = restaurants.reduce((acc, r) => acc + (parseFloat(r.gmv) || 0), 0);

    // SaaS Annual Subscriptions @ ₹1,999/yr
    const arr = totalOutlets * 1999;
    const mrr = Math.round(arr / 12);

    // Orders Count Platform-wide
    const orderCountRes = await db.queryOne("SELECT COUNT(*) AS total_orders FROM orders;");
    const totalOrders = orderCountRes ? orderCountRes.total_orders : 0;

    return res.json({
      success: true,
      metrics: {
        totalOutlets,
        activeOutlets,
        suspendedOutlets,
        pendingOutlets,
        annualSubscriptionFee: 1999,
        arr,
        mrr,
        platformGmv: gmvTotal,
        totalOrders,
        platformVersion: "2.4.0",
        appOwner: PLATFORM_SUPER_ADMIN.name
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List all Onboarded Restaurants
 */
async function getAllRestaurants(req, res, next) {
  try {
    const { status, search } = req.query;
    let sql = "SELECT * FROM restaurants WHERE 1=1";
    const params = [];

    if (status && status !== "all") {
      sql += " AND status = ?";
      params.push(status);
    }

    if (search) {
      sql += " AND (name LIKE ? OR owner_name LIKE ? OR owner_phone LIKE ? OR cuisine LIKE ?)";
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    sql += " ORDER BY created_at DESC;";
    const restaurants = await db.query(sql, params);

    return res.json({
      success: true,
      count: restaurants.length,
      restaurants: restaurants.map(r => ({
        id: r.id,
        name: r.name,
        cuisine: r.cuisine,
        ownerName: r.owner_name,
        ownerPhone: r.owner_phone,
        ownerPassword: r.owner_password,
        orderPrefix: r.order_prefix,
        address: r.address,
        tablesCount: r.tables_count,
        plan: r.plan,
        status: r.status,
        gmv: parseFloat(r.gmv) || 0,
        createdDate: r.created_date
      }))
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Onboard New Restaurant
 */
async function onboardRestaurant(req, res, next) {
  try {
    const {
      name,
      cuisine,
      ownerName,
      ownerPhone: rawPhone,
      ownerPassword,
      orderPrefix: rawPrefix,
      address,
      tablesCount,
      status
    } = req.body;

    if (!name || !ownerName || !rawPhone || !ownerPassword || !address) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: Name, Owner Name, 10-digit Phone, Password and Address are required."
      });
    }

    const ownerPhone = rawPhone.replace(/\D/g, "").slice(-10);
    let orderPrefix = (rawPrefix || "PP-").trim().toUpperCase();
    if (!orderPrefix.endsWith("-")) orderPrefix += "-";

    const id = "rest-" + Date.now();
    const createdDate = new Date().toISOString().split("T")[0];

    // 1. Insert Restaurant
    await db.execute(
      `INSERT INTO restaurants (id, name, cuisine, owner_name, owner_phone, owner_password, order_prefix, address, tables_count, plan, status, gmv, created_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        name,
        cuisine || "Multi-Cuisine Cafe",
        ownerName,
        ownerPhone,
        ownerPassword,
        orderPrefix,
        address,
        parseInt(tablesCount) || 6,
        "Annual Plan",
        status || "active",
        0,
        createdDate
      ]
    );

    // 2. Create Default Categories
    const defaultCats = [
      { id: "mains", name: "Main Specialties" },
      { id: "starters", name: "Appetizers" },
      { id: "beverages", name: "Beverages" }
    ];

    for (let i = 0; i < defaultCats.length; i++) {
      await db.execute(
        `INSERT INTO categories (id, restaurant_id, name, sort_order) VALUES (?, ?, ?, ?);`,
        [defaultCats[i].id, id, defaultCats[i].name, i]
      );
    }

    // 3. Create Signature Dish
    await db.execute(
      `INSERT INTO menu_items (id, restaurant_id, category_id, title, subtitle, price, cost, stock, in_stock, image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        `${id}-item-1`,
        id,
        "mains",
        `${name} Signature Platter`,
        "Chef's handcrafted gourmet house special",
        320.00,
        95.00,
        30,
        1,
        "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=60"
      ]
    );

    // 4. Create Store Owner Staff Account
    await db.execute(
      `INSERT INTO staff (id, restaurant_id, name, role, phone, password, pin, permissions, avatar, is_app_admin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        `st-${id}-1`,
        id,
        ownerName,
        "Store Owner",
        ownerPhone,
        ownerPassword,
        "1234",
        JSON.stringify(["all"]),
        ownerName.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase(),
        0
      ]
    );

    // 5. Initialize QR Settings
    await db.execute(
      `INSERT INTO qr_settings (restaurant_id, enabled, table_count, upi_id, wifi_ssid, wifi_password)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [id, 1, parseInt(tablesCount) || 6, `${id}@upi`, `${name}_Guest`, "welcome123"]
    );

    return res.status(201).json({
      success: true,
      message: `Restaurant "${name}" successfully onboarded with Annual Plan!`,
      restaurant: {
        id,
        name,
        cuisine,
        ownerName,
        ownerPhone,
        orderPrefix,
        address,
        tablesCount: parseInt(tablesCount) || 6,
        plan: "Annual Plan",
        status: status || "active",
        gmv: 0
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Restaurant Details
 */
async function updateRestaurant(req, res, next) {
  try {
    const { id } = req.params;
    const {
      name,
      cuisine,
      ownerName,
      ownerPhone: rawPhone,
      ownerPassword,
      orderPrefix: rawPrefix,
      address,
      tablesCount,
      status
    } = req.body;

    const existing = await db.queryOne("SELECT * FROM restaurants WHERE id = ?;", [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Restaurant not found." });
    }

    const ownerPhone = rawPhone ? rawPhone.replace(/\D/g, "").slice(-10) : existing.owner_phone;
    let orderPrefix = rawPrefix ? rawPrefix.trim().toUpperCase() : existing.order_prefix;
    if (orderPrefix && !orderPrefix.endsWith("-")) orderPrefix += "-";

    await db.execute(
      `UPDATE restaurants
       SET name = ?, cuisine = ?, owner_name = ?, owner_phone = ?, owner_password = ?, order_prefix = ?, address = ?, tables_count = ?, status = ?
       WHERE id = ?;`,
      [
        name || existing.name,
        cuisine || existing.cuisine,
        ownerName || existing.owner_name,
        ownerPhone,
        ownerPassword || existing.owner_password,
        orderPrefix,
        address || existing.address,
        parseInt(tablesCount) || existing.tables_count,
        status || existing.status,
        id
      ]
    );

    return res.json({
      success: true,
      message: `Restaurant "${name || existing.name}" updated successfully.`
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggle Restaurant Status (active / suspended)
 */
async function toggleRestaurantStatus(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await db.queryOne("SELECT * FROM restaurants WHERE id = ?;", [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Restaurant not found." });
    }

    const newStatus = existing.status === "active" ? "suspended" : "active";
    await db.execute("UPDATE restaurants SET status = ? WHERE id = ?;", [newStatus, id]);

    return res.json({
      success: true,
      message: `Restaurant "${existing.name}" status changed to ${newStatus.toUpperCase()}.`,
      status: newStatus
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete / Offboard Restaurant
 */
async function deleteRestaurant(req, res, next) {
  try {
    const { id } = req.params;
    const countRes = await db.queryOne("SELECT COUNT(*) AS count FROM restaurants;");
    if (countRes && countRes.count <= 1) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete the only remaining restaurant in the platform."
      });
    }

    const existing = await db.queryOne("SELECT * FROM restaurants WHERE id = ?;", [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Restaurant not found." });
    }

    // Cascade delete restaurant data
    await db.execute("DELETE FROM order_items WHERE restaurant_id = ?;", [id]);
    await db.execute("DELETE FROM orders WHERE restaurant_id = ?;", [id]);
    await db.execute("DELETE FROM menu_items WHERE restaurant_id = ?;", [id]);
    await db.execute("DELETE FROM categories WHERE restaurant_id = ?;", [id]);
    await db.execute("DELETE FROM offers WHERE restaurant_id = ?;", [id]);
    await db.execute("DELETE FROM staff WHERE restaurant_id = ?;", [id]);
    await db.execute("DELETE FROM qr_settings WHERE restaurant_id = ?;", [id]);
    await db.execute("DELETE FROM restaurants WHERE id = ?;", [id]);

    return res.json({
      success: true,
      message: `Restaurant "${existing.name}" offboarded and deleted successfully.`
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Super Admin Impersonation
 * Creates a delegated session for the App Owner to act as the store owner
 */
async function impersonateOwner(req, res, next) {
  try {
    const { id } = req.params;
    const rest = await db.queryOne("SELECT * FROM restaurants WHERE id = ?;", [id]);
    if (!rest) {
      return res.status(404).json({ success: false, error: "Restaurant not found." });
    }

    if (rest.status === "suspended") {
      return res.status(400).json({
        success: false,
        error: `Cannot impersonate: "${rest.name}" is currently suspended.`
      });
    }

    const token = signToken({
      id: `owner-${rest.id}`,
      name: rest.owner_name,
      role: `${rest.name} Owner`,
      phone: rest.owner_phone,
      isAppAdmin: false,
      permissions: ["all"],
      restaurantId: rest.id,
      isImpersonating: true,
      originalAdminId: req.user.id
    });

    return res.json({
      success: true,
      message: `Impersonation active for "${rest.name}" as ${rest.owner_name}`,
      token,
      user: {
        id: `owner-${rest.id}`,
        name: rest.owner_name,
        role: `${rest.name} Owner`,
        phone: rest.owner_phone,
        avatar: rest.owner_name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase(),
        isAppAdmin: false,
        permissions: ["all"],
        restaurantId: rest.id,
        isImpersonating: true
      },
      restaurant: {
        id: rest.id,
        name: rest.name,
        orderPrefix: rest.order_prefix,
        address: rest.address
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSaaSMetrics,
  getAllRestaurants,
  onboardRestaurant,
  updateRestaurant,
  toggleRestaurantStatus,
  deleteRestaurant,
  impersonateOwner
};
