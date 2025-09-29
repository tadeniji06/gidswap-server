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
		case "pending":
			return "pending";
		case "validated":
			return "validated"; // funds sent to recipient
		case "settled":
		case "success":
		case "completed":
			return "settled"; // treat all as settled
		case "refunded":
			return "refunded";
		case "expired":
			return "expired";
		case "failed":
			return "failed";
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

/**
 * Get supported currencies
 */
router.get("/getSupportedCies", async (req, res) => {
	try {
		const result = await getSupportedCurrencies();
		res.json(result);
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Internal Server Error" });
	}
});

/**
 * Get supported tokens
 */
router.get("/getSupportedTokens", async (req, res) => {
	try {
		const result = await getSupportedTokens();
		res.json(result);
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Internal Server Error" });
	}
});

/**
 * Get supported banks for a currency
 */
router.get("/supportedBanks/:currency_code", async (req, res) => {
	try {
		const { currency_code } = req.params;
		const result = await getSupportedBanks(currency_code);
		res.json(result);
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Internal Server Error" });
	}
});

/**
 * Get token rate
 */
router.get("/tokenRates/:token/:amount/:fiat", async (req, res) => {
	try {
		const { token, amount, fiat } = req.params;
		const result = await getTokenRate({ token, amount, fiat });
		res.json(result);
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Server Error" });
	}
});

/**
 * Verify account
 */
router.post("/verifyAccount", async (req, res) => {
	try {
		const result = await verifyAccount(req.body);
		res.json(result);
	} catch (error) {
		console.error(error);
		res.status(500).json({ error });
	}
});

module.exports = router;
