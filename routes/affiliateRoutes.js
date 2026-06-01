const express = require("express");
const { getAffiliateStats } = require("../controllers/affiliateControllers");
const authMiddleware = require("../middlewares/authMiddlewares");

const router = express.Router();

router.get("/stats", authMiddleware, getAffiliateStats);

module.exports = router;
