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

const router = express.Router();

/**
 * Init Paycrest order + save transaction immediately
 */
router.post("/init-order", authMiddleware, async (req, res) => {
	try {
		// 1. Call Paycrest API
		const result = await initOrder(req.body);

		// 2. Extract order data from Paycrest response
		const orderData = result?.data;
		if (!orderData?.id) {
			return res.status(400).json({
				success: false,
				message: "Invalid response from Paycrest",
				result,
			});
		}

		// 3. Save transaction in DB with "pending" status
		const txn = new Transaction({
			orderId: orderData.id,
			user: req.user._id,
			status: "pending",
			amount: orderData.amount,
			currency: orderData.currency,
		});

		await txn.save();

		// 4. Return combined response
		res.status(201).json({
			success: true,
			message: "Order initiated successfully",
			transaction: txn,
			paycrestResponse: result,
		});
	} catch (error) {
		console.error("Init order error:", error);
		res.status(500).json({ error: "Internal Server Error" });
	}
});

router.get("/getSupportedCies", async (req, res) => {
	try {
		const result = await getSupportedCurrencies();
		res.json(result);
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Internal Server Error" });
	}
});

router.get("/getSupportedTokens", async (req, res) => {
	try {
		const result = await getSupportedTokens();
		res.json(result);
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Internal Server Error" });
	}
});

// use currency_code param
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

// use all params
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
