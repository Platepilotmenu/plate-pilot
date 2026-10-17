const express = require("express");
const router = express.Router();
const staffController = require("../controllers/staffController");
const { requireAuth, requireRestaurantAccess, requirePermission } = require("../middleware/auth");

router.get("/:id/staff", requireAuth, requireRestaurantAccess("id"), staffController.getStaff);
router.post("/:id/staff", requireAuth, requireRestaurantAccess("id"), requirePermission("all"), staffController.createStaff);
router.put("/:id/staff/:staffId", requireAuth, requireRestaurantAccess("id"), requirePermission("all"), staffController.updateStaff);
router.delete("/:id/staff/:staffId", requireAuth, requireRestaurantAccess("id"), requirePermission("all"), staffController.deleteStaff);

module.exports = router;
