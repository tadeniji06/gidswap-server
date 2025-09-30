const express = require("express");
const crypto = require("crypto");
const Transaction = require("../models/Transactions");

const router = express.Router();

// Verify PayCrest HMAC signature
function verifySignature(rawBody, signature, secret) {
	const expected = crypto
		.createHmac("sha256", secret)
		.update(rawBody)
		.digest("hex");

	return expected === signature;
}

const mapEventToStatus = (evt) => {
	switch (evt) {
		case "payment_order.pending":
			return "pending";
		case "payment_order.processing":
			return "processing";
		case "payment_order.fulfilled":
			return "fulfilled";
		case "payment_order.validated":
			return "validated";
		case "payment_order.settled":
			return "settled";
		case "payment_order.cancelled":
			return "cancelled";
		case "payment_order.refunded":
			return "refunded";
		case "payment_order.expired":
			return "expired";
		case "payment_order.failed":
			return "failed";
		case "payment_order.completed":
			return "fulfilled"; 
		default:
			return "pending";
	}
};

// Webhook endpoint
router.post("/paycrest", async (req, res) => {
	try {
		const signature = req.get("X-Paycrest-Signature");
		if (!signature) {
			return res.status(401).json({ error: "Missing signature" });
		}

		const rawBody = req.body.toString("utf8");
		const body = JSON.parse(rawBody);

		if (
			!verifySignature(
				rawBody,
				signature,
				process.env.PAY_CREST_API_SECRET
			)
		) {
			return res.status(401).json({ error: "Invalid signature" });
		}

		const { data, event } = body;
		console.log("Webhook received:", event, data);

		let txn = await Transaction.findOne({ orderId: data.id });
		if (!txn) {
			console.warn("Webhook for unknown transaction:", data.id);
			return res.status(404).json({ error: "Transaction not found" });
		}

		txn.status = mapEventToStatus(event);
		await txn.save();

		res.status(200).json({ success: true });
	} catch (err) {
		console.error("Webhook error:", err);
		res.status(500).json({ error: "Server error" });
	}
});

module.exports = router;
