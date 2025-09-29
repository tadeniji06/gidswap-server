const express = require("express");
const authMiddleware = require("../middlewares/authMiddlewares");
const Transaction = require("../models/Transactions");

const router = express.Router();

router.get("/", authMiddleware, async (req, res) => {
	try {
		const txns = await Transaction.find({ user: req.user._id }).sort({
			createdAt: -1,
		});
		res.json({ success: true, transactions: txns });
	} catch (error) {
		console.error("Fetch transactions error:", error);
		res.status(500).json({ success: false, error: error.message });
	}
});

module.exports = router;
