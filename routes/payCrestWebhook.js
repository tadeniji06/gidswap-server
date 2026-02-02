const express = require("express");
const Transaction = require("../models/Transactions");
const {
	verifyPaycrestSignature,
} = require("../utils/paycrestSignature");
const { mapPaycrestStatus } = require("../utils/mapPaycrestStatus");
const {
	awardPointsForTransaction,
} = require("../utils/rewardsHelper");

const router = express.Router();

/**
 * Paycrest Webhook Handler
 * Mounted at /api/webhooks/paycrest
 */
router.post("/paycrest", async (req, res) => {
	try {
		console.log("🔔 Webhook received at:", new Date().toISOString());

		// 1. Get signature header (try both cases)
		const signature =
			req.get("X-Paycrest-Signature") ||
			req.get("x-paycrest-signature");

		if (!signature) {
			console.warn("❌ Webhook missing signature header");
			return res.status(401).json({ error: "Missing signature" });
		}

		// 2. Verify raw body is buffer
		const rawBody = req.body;
		if (!Buffer.isBuffer(rawBody)) {
			console.warn("❌ Webhook rawBody not buffer:", typeof rawBody);
			return res
				.status(400)
				.json({ error: "Invalid webhook body type" });
		}

		// 3. Verify signature
		const secret = process.env.PAY_CREST_API_SECRET;
		if (!secret) {
			console.error("❌ Missing PAY_CREST_API_SECRET in env");
			return res
				.status(500)
				.json({ error: "Server configuration error" });
		}

		const valid = verifyPaycrestSignature(rawBody, signature, secret);
		if (!valid) {
			console.warn("❌ Webhook signature verification FAILED");
			console.log("Received signature:", signature);
			console.log(
				"Body (first 100 chars):",
				rawBody.toString("utf8").substring(0, 100),
			);
			return res.status(401).json({ error: "Invalid signature" });
		}

		console.log("✅ Signature verified!");

		// 4. Parse payload
		const payload = JSON.parse(rawBody.toString("utf8"));
		const { event, data } = payload || {};
		const orderId = data?.id;

		console.log("📦 Webhook payload:", {
			event,
			orderId,
			rawStatus: data?.status,
		});

		if (!orderId) {
			console.warn("❌ Missing order ID in webhook payload");
			return res
				.status(400)
				.json({ error: "Missing order id in webhook" });
		}

		// 5. Find transaction by orderId
		let txn = await Transaction.findOne({ orderId }).exec();

		if (!txn) {
			console.warn(
				`⚠️ Transaction not found for orderId: ${orderId}`,
			);
			return res.status(404).json({ error: "Transaction not found" });
		}

		console.log(
			`📝 Found transaction: ${txn._id}, current status: ${txn.status}`,
		);

		// 6. Map Paycrest status to our DB status
		// Use the status from data.status OR fallback to event name
		const paycrestStatus = data?.status || event;
		const mappedStatus = mapPaycrestStatus(paycrestStatus);

		console.log(
			`🔄 Status mapping: "${paycrestStatus}" -> "${mappedStatus}"`,
		);

		// 7. Update transaction if status changed
		if (txn.status !== mappedStatus) {
			txn.status = mappedStatus;
			console.log(
				`✏️ Updated status from "${txn.status}" to "${mappedStatus}"`,
			);
		}

		// 8. Store webhook data for debugging
		txn.lastWebhook = {
			receivedAt: new Date(),
			raw: payload,
		};

		await txn.save();

		console.log(
			`✅ Transaction ${txn._id} saved with status: ${txn.status}`,
		);

		// 10. Auto-award points for successful transactions
		if (
			["fulfilled", "validated", "settled"].includes(mappedStatus)
		) {
			console.log(
				`🎁 Attempting to award points for transaction ${txn._id}`,
			);
			const rewardResult = await awardPointsForTransaction(
				txn.user,
				txn._id,
				txn.amount,
			);
			if (rewardResult.success) {
				console.log(
					`✅ ${rewardResult.message}: ${rewardResult.points} points`,
				);
			} else {
				console.log(`ℹ️ ${rewardResult.message}`);
			}
		}

		// 11. Send success response (ONLY ONCE!)
		return res.status(200).json({
			success: true,
			transactionId: txn._id,
			status: txn.status,
		});
	} catch (err) {
		console.error("❌ Webhook handler error:", err.message);
		console.error(err.stack);
		return res.status(500).json({ error: "Internal server error" });
	}
});

module.exports = router;
