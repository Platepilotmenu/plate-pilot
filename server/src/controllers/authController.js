/**
 * Plate Pilot - Auth Controller
 */

const db = require("../config/db");
const { signToken } = require("../middleware/auth");
const { PLATFORM_SUPER_ADMIN } = require("../config/seedData");

/**
 * Unified Login (App Owner, Restaurant Owners, Staff)
 */
async function login(req, res, next) {
  try {
    const { phone: rawPhone, password } = req.body;

    if (!rawPhone || !password) {
      return res.status(400).json({
        success: false,
        error: "Phone number and password are required."
      });
    }

    const phone = rawPhone.replace(/\D/g, "").slice(-10);

    // 1. App Owner (Platform Super Admin) Check
    const superPhone = (process.env.SUPER_ADMIN_PHONE || PLATFORM_SUPER_ADMIN.phone).replace(/\D/g, "").slice(-10);
    const superPassword = process.env.SUPER_ADMIN_PASSWORD || PLATFORM_SUPER_ADMIN.password;

    if (phone === superPhone && password === superPassword) {
      const token = signToken({
        id: PLATFORM_SUPER_ADMIN.id,
        name: PLATFORM_SUPER_ADMIN.name,
        role: PLATFORM_SUPER_ADMIN.role,
        phone: PLATFORM_SUPER_ADMIN.phone,
        isAppAdmin: true,
        permissions: ["all", "admin"],
        restaurantId: null
      });

      return res.json({
        success: true,
        message: "Logged in as Plate Pilot App Owner",
        token,
        user: {
          id: PLATFORM_SUPER_ADMIN.id,
          name: PLATFORM_SUPER_ADMIN.name,
          role: PLATFORM_SUPER_ADMIN.role,
          phone: PLATFORM_SUPER_ADMIN.phone,
          avatar: PLATFORM_SUPER_ADMIN.avatar,
          isAppAdmin: true,
          permissions: ["all", "admin"]
        }
      });
    }

    // 2. Restaurant Owner Check
    const ownerRest = await db.queryOne(
      "SELECT * FROM restaurants WHERE owner_phone LIKE ? AND owner_password = ?;",
      [`%${phone}`, password]
    );

    if (ownerRest) {
      if (ownerRest.status === "suspended") {
        return res.status(403).json({
          success: false,
          error: `Login failed: Restaurant "${ownerRest.name}" is currently suspended.`
        });
      }

      const token = signToken({
        id: `owner-${ownerRest.id}`,
        name: ownerRest.owner_name,
        role: `${ownerRest.name} Owner`,
        phone: ownerRest.owner_phone,
        isAppAdmin: false,
        permissions: ["all"],
        restaurantId: ownerRest.id
      });

      return res.json({
        success: true,
        message: `Logged in as Owner of ${ownerRest.name}`,
        token,
        user: {
          id: `owner-${ownerRest.id}`,
          name: ownerRest.owner_name,
          role: `${ownerRest.name} Owner`,
          phone: ownerRest.owner_phone,
          avatar: ownerRest.owner_name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase(),
          isAppAdmin: false,
          permissions: ["all"],
          restaurantId: ownerRest.id
        },
        restaurant: {
          id: ownerRest.id,
          name: ownerRest.name,
          orderPrefix: ownerRest.order_prefix,
          address: ownerRest.address,
          tablesCount: ownerRest.tables_count
        }
      });
    }

    // 3. Staff Member Check
    const staffMember = await db.queryOne(
      "SELECT * FROM staff WHERE phone LIKE ? AND password = ?;",
      [`%${phone}`, password]
    );

    if (staffMember) {
      let perms = [];
      try {
        perms = JSON.parse(staffMember.permissions || "[]");
      } catch (_) {
        perms = ["pos"];
      }

      const token = signToken({
        id: staffMember.id,
        name: staffMember.name,
        role: staffMember.role,
        phone: staffMember.phone,
        isAppAdmin: !!staffMember.is_app_admin,
        permissions: perms,
        restaurantId: staffMember.restaurant_id
      });

      return res.json({
        success: true,
        message: `Logged in as ${staffMember.name}`,
        token,
        user: {
          id: staffMember.id,
          name: staffMember.name,
          role: staffMember.role,
          phone: staffMember.phone,
          avatar: staffMember.avatar || staffMember.name.substring(0, 2).toUpperCase(),
          isAppAdmin: !!staffMember.is_app_admin,
          permissions: perms,
          restaurantId: staffMember.restaurant_id
        }
      });
    }

    return res.status(401).json({
      success: false,
      error: "Invalid phone number or password. Check credentials and try again."
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Fast PIN Switch on POS Terminal
 */
async function pinLogin(req, res, next) {
  try {
    const { restaurantId, pin } = req.body;

    if (!pin) {
      return res.status(400).json({ success: false, error: "PIN is required." });
    }

    // App Owner Master PIN
    if (pin === (process.env.SUPER_ADMIN_PIN || "9999")) {
      const token = signToken({
        id: PLATFORM_SUPER_ADMIN.id,
        name: PLATFORM_SUPER_ADMIN.name,
        role: PLATFORM_SUPER_ADMIN.role,
        isAppAdmin: true,
        permissions: ["all", "admin"],
        restaurantId: restaurantId || null
      });

      return res.json({
        success: true,
        token,
        user: {
          id: PLATFORM_SUPER_ADMIN.id,
          name: PLATFORM_SUPER_ADMIN.name,
          role: PLATFORM_SUPER_ADMIN.role,
          isAppAdmin: true,
          permissions: ["all", "admin"]
        }
      });
    }

    let querySql = "SELECT * FROM staff WHERE pin = ?";
    const params = [pin];
    if (restaurantId) {
      querySql += " AND (restaurant_id = ? OR is_app_admin = 1)";
      params.push(restaurantId);
    }

    const staffMember = await db.queryOne(querySql, params);

    if (!staffMember) {
      return res.status(401).json({ success: false, error: "Invalid PIN code." });
    }

    let perms = [];
    try {
      perms = JSON.parse(staffMember.permissions || "[]");
    } catch (_) {
      perms = ["pos"];
    }

    const token = signToken({
      id: staffMember.id,
      name: staffMember.name,
      role: staffMember.role,
      phone: staffMember.phone,
      isAppAdmin: !!staffMember.is_app_admin,
      permissions: perms,
      restaurantId: staffMember.restaurant_id
    });

    return res.json({
      success: true,
      token,
      user: {
        id: staffMember.id,
        name: staffMember.name,
        role: staffMember.role,
        avatar: staffMember.avatar || staffMember.name.substring(0, 2).toUpperCase(),
        isAppAdmin: !!staffMember.is_app_admin,
        permissions: perms,
        restaurantId: staffMember.restaurant_id
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Current User from Token
 */
async function getCurrentUser(req, res, next) {
  try {
    return res.json({
      success: true,
      user: req.user
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  pinLogin,
  getCurrentUser
};
