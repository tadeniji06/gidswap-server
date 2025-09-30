const express = require("express");
const {
	initOrder,
	getSupportedCurrencies,
	getSupportedBanks,
	getSupportedTokens,
	getTokenRate,
	verifyAccount,
} = require("../controllers/payCrestControllers");
const Transaction = require("../models/Transactions");
const authMiddleware = require("../middlewares/authMiddlewares");
const axios = require("axios");

const router = express.Router();

/**
 * Normalize Paycrest statuses → DB enum values
 */
const normalizeStatus = (status) => {
	switch (status) {
		case "payment_order.pending":
			return "pending";
		case "payment_order.validated":
			return "validated";
		case "payment_order.settled":
			return "settled";
		case "payment_order.refunded":
			return "refunded";
		case "payment_order.expired":
			return "expired";
		default:
			return "pending"; // fallback
	}
};

/**
 * Init Paycrest order + save transaction immediately
 */
router.post("/init-order", authMiddleware, async (req, res) => {
	try {
		const result = await initOrder(req.body);
		const orderData = result?.data;

		if (!orderData?.id) {
			return res.status(400).json({
				success: false,
				message: "Invalid response from Paycrest",
				result,
			});
		}

		const txn = new Transaction({
			orderId: orderData.id,
			user: req.user._id,
			status: "pending",
			amount: orderData.amount,
			currency: orderData.currency,
		});

		await txn.save();

		res.status(201).json({
			success: true,
			message: "Order initiated successfully",
			transaction: txn,
			paycrestResponse: result,
		});
	} catch (error) {
		console.error("Init order error:", error);
		res.status(500).json({ error: "Internal Server Error" });
	}
});

/**
 * Poll order status from Paycrest + update DB
 */
router.get("/status/:orderId", authMiddleware, async (req, res) => {
	try {
		const { orderId } = req.params;

		let txn = await Transaction.findOne({
			orderId,
			user: req.user._id,
		});
		if (!txn) {
			return res.status(404).json({
				success: false,
				message: "Transaction not found",
			});
		}

		const paycrestRes = await axios.get(
			`${process.env.PAY_CREST_API}/sender/orders/${orderId}`,
			{
				headers: {
					"API-Key": process.env.PAY_CREST_API_KEY,
					Accept: "application/json",
				},
			}
		);

		const order = paycrestRes.data;
		const newStatus = normalizeStatus(order.status);

		if (txn.status !== newStatus) {
			txn.status = newStatus;
			await txn.save();
		}

		return res.json({
			success: true,
			transaction: txn,
			paycrestResponse: order,
		});
	} catch (error) {
		console.error(
			"Polling error:",
			error.response?.data || error.message
		);
		return res.status(500).json({ error: "Failed to poll status" });
	}
});

module.exports = router;
