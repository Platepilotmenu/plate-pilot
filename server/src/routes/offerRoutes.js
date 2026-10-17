const express = require("express");
const router = express.Router();
const offerController = require("../controllers/offerController");
const { requireAuth, requireRestaurantAccess, requirePermission } = require("../middleware/auth");

router.get("/:id/offers", requireAuth, requireRestaurantAccess("id"), offerController.getOffers);
router.post("/:id/offers", requireAuth, requireRestaurantAccess("id"), requirePermission("all"), offerController.createOffer);
router.put("/:id/offers/:offerId", requireAuth, requireRestaurantAccess("id"), requirePermission("all"), offerController.updateOffer);
router.delete("/:id/offers/:offerId", requireAuth, requireRestaurantAccess("id"), requirePermission("all"), offerController.deleteOffer);
router.post("/:id/offers/validate", requireAuth, requireRestaurantAccess("id"), offerController.validateOffer);

module.exports = router;
