const express = require("express");
const router = express.Router();
const qrController = require("../controllers/qrController");

// Public Customer QR Endpoints (No Auth Required)
router.get("/:restId/table/:tableNum", qrController.getTableQrMenu);
router.post("/:restId/order", qrController.placeCustomerQrOrder);
router.get("/order/:orderId", qrController.trackOrderStatus);

module.exports = router;
