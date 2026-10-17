/**
 * Plate Pilot - Database Initializer & Seeder
 */

const fs = require("fs");
const path = require("path");
const db = require("./db");
const { PLATFORM_SUPER_ADMIN, DEFAULT_ONBOARDED_RESTAURANTS, DEFAULT_OUTLET_DATA } = require("./seedData");

async function initDb(forceReset = false) {
  await db.initDatabase();

  const schemaPath = path.join(__dirname, "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  if (forceReset) {
    console.log("[initDb] Force resetting database tables...");
    const tables = ["order_items", "orders", "menu_items", "categories", "offers", "staff", "qr_settings", "restaurants"];
    for (const table of tables) {
      try {
        await db.execute(`DROP TABLE IF EXISTS ${table};`);
      } catch (_) {}
    }
  }

  // Execute DDL schema
  await db.execScript(schemaSql);
  console.log("[initDb] Database schema verified and initialized.");

  // Check if already seeded
  const existingRest = await db.queryOne("SELECT COUNT(*) AS count FROM restaurants;");
  if (existingRest && existingRest.count > 0 && !forceReset) {
    console.log(`[initDb] Database already contains ${existingRest.count} restaurants. Skipping seeding.`);
    return;
  }

  console.log("[initDb] Seeding database with default platform restaurants and accounts...");

  // 1. Seed Super Admin
  await db.execute(
    `INSERT INTO staff (id, restaurant_id, name, role, phone, password, pin, permissions, avatar, is_app_admin)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      PLATFORM_SUPER_ADMIN.id,
      null,
      PLATFORM_SUPER_ADMIN.name,
      PLATFORM_SUPER_ADMIN.role,
      PLATFORM_SUPER_ADMIN.phone,
      PLATFORM_SUPER_ADMIN.password,
      PLATFORM_SUPER_ADMIN.pin,
      JSON.stringify(PLATFORM_SUPER_ADMIN.permissions),
      PLATFORM_SUPER_ADMIN.avatar,
      1
    ]
  );

  // 2. Seed Restaurants
  for (const r of DEFAULT_ONBOARDED_RESTAURANTS) {
    await db.execute(
      `INSERT INTO restaurants (id, name, cuisine, owner_name, owner_phone, owner_password, order_prefix, address, tables_count, plan, status, gmv, created_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        r.id,
        r.name,
        r.cuisine,
        r.ownerName,
        r.ownerPhone,
        r.ownerPassword,
        r.orderPrefix,
        r.address,
        r.tablesCount || 6,
        r.plan || "Annual Plan",
        r.status || "active",
        r.gmv || 0,
        r.createdDate || "2026-10-01"
      ]
    );

    const outletData = DEFAULT_OUTLET_DATA[r.id];
    if (!outletData) continue;

    // Seed Categories
    for (let i = 0; i < (outletData.categories || []).length; i++) {
      const cat = outletData.categories[i];
      await db.execute(
        `INSERT INTO categories (id, restaurant_id, name, sort_order) VALUES (?, ?, ?, ?);`,
        [cat.id, r.id, cat.name, i]
      );
    }

    // Seed Menu Items
    for (const item of (outletData.menuItems || [])) {
      await db.execute(
        `INSERT INTO menu_items (id, restaurant_id, category_id, title, subtitle, price, cost, stock, in_stock, image)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          item.id,
          r.id,
          item.category,
          item.title,
          item.subtitle || "",
          item.price,
          item.cost || 0,
          item.stock || 50,
          item.inStock ? 1 : 0,
          item.image || ""
        ]
      );
    }

    // Seed Staff
    for (const member of (outletData.staff || [])) {
      await db.execute(
        `INSERT INTO staff (id, restaurant_id, name, role, phone, password, pin, permissions, avatar, is_app_admin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          member.id,
          r.id,
          member.name,
          member.role,
          member.phone,
          member.password,
          member.pin || "1234",
          JSON.stringify(member.permissions || ["pos"]),
          member.avatar || member.name.substring(0, 2).toUpperCase(),
          0
        ]
      );
    }

    // Seed Offers
    for (const off of (outletData.offers || [])) {
      await db.execute(
        `INSERT INTO offers (id, restaurant_id, code, title, discount_type, value, min_order, description, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          off.id,
          r.id,
          off.code,
          off.title,
          off.discountType,
          off.value,
          off.minOrder || 0,
          off.description || "",
          off.active ? 1 : 0
        ]
      );
    }

    // Seed QR Settings
    const qr = outletData.qrOrdering || { enabled: true, tableCount: 6, upiId: `${r.id}@upi` };
    await db.execute(
      `INSERT INTO qr_settings (restaurant_id, enabled, table_count, upi_id, wifi_ssid, wifi_password)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [
        r.id,
        qr.enabled ? 1 : 0,
        qr.tableCount || 6,
        qr.upiId || "",
        `${r.name}_Guest`,
        "welcome123"
      ]
    );

    // Seed Orders
    for (const ord of (outletData.orders || [])) {
      await db.execute(
        `INSERT INTO orders (id, restaurant_id, type, table_number, customer_name, payment_status, subtotal, total, status, received_time, time_ago)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          ord.id,
          r.id,
          ord.type,
          ord.type.includes("Table") ? parseInt(ord.type.replace(/\D/g, "") || "1") : null,
          ord.customer || "Walk-in Guest",
          ord.paymentStatus || "PAID (UPI)",
          ord.subtotal,
          ord.subtotal,
          ord.status || "active",
          ord.receivedTime || "12:00 PM",
          ord.timeAgo || "5m ago"
        ]
      );

      for (const it of (ord.items || [])) {
        await db.execute(
          `INSERT INTO order_items (order_id, restaurant_id, name, price, qty, item_total)
           VALUES (?, ?, ?, ?, ?, ?);`,
          [
            ord.id,
            r.id,
            it.name,
            it.price,
            it.qty,
            (it.price * it.qty)
          ]
        );
      }
    }
  }

  console.log("[initDb] Seeding completed successfully!");
}

if (require.main === module) {
  initDb(process.argv.includes("--reset"))
    .then(() => {
      console.log("[initDb] Done.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[initDb] Fatal error:", err);
      process.exit(1);
    });
}

module.exports = { initDb };
