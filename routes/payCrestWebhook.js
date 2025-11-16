const express = require("express");
const Transaction = require("../models/Transactions"); // make sure file name matches
const {
	verifyPaycrestSignature,
} = require("../utils/paycrestSignature");
const { mapPaycrestStatus } = require("../utils/mapPaycrestStatus");

const router = express.Router();

/**
 * Paycrest Webhook Handler
 * NOTE: This route must be mounted at the same path where express.raw middleware is applied in app.js
 */
router.post("/paycrest", async (req, res) => {
	try {
		// 1. Grab signature header
		const signature =
			req.get("X-Paycrest-Signature") ||
			req.get("x-paycrest-signature");
		if (!signature) {
			console.warn("Webhook missing signature header");
			return res.status(401).json({ error: "Missing signature" });
		}

		// 2. Ensure raw body is buffer
		const rawBody = req.body;
		if (!Buffer.isBuffer(rawBody)) {
			console.warn("Webhook rawBody not buffer:", typeof rawBody);
			return res
				.status(400)
				.json({ error: "Invalid webhook body type" });
		}

		// 3. Verify signature
		const secret = process.env.PAY_CREST_API_SECRET;
		if (!secret) {
			console.error("Missing PAY_CREST_API_SECRET in env");
			return res
				.status(500)
				.json({ error: "Server configuration error" });
		}

		const valid = verifyPaycrestSignature(rawBody, signature, secret);
		if (!valid) {
			console.warn("Webhook signature verification failed");
			return res.status(401).json({ error: "Invalid signature" });
		}

		// 4. Parse payload
		const payload = JSON.parse(rawBody.toString("utf8"));
		const { event, data } = payload || {};
		const orderId = data?.id;

		console.log("✅ Paycrest webhook:", {
			event,
			orderId,
			status: data?.status,
		});

		if (!orderId) {
			return res
				.status(400)
				.json({ error: "Missing order id in webhook" });
		}

		// 5. Locate transaction
		let txn = await Transaction.findOne({ orderId }).exec();
		if (!txn) {
			// fallback: try with external id if you ever stored differently
			txn = await Transaction.findOne({
				externalOrderId: orderId,
			}).exec();
		}

		if (!txn) {
			console.warn("⚠️ Webhook for unknown transaction:", orderId);
			return res.status(404).json({ error: "Transaction not found" });
		}

		// 6. Map status
		const mappedStatus = mapPaycrestStatus(data?.status || event);

		// Update only if different (avoid spam writes)
		if (txn.status !== mappedStatus) {
			txn.status = mappedStatus;
		}

		// Save raw webhook for auditing/debug
		txn.lastWebhook = {
			receivedAt: new Date(),
			raw: payload,
		};

		await txn.save();

		console.log(
			`✅ Transaction ${txn._id} updated -> ${mappedStatus}`
		);

		return res.status(200).json({ success: true });
	} catch (err) {
		console.error("❌ Webhook handler error:", err.message || err);
		return res.status(500).json({ error: "Server error" });
	}
});

module.exports = router;
