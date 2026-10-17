const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const { requireAuth, requireRestaurantAccess, requirePermission } = require("../middleware/auth");

router.get("/:id/orders", requireAuth, requireRestaurantAccess("id"), orderController.getOrders);
router.post("/:id/orders", requireAuth, requireRestaurantAccess("id"), requirePermission("pos"), orderController.createOrder);
router.get("/:id/orders/:orderId", requireAuth, requireRestaurantAccess("id"), orderController.getOrderById);
router.patch("/:id/orders/:orderId/status", requireAuth, requireRestaurantAccess("id"), requirePermission("pos"), orderController.updateOrderStatus);
router.get("/:id/dashboard-metrics", requireAuth, requireRestaurantAccess("id"), orderController.getDashboardMetrics);

module.exports = router;
