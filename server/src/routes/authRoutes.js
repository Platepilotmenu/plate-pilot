const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");

router.post("/login", authController.login);
router.post("/pin", authController.pinLogin);
router.get("/me", requireAuth, authController.getCurrentUser);

module.exports = router;
