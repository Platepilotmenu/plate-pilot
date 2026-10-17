/**
 * Plate Pilot - Staff Management Controller
 */

const db = require("../config/db");

/**
 * List Staff for Restaurant
 */
async function getStaff(req, res, next) {
  try {
    const { id } = req.params;
    const staff = await db.query(
      "SELECT id, restaurant_id, name, role, phone, pin, permissions, avatar, is_app_admin FROM staff WHERE restaurant_id = ? ORDER BY id ASC;",
      [id]
    );

    return res.json({
      success: true,
      count: staff.length,
      staff: staff.map(s => {
        let perms = [];
        try {
          perms = JSON.parse(s.permissions || "[]");
        } catch (_) {
          perms = ["pos"];
        }
        return {
          id: s.id,
          restaurantId: s.restaurant_id,
          name: s.name,
          role: s.role,
          phone: s.phone,
          pin: s.pin,
          permissions: perms,
          avatar: s.avatar || s.name.substring(0, 2).toUpperCase(),
          isAppAdmin: !!s.is_app_admin
        };
      })
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Add New Staff Member
 */
async function createStaff(req, res, next) {
  try {
    const { id } = req.params;
    const { name, role, phone: rawPhone, password, pin, permissions } = req.body;

    if (!name || !role || !rawPhone || !password) {
      return res.status(400).json({
        success: false,
        error: "Name, role, phone, and password are required."
      });
    }

    const phone = rawPhone.replace(/\D/g, "").slice(-10);
    const existing = await db.queryOne("SELECT * FROM staff WHERE phone LIKE ?;", [`%${phone}`]);
    if (existing) {
      return res.status(400).json({ success: false, error: `Phone number ${phone} is already registered.` });
    }

    const staffId = "st-" + Date.now();
    const cleanPerms = Array.isArray(permissions) ? permissions : ["pos"];
    const avatar = name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();

    await db.execute(
      `INSERT INTO staff (id, restaurant_id, name, role, phone, password, pin, permissions, avatar, is_app_admin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        staffId,
        id,
        name.trim(),
        role.trim(),
        phone,
        password,
        pin || "1234",
        JSON.stringify(cleanPerms),
        avatar,
        0
      ]
    );

    return res.status(201).json({
      success: true,
      message: `Staff member "${name}" created.`,
      staff: {
        id: staffId,
        restaurantId: id,
        name: name.trim(),
        role: role.trim(),
        phone,
        pin: pin || "1234",
        permissions: cleanPerms,
        avatar,
        isAppAdmin: false
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Staff Member
 */
async function updateStaff(req, res, next) {
  try {
    const { id, staffId } = req.params;
    const { name, role, phone: rawPhone, password, pin, permissions } = req.body;

    const existing = await db.queryOne("SELECT * FROM staff WHERE restaurant_id = ? AND id = ?;", [id, staffId]);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Staff member not found." });
    }

    const newName = name !== undefined ? name.trim() : existing.name;
    const newRole = role !== undefined ? role.trim() : existing.role;
    const newPhone = rawPhone ? rawPhone.replace(/\D/g, "").slice(-10) : existing.phone;
    const newPassword = password !== undefined ? password : existing.password;
    const newPin = pin !== undefined ? pin : existing.pin;
    const newPerms = permissions !== undefined ? JSON.stringify(permissions) : existing.permissions;
    const avatar = newName.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();

    await db.execute(
      `UPDATE staff
       SET name = ?, role = ?, phone = ?, password = ?, pin = ?, permissions = ?, avatar = ?
       WHERE restaurant_id = ? AND id = ?;`,
      [newName, newRole, newPhone, newPassword, newPin, newPerms, avatar, id, staffId]
    );

    return res.json({
      success: true,
      message: `Staff member "${newName}" updated.`
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete Staff Member
 */
async function deleteStaff(req, res, next) {
  try {
    const { id, staffId } = req.params;
    const existing = await db.queryOne("SELECT * FROM staff WHERE restaurant_id = ? AND id = ?;", [id, staffId]);

    if (!existing) {
      return res.status(404).json({ success: false, error: "Staff member not found." });
    }

    if (existing.role && existing.role.includes("Owner")) {
      return res.status(400).json({ success: false, error: "Cannot delete the primary restaurant owner account." });
    }

    await db.execute("DELETE FROM staff WHERE restaurant_id = ? AND id = ?;", [id, staffId]);

    return res.json({
      success: true,
      message: `Staff member "${existing.name}" deleted.`
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff
};
