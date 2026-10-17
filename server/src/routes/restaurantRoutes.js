const express = require("express");
const router = express.Router();
const restaurantController = require("../controllers/restaurantController");
const { requireAuth, requireRestaurantAccess, requirePermission } = require("../middleware/auth");

router.get("/:id", requireAuth, requireRestaurantAccess("id"), restaurantController.getRestaurantById);
router.put("/:id", requireAuth, requireRestaurantAccess("id"), requirePermission("all"), restaurantController.updateRestaurantProfile);
router.get("/:id/qr-settings", requireAuth, requireRestaurantAccess("id"), restaurantController.getQrSettings);
router.put("/:id/qr-settings", requireAuth, requireRestaurantAccess("id"), requirePermission("all"), restaurantController.updateQrSettings);

module.exports = router;
