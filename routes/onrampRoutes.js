const express = require("express");
const authMiddleware = require("../middlewares/authMiddlewares");
const {
	initiateOnramp,
	getOnrampStatus,
	getOnrampHistory,
	getOnrampRate,
	continueToFiat,
} = require("../controllers/onrampController");

const router = express.Router();

/**
 * @route   GET /api/onramp/rate
 * @desc    Get estimated NGN payout for a given crypto amount (pre-initiation quote)
 * @access  Public (no auth needed for rate check)
 * @query   fromCurrency, fromAmount, toStable (optional)
 */
router.get("/rate", getOnrampRate);

// All routes below require authentication
router.use(authMiddleware);

/**
 * @route   POST /api/onramp/initiate
 * @desc    Initiate full Crypto → Stables → Fiat pipeline
 * @access  Private
 * @body    { fromCurrency, fromNetwork, toStable?, fromAmount, payoutDetails: { walletAddress, bankCode, accountNumber, ...} }
 */
router.post("/initiate", initiateOnramp);

/**
 * @route   POST /api/onramp/continue-to-fiat
 * @desc    Confirm receipt of stables and initiate PayCrest fiat payout
 * @access  Private
 * @body    { sessionId }
 */
router.post("/continue-to-fiat", continueToFiat);

/**
 * @route   GET /api/onramp/status/:sessionId
 * @desc    Poll pipeline status for a given session
 * @access  Private
 */
router.get("/status/:sessionId", getOnrampStatus);

/**
 * @route   GET /api/onramp/history
 * @desc    Get user's onramp session history
 * @access  Private
 * @query   page, limit
 */
router.get("/history", getOnrampHistory);

module.exports = router;
