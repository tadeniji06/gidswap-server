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
const { mapPaycrestStatus } = require("../utils/mapPaycrestStatus");
const router = express.Router();

const PAYCREST_BASE =
	process.env.PAY_CREST_API?.replace(/\/+$/, "") ||
	"https://api.paycrest.io/v1";

/**
 * Init Paycrest order + save transaction immediately
 * (Assumes initOrder is implemented in a controller; if not, use axios here)
 */
router.post("/init-order", authMiddleware, async (req, res) => {
	try {
		// you previously used a controller; keep it or inline axios call
		const {
			initOrder,
		} = require("../controllers/payCrestControllers");
		const result = await initOrder(req.body);
		const orderData = result?.data;

		if (!orderData?.id) {
			return res.status(400).json({
				success: false,
				message: "Invalid response from Paycrest",
				result,
			});
		}

		// Save canonical external ID as orderId
		const txn = new Transaction({
			orderId: orderData.id, // external id from paycrest
			user: req.user._id,
			status: "pending",
			amount: orderData.amount,
			currency: orderData.currency,
			meta: orderData, // optionally store raw response
		});

		await txn.save();

		return res.status(201).json({
			success: true,
			message: "Order initiated successfully",
			transaction: txn,
			paycrestResponse: result,
		});
	} catch (error) {
		console.error(
			"Init order error:",
			error.response?.data || error.message || error
		);
		return res.status(500).json({ error: "Internal Server Error" });
	}
});

/**
 * Poll order status from Paycrest + update DB
 * GET /status/:orderId
 */
router.get("/status/:orderId", authMiddleware, async (req, res) => {
	try {
		const { orderId } = req.params;

		// find user transaction first
		let txn = await Transaction.findOne({
			orderId,
			user: req.user._id,
		}).exec();

		// fallback: if not found for this user, try without user (admin / reconciliation)
		if (!txn) {
			console.warn(
				`Transaction not found for user ${req.user._id} and orderId ${orderId}. Trying global lookup...`
			);
			txn = await Transaction.findOne({ orderId }).exec();
			if (!txn) {
				return res.status(404).json({
					success: false,
					message: "Transaction not found",
				});
			}
		}

		// call paycrest
		const url = `${PAYCREST_BASE}/sender/orders/${encodeURIComponent(
			orderId
		)}`;
		console.log("Polling Paycrest URL:", url);

		const paycrestRes = await axios.get(url, {
			headers: {
				"API-Key": process.env.PAY_CREST_API_KEY,
				Accept: "application/json",
			},
			validateStatus: null, // we'll handle 404/500 explicitly
		});

		if (paycrestRes.status === 404) {
			console.warn(
				"Paycrest returned 404 for orderId",
				orderId,
				"response:",
				paycrestRes.data
			);
			// Optionally set txn to a special 'not_found' state, or keep as is and return error to client
			return res.status(404).json({
				success: false,
				message: "Order not found at Paycrest",
				paycrestResponse: paycrestRes.data,
			});
		}

		if (paycrestRes.status >= 400) {
			console.error(
				"Paycrest error:",
				paycrestRes.status,
				paycrestRes.data
			);
			return res.status(500).json({
				success: false,
				message: "Paycrest API returned error",
				paycrestResponse: paycrestRes.data,
			});
		}

		const order = paycrestRes.data;
		// Some APIs wrap data in { data: {...} }
		const orderStatusRaw =
			order?.status ||
			order?.data?.status ||
			order?.event ||
			order?.data?.event;
		const mapped = mapPaycrestStatus(orderStatusRaw);

		if (txn.status !== mapped) {
			txn.status = mapped;
			txn.lastPolledAt = new Date();
			txn.lastPaycrestResponse = order; // optional
			await txn.save();
			console.log(`Updated txn ${txn._id} -> ${mapped}`);
		}

		return res.json({
			success: true,
			transaction: txn,
			paycrestResponse: order,
		});
	} catch (error) {
		console.error(
			"Polling error:",
			error.response?.data || error.message || error
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
