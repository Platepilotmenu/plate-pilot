const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { requireAppOwner } = require("../middleware/auth");

// All admin routes strictly enforce Plate Pilot App Owner access
router.use(requireAppOwner);

router.get("/metrics", adminController.getSaaSMetrics);
router.get("/restaurants", adminController.getAllRestaurants);
router.post("/restaurants", adminController.onboardRestaurant);
router.put("/restaurants/:id", adminController.updateRestaurant);
router.patch("/restaurants/:id/status", adminController.toggleRestaurantStatus);
router.delete("/restaurants/:id", adminController.deleteRestaurant);
router.post("/impersonate/:id", adminController.impersonateOwner);

module.exports = router;
