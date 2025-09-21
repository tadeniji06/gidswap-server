const express = require("express");
const bodyParser = require("body-parser");
const router = express.Router();

// Parse JSON and urlencoded (covers both cases)
router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));

router.post("/paycrest", (req, res) => {
	const event = req.body;

	console.log("Webhook headers:", req.headers);
	console.log("Webhook raw body received:", req.body);

	if (!event || !event.event) {
		console.error("Invalid webhook payload:", req.body);
		return res.status(400).json({ error: "Invalid payload" });
	}

	switch (event.event) {
		case "order.initiated":
			console.log(`Order initiated: ${event.orderId}`);
			break;
		case "order.fulfilled":
			console.log(`Order fulfilled: ${event.orderId}`);
			break;
		case "order.settled":
			console.log(`Order settled: ${event.orderId}`);
			break;
		case "order.refunded":
			console.log(`Order refunded: ${event.orderId}`);
			break;
		default:
			console.log("Unhandled event type:", event.event);
	}

	res.status(200).json({ received: true });
});

module.exports = router;
