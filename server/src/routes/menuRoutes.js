const express = require("express");
const router = express.Router();
const menuController = require("../controllers/menuController");
const { requireAuth, requireRestaurantAccess, requirePermission } = require("../middleware/auth");

// Categories
router.get("/:id/categories", requireAuth, requireRestaurantAccess("id"), menuController.getCategories);
router.post("/:id/categories", requireAuth, requireRestaurantAccess("id"), requirePermission("menu"), menuController.createCategory);
router.delete("/:id/categories/:categoryId", requireAuth, requireRestaurantAccess("id"), requirePermission("menu"), menuController.deleteCategory);

// Menu Items
router.get("/:id/menu", requireAuth, requireRestaurantAccess("id"), menuController.getMenuItems);
router.post("/:id/menu", requireAuth, requireRestaurantAccess("id"), requirePermission("menu"), menuController.createMenuItem);
router.put("/:id/menu/:itemId", requireAuth, requireRestaurantAccess("id"), requirePermission("menu"), menuController.updateMenuItem);
router.patch("/:id/menu/:itemId/stock", requireAuth, requireRestaurantAccess("id"), requirePermission("menu"), menuController.toggleItemStock);
router.delete("/:id/menu/:itemId", requireAuth, requireRestaurantAccess("id"), requirePermission("menu"), menuController.deleteMenuItem);

module.exports = router;
