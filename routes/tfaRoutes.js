const express = require("express");
const router = express.Router();
const tfaControllers = require("../controllers/tfaControllers");
const authMiddleware = require("../middlewares/authMiddlewares");

// All 2FA routes require authentication
router.use(authMiddleware);

router.get("/status", tfaControllers.checkTFAStatus);
router.post("/setup", tfaControllers.setupTFA);
router.post("/verify", tfaControllers.verifyTFA);
router.post("/disable", tfaControllers.disableTFA);

module.exports = router;
