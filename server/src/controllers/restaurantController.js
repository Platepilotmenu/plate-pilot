/**
 * Plate Pilot - Restaurant Profile & Settings Controller
 */

const db = require("../config/db");

/**
 * Get Restaurant Full Profile & Configuration
 */
async function getRestaurantById(req, res, next) {
  try {
    const { id } = req.params;
    const rest = await db.queryOne("SELECT * FROM restaurants WHERE id = ?;", [id]);

    if (!rest) {
      return res.status(404).json({ success: false, error: "Restaurant not found." });
    }

    const qrSettings = await db.queryOne("SELECT * FROM qr_settings WHERE restaurant_id = ?;", [id]);

    return res.json({
      success: true,
      restaurant: {
        id: rest.id,
        name: rest.name,
        cuisine: rest.cuisine,
        ownerName: rest.owner_name,
        ownerPhone: rest.owner_phone,
        orderPrefix: rest.order_prefix,
        address: rest.address,
        tablesCount: rest.tables_count,
        plan: rest.plan,
        status: rest.status,
        gmv: parseFloat(rest.gmv) || 0,
        qrOrdering: qrSettings ? {
          enabled: !!qrSettings.enabled,
          tableCount: qrSettings.table_count,
          upiId: qrSettings.upi_id,
          wifiSsid: qrSettings.wifi_ssid,
          wifiPassword: qrSettings.wifi_password
        } : { enabled: true, tableCount: rest.tables_count, upiId: "" }
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Restaurant Profile (Settings tab)
 */
async function updateRestaurantProfile(req, res, next) {
  try {
    const { id } = req.params;
    const { name, phone, orderPrefix: rawPrefix, address, tablesCount, cuisine } = req.body;

    const existing = await db.queryOne("SELECT * FROM restaurants WHERE id = ?;", [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Restaurant not found." });
    }

    let orderPrefix = rawPrefix ? rawPrefix.trim().toUpperCase() : existing.order_prefix;
    if (orderPrefix && !orderPrefix.endsWith("-")) orderPrefix += "-";

    await db.execute(
      `UPDATE restaurants
       SET name = ?, owner_phone = ?, order_prefix = ?, address = ?, tables_count = ?, cuisine = ?
       WHERE id = ?;`,
      [
        name || existing.name,
        phone ? phone.replace(/\D/g, "").slice(-10) : existing.owner_phone,
        orderPrefix,
        address || existing.address,
        parseInt(tablesCount) || existing.tables_count,
        cuisine || existing.cuisine,
        id
      ]
    );

    return res.json({
      success: true,
      message: "Restaurant profile updated successfully."
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get QR Ordering Settings
 */
async function getQrSettings(req, res, next) {
  try {
    const { id } = req.params;
    const qr = await db.queryOne("SELECT * FROM qr_settings WHERE restaurant_id = ?;", [id]);

    return res.json({
      success: true,
      qrSettings: qr ? {
        enabled: !!qr.enabled,
        tableCount: qr.table_count,
        upiId: qr.upi_id,
        wifiSsid: qr.wifi_ssid,
        wifiPassword: qr.wifi_password
      } : { enabled: true, tableCount: 6, upiId: "" }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update QR Ordering Settings
 */
async function updateQrSettings(req, res, next) {
  try {
    const { id } = req.params;
    const { enabled, tableCount, upiId, wifiSsid, wifiPassword } = req.body;

    const existing = await db.queryOne("SELECT * FROM qr_settings WHERE restaurant_id = ?;", [id]);

    if (existing) {
      await db.execute(
        `UPDATE qr_settings
         SET enabled = ?, table_count = ?, upi_id = ?, wifi_ssid = ?, wifi_password = ?
         WHERE restaurant_id = ?;`,
        [
          enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
          tableCount ? parseInt(tableCount) : existing.table_count,
          upiId !== undefined ? upiId : existing.upi_id,
          wifiSsid !== undefined ? wifiSsid : existing.wifi_ssid,
          wifiPassword !== undefined ? wifiPassword : existing.wifi_password,
          id
        ]
      );
    } else {
      await db.execute(
        `INSERT INTO qr_settings (restaurant_id, enabled, table_count, upi_id, wifi_ssid, wifi_password)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [id, enabled ? 1 : 0, parseInt(tableCount) || 6, upiId || "", wifiSsid || "", wifiPassword || ""]
      );
    }

    return res.json({
      success: true,
      message: "QR ordering settings saved."
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getRestaurantById,
  updateRestaurantProfile,
  getQrSettings,
  updateQrSettings
};
