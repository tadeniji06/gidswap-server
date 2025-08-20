const express = require("express");
const {
	createOrder,
	getRate,
	checkStatus,
	getCurrencies,
} = require("../controllers/fixedFloatController");
const router = express.Router();

router.post("/create-order", async (req, res) => {
	try {
		const result = await createOrder(req.body);
		res.json(result);
	} catch (err) {
		console.error(
			"Create Order Error:",
			err?.response?.data || err.message
		);
		res.status(500).json({
			error: "Failed to create order",
			details: err.response?.data,
		});
	}
});

router.post("/rate", async (req, res) => {
	try {
		const result = await getRate(req.body);
		res.json(result);
	} catch (err) {
		console.error("Rate Error:", err?.response?.data || err.message);
		res.status(500).json({
			error: "Failed to fetch rate",
			details: err.response?.data,
		});
	}
});

// router.get("/status/:id", async (req, res) => {
// 	const { id } = req.params;
// 	if (!id)
// 		return res.status(400).json({ message: "Order ID required" });

// 	try {
// 		const result = await checkStatus(id);
// 		res.json(result);
// 	} catch (err) {
// 		console.error(err);
// 		res.status(500).json({
// 			error: "Failed to get status",
// 			details: err
// 		});
// 	}
// });

router.get("/currencies", async (req, res) => {
	try {
		const result = await getCurrencies();
		res.json(result);
	} catch (err) {
		console.error(
			"Currency List Error:",
			err?.response?.data || err.message
		);
		res.status(500).json({
			error: "Failed to get currencies",
			details: err.response?.data,
		});
	}
});

module.exports = router;
