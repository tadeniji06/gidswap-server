const express = require("express");
const router = express.Router();

router.post("/paycrest", express.json(), (req, res) => {
	const event = req.body;

	console.log("Paycrest webhook received:", event);

	switch (event.event) {
		case "order.initiated":
			// e.g. save order to DB with "pending" status
			break;
		case "order.fulfilled":
			// update DB with fulfilled status
			break;
		case "order.settled":
			// mark transaction as settled in DB
			break;
		case "order.refunded":
			// mark as refunded in DB
			break;
		default:
			console.log("Unhandled event type:", event.event);
	}

	// Always respond quickly
	res.status(200).json({ received: true });
});

module.exports = router;
