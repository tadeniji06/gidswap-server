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
	process.env.PAY_CREST_API?.replace(/\/+$/, "").replace("/v1", "/v2") ||
	"https://api.paycrest.io/v2";

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
 * Init Paycrest onramp order (fiat -> crypto)
 * POST /api/payCrest/trade/init-onramp
 */
router.post("/init-onramp", authMiddleware, async (req, res) => {
	try {
		console.log("🚀 Initializing ONRAMP order for user:", req.user._id);
		console.log(
			"📩 Payload received:",
			JSON.stringify(req.body, null, 2),
		);

		// The payload for onramp expects source.type = "fiat" and destination.type = "crypto"
		// We'll just pass it down to `initOrder` since Paycrest uses the same `/v2/sender/orders` endpoint
		const payload = req.body;

		// Call Paycrest API via controller
		const result = await initOrder(payload);
		const orderData = result?.data;

		console.log("📦 Paycrest onramp response:", orderData);

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
			orderId: orderData.id, 
			user: req.user._id,
			status: "pending",
			direction: "onramp",
			// Prefer the calculated crypto amount from Paycrest
			amount: orderData.amount || payload.amount, 
			currency: payload.destination?.currency || orderData.destination?.currency, 
			fiatAmount: payload.amount, // Optional: tracking the original fiat paid
			fiatCurrency: payload.source?.currency || "NGN",
			network: payload.destination?.recipient?.network || orderData.destination?.recipient?.network,
			receiveAddress: null, // No receive address for onramp (user gets fiat instructions)
			reference: req.body.reference,
			validUntil: orderData.providerAccount?.validUntil || orderData.validUntil,
			paycrestData: orderData, // Store full Paycrest response (contains providerAccount fiat transfer instructions)
		});

		await txn.save();
		console.log("✅ Onramp transaction saved:", txn._id);

		return res.status(201).json({
			success: true,
			message: "Onramp order initiated successfully",
			transaction: txn,
			paycrestResponse: result,
		});
	} catch (error) {
		console.error(
			"❌ Init onramp order error:",
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
 * Get (and live-refresh) transaction status
 * GET /api/payCrest/trade/status/:orderId
 *
 * This is polled by the frontend every 3 seconds.
 * On each call it:
 *   1. Finds the transaction in DB
 *   2. If not yet completed, queries PayCrest directly for the latest status
 *   3. Updates DB if status changed
 *   4. Returns the merged result
 *
 * Treats `validated` as the completion signal — user has received their fiat.
 * No need to wait for `settled`.
 */
router.get("/status/:orderId", authMiddleware, async (req, res) => {
	try {
		const { orderId } = req.params;
		const userId = req.user._id;

		console.log(`📊 [Status] Poll for orderId: ${orderId}, user: ${userId}`);

		// ── Step 1: Find local transaction ──────────────────────────
		const txn = await Transaction.findOne({ orderId, user: userId }).exec();

		if (!txn) {
			return res.status(404).json({ success: false, message: "Transaction not found" });
		}

		// ── Step 2: For terminal statuses, return from DB directly ──
		// validated/fulfilled/settled/cancelled/refunded = no need to keep polling PayCrest
		const TERMINAL_STATUSES = ["validated", "fulfilled", "settled", "cancelled", "refunded", "expired", "failed"];

		if (!TERMINAL_STATUSES.includes(txn.status)) {
			// ── Step 3: Live-query PayCrest ─────────────────────────
			try {
				const pcUrl = `${PAYCREST_BASE}/sender/orders/${encodeURIComponent(orderId)}`;
				const pcRes = await axios.get(pcUrl, {
					headers: { "API-Key": process.env.PAY_CREST_API_KEY, Accept: "application/json" },
					validateStatus: null,
					timeout: 8000,
				});

				if (pcRes.status === 200) {
					const pcOrder = pcRes.data;
					const rawStatus =
						pcOrder?.data?.status ||
						pcOrder?.status ||
						pcOrder?.data?.event ||
						pcOrder?.event;

					if (rawStatus) {
						const mapped = mapPaycrestStatus(rawStatus);
						if (mapped && mapped !== txn.status) {
							console.log(`🔄 [Status] ${orderId}: ${txn.status} → ${mapped} (PayCrest: ${rawStatus})`);
							txn.status = mapped;
							txn.lastPolledAt = new Date();
							txn.lastPaycrestResponse = pcOrder;
							await txn.save();
						}
					}
				}
			} catch (pcErr) {
				// Non-fatal — return DB value if PayCrest is temporarily unreachable
				console.warn(`⚠️ [Status] PayCrest poll failed for ${orderId}:`, pcErr.message);
			}
		}

		// ── Step 4: Derive a client-facing "isCompleted" flag ───────
		// validated = user has received fiat. settled = blockchain settlement.
		// Both mean "done" from the user's perspective.
		const isCompleted = ["validated", "fulfilled", "settled"].includes(txn.status);

		// ── Step 5: Return unified response ─────────────────────────
		return res.status(200).json({
			id: txn.orderId,
			reference: txn.reference || txn.orderId,
			amount: txn.amount?.toString() || "0",
			fiatAmount: txn.paycrestData?.providerAccount?.amountToTransfer || txn.amount, // Helpful for UI to have both
			token: txn.currency || "",
			network: txn.network || "",
			receiveAddress: txn.receiveAddress || "",
			providerAccount: txn.paycrestData?.providerAccount, // Expose for Onramp transfer instructions
			senderFee: "0",
			transactionFee: "0",
			validUntil: txn.validUntil || "",
			status: txn.status,
			isCompleted,           // 🎯 true once validated/fulfilled/settled
			updatedAt: txn.updatedAt,
		});
	} catch (error) {
		console.error("❌ [Status] Error:", error);
		return res.status(500).json({ success: false, message: "Failed to fetch status", error: error.message });
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
					providerAccount: txn.paycrestData?.providerAccount,
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
 * Get token rate (legacy without network)
 * GET /api/payCrest/trade/tokenRates/:token/:amount/:fiat
 */
router.get("/tokenRates/:token/:amount/:fiat", async (req, res) => {
	try {
		const { token, amount, fiat } = req.params;
		const side = req.query.side || "buy";
		const result = await getTokenRate({ token, amount, fiat, side });
		res.json(result);
	} catch (error) {
		console.error("❌ Get rate error:", error.response?.data || error.message);
		const status = error.response?.status || 500;
		const data = error.response?.data || { error: "Server Error" };
		res.status(status).json(data);
	}
});

/**
 * Get token rate (v2 with network)
 * GET /api/payCrest/trade/tokenRates/:network/:token/:amount/:fiat
 */
router.get("/tokenRates/:network/:token/:amount/:fiat", async (req, res) => {
	try {
		const { network, token, amount, fiat } = req.params;
		const side = req.query.side || "buy";
		const result = await getTokenRate({ network, token, amount, fiat, side });
		res.json(result);
	} catch (error) {
		console.error("❌ Get rate error:", error.response?.data || error.message);
		const status = error.response?.status || 500;
		const data = error.response?.data || { error: "Server Error" };
		res.status(status).json(data);
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
		console.error("❌ Verify account error:", error.response?.data || error.message);
		const status = error.response?.status || 500;
		const data = error.response?.data || { error: "Server Error" };
		res.status(status).json(data);
	}
});

const crypto = require("crypto");

/**
 * Handle Paycrest webhooks
 * POST /api/payCrest/trade/webhook
 */
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
	const signature = req.headers["x-paycrest-signature"];
	const secret = process.env.PAY_CREST_SECRET;

	if (!signature || !secret) {
		console.warn("⚠️ Webhook missing signature or secret");
		return res.status(401).send("Unauthorized");
	}

	const computed = crypto
		.createHmac("sha256", secret)
		.update(req.body)
		.digest("hex");

	const isValid = crypto.timingSafeEqual(
		Buffer.from(computed),
		Buffer.from(signature)
	);

	if (!isValid) {
		console.error("❌ Invalid webhook signature");
		return res.status(401).send("Invalid signature");
	}

	try {
		const { event, data } = JSON.parse(req.body.toString());
		console.log(`🔔 Webhook received: ${event} for order ${data.id}`);

		// Find and update the transaction
		const txn = await Transaction.findOne({ orderId: data.id });
		if (txn) {
			const newStatus = mapPaycrestStatus(data.status);
			if (newStatus && newStatus !== txn.status) {
				console.log(`🔄 [Webhook] Update ${data.id}: ${txn.status} → ${newStatus}`);
				txn.status = newStatus;
				txn.lastPolledAt = new Date();
				txn.lastPaycrestResponse = data;
				await txn.save();
			}
		}

		res.sendStatus(200);
	} catch (error) {
		console.error("❌ Webhook processing error:", error);
		res.status(500).send("Error processing webhook");
	}
});

module.exports = router;
