/**
 * Plate Pilot - Authentication & Access Control Middleware
 */

const jwt = require("jsonwebtoken");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "platepilot_super_secret_jwt_key_2026";

/**
 * Sign JWT Token
 */
function signToken(payload) {
  return jwt.sign(
    {
      id: payload.id,
      name: payload.name,
      role: payload.role,
      phone: payload.phone,
      isAppAdmin: !!payload.isAppAdmin,
      permissions: payload.permissions || [],
      restaurantId: payload.restaurantId || null,
      isImpersonating: !!payload.isImpersonating,
      originalAdminId: payload.originalAdminId || null
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/**
 * Extract and verify JWT
 */
function verifyAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split(" ")[1];
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Require valid authenticated user
 */
function requireAuth(req, res, next) {
  const user = verifyAuthHeader(req);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: "Authentication required. Please provide a valid Bearer token."
    });
  }
  req.user = user;
  next();
}

/**
 * Require App Owner (Super Admin) Access
 * Strictly limited to the single App Owner account or active App Owner impersonation
 */
function requireAppOwner(req, res, next) {
  const user = verifyAuthHeader(req);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: "Authentication required."
    });
  }

  const isOwner = !!(user.isAppAdmin || user.isImpersonating);
  if (!isOwner) {
    return res.status(403).json({
      success: false,
      error: "Access Denied: Admin Panel and platform management are restricted strictly to the single App Owner account."
    });
  }

  req.user = user;
  next();
}

/**
 * Ensure user has permission for a specific restaurant
 * App Owner has universal access; Store Owners/Staff can only access their own restaurant
 */
function requireRestaurantAccess(paramName = "id") {
  return (req, res, next) => {
    const user = verifyAuthHeader(req);
    if (!user) {
      return res.status(401).json({ success: false, error: "Authentication required." });
    }

    req.user = user;
    const targetRestId = req.params[paramName] || req.body.restaurantId || req.query.restaurantId;

    if (user.isAppAdmin || user.isImpersonating) {
      return next(); // Universal access for App Owner
    }

    if (user.restaurantId && user.restaurantId === targetRestId) {
      return next(); // User belongs to this restaurant
    }

    return res.status(403).json({
      success: false,
      error: `Access Denied: You do not have permissions for restaurant '${targetRestId}'.`
    });
  };
}

/**
 * Check fine-grained staff permissions (e.g. 'pos', 'menu', 'all')
 */
function requirePermission(requiredPerm) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, error: "Authentication required." });
    }

    if (user.isAppAdmin || user.isImpersonating) {
      return next();
    }

    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    if (perms.includes("all") || perms.includes(requiredPerm)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: `Access Denied: Missing required permission '${requiredPerm}'.`
    });
  };
}

module.exports = {
  signToken,
  requireAuth,
  requireAppOwner,
  requireRestaurantAccess,
  requirePermission,
  JWT_SECRET
};
