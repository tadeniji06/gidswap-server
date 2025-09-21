const express = require("express");
const router = express.Router();

router.post("/paycrest", (req, res) => {
	const event = req.body;

	console.log("Paycrest webhook raw body:", req.body);

	if (!event || !event.event) {
		console.error("Invalid webhook payload:", req.body);
		return res.status(400).json({ error: "Invalid payload" });
	}

	switch (event.event) {
		case "order.initiated":
			// e.g. save order to DB with "pending" status
			console.log(`Order initiated: ${event.orderId}`);
			break;
		case "order.fulfilled":
			// update DB with fulfilled status
			console.log(`Order fulfilled: ${event.orderId}`);
			break;
		case "order.settled":
			// mark transaction as settled in DB
			console.log(`Order settled: ${event.orderId}`);
			break;
		case "order.refunded":
			// mark as refunded in DB
			console.log(`Order refunded: ${event.orderId}`);
			break;
		default:
			console.log("Unhandled event type:", event.event);
	}

	// Always acknowledge quickly
	res.status(200).json({ received: true });
});

module.exports = router;
