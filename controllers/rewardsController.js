const User = require("../models/User");
const Transaction = require("../models/Transactions");
const Reward = require("../models/Rewards");

/**
 * Calculate points from transaction amount
 * 1 USD = 1 Point
 */
const calculatePoints = (amountInUSD) => {
	return Math.floor(amountInUSD); // 1 USD = 1 point
};

/**
 * RECALCULATE AND SYNC USER POINTS
 * This function calculates points from ALL successful transactions
 * and updates the user's total reward points
 */
const _syncUserPoints = async (userId) => {
	// Find all successful/fulfilled transactions for this user
	const successfulTransactions = await Transaction.find({
		user: userId,
		status: {
			$in: ["fulfilled", "validated", "settled", "completed"],
		}, // Added 'completed' just in case
	});

	// Calculate total points from all successful transactions
	let totalEarnedPoints = 0;
	const rewardRecords = [];

	for (const transaction of successfulTransactions) {
		// Check if reward already exists for this transaction
		const existingReward = await Reward.findOne({
			user: userId,
			transaction: transaction._id,
			type: "earned",
		});

		if (!existingReward && transaction.amount) {
			const points = calculatePoints(transaction.amount);

			// Only award positive points
			if (points > 0) {
				totalEarnedPoints += points;

				// Create reward record
				// We do this sequentially to avoid race conditions on first sync
				await Reward.create({
					user: userId,
					type: "earned",
					points: points,
					transaction: transaction._id,
					description: `Earned ${points} points from swap of $${transaction.amount}`,
				});
			}
		} else if (existingReward) {
			totalEarnedPoints += existingReward.points;
		}
	}

	// Calculate total withdrawn points
	const withdrawals = await Reward.find({
		user: userId,
		type: "withdrawn",
		"withdrawalDetails.status": { $ne: "failed" }, // Exclude failed withdrawals
	});

	const totalWithdrawnPoints = withdrawals.reduce(
		(sum, w) => sum + Math.abs(w.points),
		0,
	);

	// Calculate current balance
	const currentBalance = totalEarnedPoints - totalWithdrawnPoints;

	// Update user's reward points
	await User.findByIdAndUpdate(userId, {
		rewardPoints: currentBalance,
	});

	return {
		totalEarnedPoints,
		totalWithdrawnPoints,
		currentBalance,
		newlyAdded: rewardRecords.length,
	};
};

/**
 * RECALCULATE AND SYNC USER POINTS
 * This function calculates points from ALL successful transactions
 * and updates the user's total reward points
 */
exports.recalculateUserPoints = async (req, res) => {
	try {
		const userId = req.user._id;
		const result = await _syncUserPoints(userId);

		res.status(200).json({
			success: true,
			message: "Points recalculated successfully",
			data: {
				totalEarned: result.totalEarnedPoints,
				totalWithdrawn: result.totalWithdrawnPoints,
				currentBalance: result.currentBalance,
			},
		});
	} catch (error) {
		console.error("Recalculate points error:", error);
		res.status(500).json({
			success: false,
			message: "Failed to recalculate points",
			error: error.message,
		});
	}
};

/**
 * GET USER REWARD POINTS SUMMARY
 * Returns current balance, total earned, and total withdrawn
 */
exports.getRewardsSummary = async (req, res) => {
	try {
		const userId = req.user._id;

		// AUTO-SYNC: Ensure points are up to date before showing summary
		// This fixes the issue where existing users see 0 points
		await _syncUserPoints(userId);

		// Get user's current balance
		const user = await User.findById(userId);

		// Calculate total earned
		const earnedRewards = await Reward.find({
			user: userId,
			type: "earned",
		});
		const totalEarned = earnedRewards.reduce(
			(sum, r) => sum + r.points,
			0,
		);

		// Calculate total withdrawn
		const withdrawals = await Reward.find({
			user: userId,
			type: "withdrawn",
			"withdrawalDetails.status": { $ne: "failed" },
		});
		const totalWithdrawn = withdrawals.reduce(
			(sum, w) => sum + Math.abs(w.points),
			0,
		);

		// Get recent transactions
		const recentRewards = await Reward.find({ user: userId })
			.sort({ createdAt: -1 })
			.limit(10)
			.populate("transaction", "amount currency status createdAt");

		res.status(200).json({
			success: true,
			data: {
				currentBalance: user.rewardPoints || 0,
				totalEarned,
				totalWithdrawn,
				minimumWithdrawal: 5000,
				conversionRate: "1 point = 1 Naira",
				canWithdraw: (user.rewardPoints || 0) >= 5000,
				recentActivity: recentRewards,
			},
		});
	} catch (error) {
		console.error("Get rewards summary error:", error);
		res.status(500).json({
			success: false,
			message: "Failed to fetch rewards summary",
			error: error.message,
		});
	}
};

/**
 * GET REWARD HISTORY
 * Returns paginated list of all reward transactions
 */
exports.getRewardHistory = async (req, res) => {
	try {
		const userId = req.user._id;
		const page = parseInt(req.query.page) || 1;
		const limit = parseInt(req.query.limit) || 20;
		const skip = (page - 1) * limit;

		const rewards = await Reward.find({ user: userId })
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit)
			.populate(
				"transaction",
				"amount currency status createdAt orderId",
			);

		const totalCount = await Reward.countDocuments({ user: userId });

		res.status(200).json({
			success: true,
			data: {
				rewards,
				pagination: {
					currentPage: page,
					totalPages: Math.ceil(totalCount / limit),
					totalRecords: totalCount,
					hasMore: skip + rewards.length < totalCount,
				},
			},
		});
	} catch (error) {
		console.error("Get reward history error:", error);
		res.status(500).json({
			success: false,
			message: "Failed to fetch reward history",
			error: error.message,
		});
	}
};

/**
 * REQUEST WITHDRAWAL
 * Allows user to withdraw points (minimum 5000 points = 5000 Naira)
 */
exports.requestWithdrawal = async (req, res) => {
	try {
		const userId = req.user._id;
		const { points, accountDetails } = req.body;

		// Validation
		if (!points || points < 5000) {
			return res.status(400).json({
				success: false,
				message: "Minimum withdrawal is 5000 points (5000 Naira)",
			});
		}

		if (
			!accountDetails ||
			!accountDetails.accountNumber ||
			!accountDetails.bankName
		) {
			return res.status(400).json({
				success: false,
				message:
					"Account details (accountNumber, bankName, accountName) are required",
			});
		}

		// Get user's current balance
		const user = await User.findById(userId);

		if (user.rewardPoints < points) {
			return res.status(400).json({
				success: false,
				message: `Insufficient points. You have ${user.rewardPoints} points available`,
			});
		}

		// Create withdrawal record
		const withdrawal = await Reward.create({
			user: userId,
			type: "withdrawn",
			points: -points, // Negative to indicate deduction
			withdrawalDetails: {
				amountInNaira: points, // 1 point = 1 Naira
				status: "pending",
				accountDetails: {
					accountNumber: accountDetails.accountNumber,
					bankName: accountDetails.bankName,
					accountName: accountDetails.accountName,
				},
			},
			description: `Withdrawal request for ${points} points (₦${points})`,
		});

		// Deduct points from user's balance
		await User.findByIdAndUpdate(userId, {
			$inc: { rewardPoints: -points },
		});

		res.status(201).json({
			success: true,
			message: "Withdrawal request submitted successfully",
			data: {
				withdrawalId: withdrawal._id,
				points,
				amountInNaira: points,
				status: "pending",
				remainingBalance: user.rewardPoints - points,
			},
		});
	} catch (error) {
		console.error("Request withdrawal error:", error);
		res.status(500).json({
			success: false,
			message: "Failed to process withdrawal request",
			error: error.message,
		});
	}
};

/**
 * GET WITHDRAWAL HISTORY
 * Returns all withdrawal requests by the user
 */
exports.getWithdrawalHistory = async (req, res) => {
	try {
		const userId = req.user._id;

		const withdrawals = await Reward.find({
			user: userId,
			type: "withdrawn",
		}).sort({ createdAt: -1 });

		res.status(200).json({
			success: true,
			data: {
				withdrawals,
			},
		});
	} catch (error) {
		console.error("Get withdrawal history error:", error);
		res.status(500).json({
			success: false,
			message: "Failed to fetch withdrawal history",
			error: error.message,
		});
	}
};

/**
 * ADMIN: Update withdrawal status
 * This would typically be called by an admin after processing the payment
 */
exports.updateWithdrawalStatus = async (req, res) => {
	try {
		const { withdrawalId } = req.params;
		const { status } = req.body;

		if (!["pending", "completed", "failed"].includes(status)) {
			return res.status(400).json({
				success: false,
				message:
					"Invalid status. Must be: pending, completed, or failed",
			});
		}

		const withdrawal = await Reward.findById(withdrawalId);

		if (!withdrawal || withdrawal.type !== "withdrawn") {
			return res.status(404).json({
				success: false,
				message: "Withdrawal not found",
			});
		}

		// Update withdrawal status
		withdrawal.withdrawalDetails.status = status;
		if (status === "completed") {
			withdrawal.withdrawalDetails.processedAt = new Date();
		}

		// If failed, refund the points
		if (status === "failed") {
			await User.findByIdAndUpdate(withdrawal.user, {
				$inc: { rewardPoints: Math.abs(withdrawal.points) },
			});
		}

		await withdrawal.save();

		res.status(200).json({
			success: true,
			message: `Withdrawal ${status} successfully`,
			data: withdrawal,
		});
	} catch (error) {
		console.error("Update withdrawal status error:", error);
		res.status(500).json({
			success: false,
			message: "Failed to update withdrawal status",
			error: error.message,
		});
	}
};
