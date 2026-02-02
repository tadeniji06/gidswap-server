const express = require("express");
const authMiddleware = require("../middlewares/authMiddlewares");
const rewardsController = require("../controllers/rewardsController");

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * @route   POST /api/rewards/recalculate
 * @desc    Recalculate user's points from all successful transactions
 * @access  Private
 */
router.post("/recalculate", rewardsController.recalculateUserPoints);

/**
 * @route   GET /api/rewards/summary
 * @desc    Get user's reward points summary
 * @access  Private
 */
router.get("/summary", rewardsController.getRewardsSummary);

/**
 * @route   GET /api/rewards/history
 * @desc    Get user's reward transaction history (paginated)
 * @access  Private
 */
router.get("/history", rewardsController.getRewardHistory);

/**
 * @route   POST /api/rewards/withdraw
 * @desc    Request withdrawal of points (min 5000 points = 5000 Naira)
 * @access  Private
 */
router.post("/withdraw", rewardsController.requestWithdrawal);

/**
 * @route   GET /api/rewards/withdrawals
 * @desc    Get user's withdrawal history
 * @access  Private
 */
router.get("/withdrawals", rewardsController.getWithdrawalHistory);

/**
 * @route   PATCH /api/rewards/withdrawals/:withdrawalId
 * @desc    Update withdrawal status (Admin only - you can add admin middleware later)
 * @access  Private/Admin
 */
router.patch(
	"/withdrawals/:withdrawalId",
	rewardsController.updateWithdrawalStatus,
);

module.exports = router;
