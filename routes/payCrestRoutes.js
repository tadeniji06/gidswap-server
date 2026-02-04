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
 * POST /api/payCrest/trade/init-order
 */
router.post("/init-order", authMiddleware, async (req, res) => {
	try {
		console.log("🚀 Initializing order for user:", req.user._id);
		console.log(
			"📩 Payload received:",
			JSON.stringify(req.body, null, 2),
		);

		// Normalize payload: ensure token is uppercase
		const payload = {
			...req.body,
			token: req.body.token
				? req.body.token.toUpperCase()
				: undefined,
		};

		// Call Paycrest API via controller
		const result = await initOrder(payload);
		const orderData = result?.data;

		console.log("📦 Paycrest response:", orderData);

		if (!orderData?.id) {
			console.error("❌ Invalid Paycrest response:", result);
			return res.status(400).json({
				success: false,
				message: "Invalid response from Paycrest",
				result,
			});
		}

		// Save transaction to database
		const txn = new Transaction({
			orderId: orderData.id, // Paycrest order ID
			user: req.user._id,
			status: "pending",
			amount: payload.amount || orderData.amount,
			currency: payload.token || orderData.token,
			network: req.body.network,
			receiveAddress: orderData.receiveAddress,
			reference: req.body.reference,
			validUntil: orderData.validUntil,
			paycrestData: orderData, // Store full Paycrest response
		});

		await txn.save();
		console.log("✅ Transaction saved:", txn._id);

		return res.status(201).json({
			success: true,
			message: "Order initiated successfully",
			transaction: txn,
			paycrestResponse: result,
		});
	} catch (error) {
		console.error(
			"❌ Init order error:",
			error.response?.data || error.message || error,
		);
		return res.status(500).json({
			success: false,
			error: "Internal Server Error",
			details: error.response?.data || error.message,
		});
	}
});

/**
 * Get transaction status from YOUR database (for frontend polling)
 * GET /api/payCrest/trade/status/:orderId
 * 🔥 This is what the frontend polls every 3 seconds!
 */
router.get("/status/:orderId", authMiddleware, async (req, res) => {
	try {
		const { orderId } = req.params;
		const userId = req.user._id;

		console.log(
			`📊 Status check for orderId: ${orderId}, user: ${userId}`,
		);

		// Find transaction
		const txn = await Transaction.findOne({
			orderId,
			user: userId,
		}).exec();

		if (!txn) {
			console.warn(`⚠️ Transaction not found: ${orderId}`);
			return res.status(404).json({
				success: false,
				message: "Transaction not found",
			});
		}

		console.log(`✅ Transaction found, status: ${txn.status}`);

		// Return in the same format your frontend expects
		return res.status(200).json({
			id: txn.orderId,
			reference: txn.reference || txn.orderId,
			amount: txn.amount?.toString() || "0",
			token: txn.currency || "",
			network: txn.network || "",
			receiveAddress: txn.receiveAddress || "",
			senderFee: "0",
			transactionFee: "0",
			validUntil: txn.validUntil || "",
			status: txn.status, // 🎯 This is the key field!
			updatedAt: txn.updatedAt,
		});
	} catch (error) {
		console.error("❌ Status check error:", error);
		return res.status(500).json({
			success: false,
			message: "Failed to fetch status",
			error: error.message,
		});
	}
});

/**
 * Refresh status by polling Paycrest API directly and updating DB
 * GET /api/payCrest/trade/status/:orderId/refresh
 * Optional: Use this if you want to manually force a refresh
 */
router.get(
	"/status/:orderId/refresh",
	authMiddleware,
	async (req, res) => {
		try {
			const { orderId } = req.params;
			const userId = req.user._id;

			console.log(`🔄 Force refresh for orderId: ${orderId}`);

			// Find transaction
			let txn = await Transaction.findOne({
				orderId,
				user: userId,
			}).exec();

			if (!txn) {
				console.warn(`⚠️ Transaction not found: ${orderId}`);
				return res.status(404).json({
					success: false,
					message: "Transaction not found",
				});
			}

			// Call Paycrest API
			const url = `${PAYCREST_BASE}/sender/orders/${encodeURIComponent(
				orderId,
			)}`;
			console.log("📞 Calling Paycrest:", url);

			const paycrestRes = await axios.get(url, {
				headers: {
					"API-Key": process.env.PAY_CREST_API_KEY,
					Accept: "application/json",
				},
				validateStatus: null,
			});

			if (paycrestRes.status === 404) {
				console.warn(
					"⚠️ Paycrest returned 404 for orderId:",
					orderId,
				);
				return res.status(404).json({
					success: false,
					message: "Order not found at Paycrest",
					paycrestResponse: paycrestRes.data,
				});
			}

			if (paycrestRes.status >= 400) {
				console.error(
					"❌ Paycrest error:",
					paycrestRes.status,
					paycrestRes.data,
				);
				return res.status(500).json({
					success: false,
					message: "Paycrest API returned error",
					paycrestResponse: paycrestRes.data,
				});
			}

			const order = paycrestRes.data;

			// Extract status from various possible locations
			const orderStatusRaw =
				order?.status ||
				order?.data?.status ||
				order?.event ||
				order?.data?.event;

			console.log(`📦 Paycrest returned status: ${orderStatusRaw}`);

			// Map to our DB status
			const mapped = mapPaycrestStatus(orderStatusRaw);
			console.log(`🗺️ Mapped status: ${orderStatusRaw} -> ${mapped}`);

			// Update if changed
			if (txn.status !== mapped) {
				const oldStatus = txn.status;
				txn.status = mapped;
				txn.lastPolledAt = new Date();
				txn.paycrestData = order;
				await txn.save();
				console.log(
					`✏️ Updated txn ${txn._id}: ${oldStatus} -> ${mapped}`,
				);
			} else {
				console.log(`ℹ️ Status unchanged: ${mapped}`);
			}

			return res.json({
				success: true,
				transaction: {
					id: txn.orderId,
					reference: txn.reference || txn.orderId,
					amount: txn.amount?.toString() || "0",
					token: txn.currency || "",
					network: txn.network || "",
					receiveAddress: txn.receiveAddress || "",
					status: txn.status,
					updatedAt: txn.updatedAt,
				},
				paycrestResponse: order,
			});
		} catch (error) {
			console.error(
				"❌ Refresh error:",
				error.response?.data || error.message || error,
			);
			return res.status(500).json({
				success: false,
				error: "Failed to refresh status",
				details: error.response?.data || error.message,
			});
		}
	},
);

/**
 * Get supported currencies
 * GET /api/payCrest/trade/getSupportedCies
 */
router.get("/getSupportedCies", async (req, res) => {
	try {
		const result = await getSupportedCurrencies();
		res.json(result);
	} catch (error) {
		console.error("❌ Get currencies error:", error);
		res.status(500).json({ error: "Internal Server Error" });
	}
});

/**
 * Get supported tokens
 * GET /api/payCrest/trade/getSupportedTokens
 */
router.get("/getSupportedTokens", async (req, res) => {
	try {
		const result = await getSupportedTokens();
		res.json(result);
	} catch (error) {
		console.error("❌ Get tokens error:", error);
		res.status(500).json({ error: "Internal Server Error" });
	}
});

/**
 * Get supported banks for a currency
 * GET /api/payCrest/trade/supportedBanks/:currency_code
 */
router.get("/supportedBanks/:currency_code", async (req, res) => {
	try {
		const { currency_code } = req.params;
		const result = await getSupportedBanks(currency_code);
		res.json(result);
	} catch (error) {
		console.error("❌ Get banks error:", error);
		res.status(500).json({ error: "Internal Server Error" });
	}
});

/**
 * Get token rate
 * GET /api/payCrest/trade/tokenRates/:token/:amount/:fiat
 */
router.get("/tokenRates/:token/:amount/:fiat", async (req, res) => {
	try {
		const { token, amount, fiat } = req.params;
		const result = await getTokenRate({ token, amount, fiat });
		res.json(result);
	} catch (error) {
		console.error("❌ Get rate error:", error);
		res.status(500).json({ error: "Server Error" });
	}
});

/**
 * Verify account
 * POST /api/payCrest/trade/verifyAccount
 */
router.post("/verifyAccount", async (req, res) => {
	try {
		const result = await verifyAccount(req.body);
		res.json(result);
	} catch (error) {
		console.error("❌ Verify account error:", error);
		res.status(500).json({ error: error.message || "Server Error" });
	}
});

module.exports = router;
