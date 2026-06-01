const User = require("../models/User");
const Reward = require("../models/Rewards");

/**
 * Award points to user for a successful transaction
 * Call this function when a transaction status changes to fulfilled/validated/settled
 *
 * @param {ObjectId} userId - The user's ID
 * @param {ObjectId} transactionId - The transaction ID
 * @param {Number} amountInUSD - Transaction amount in USD
 * @returns {Object} - Result object with success status and points awarded
 */
const awardPointsForTransaction = async (
	userId,
	transactionId,
	amountInUSD,
) => {
	try {
		// Check if points already awarded for this transaction
		const existingReward = await Reward.findOne({
			user: userId,
			transaction: transactionId,
			type: "earned",
		});

		if (existingReward) {
			return {
				success: false,
				message: "Points already awarded for this transaction",
				points: 0,
			};
		}

		// Calculate points (1 USD = 1 Point)
		const points = Math.floor(amountInUSD);

		if (points <= 0) {
			return {
				success: false,
				message: "Transaction amount too small to award points",
				points: 0,
			};
		}

		// Create reward record
		await Reward.create({
			user: userId,
			type: "earned",
			points: points,
			transaction: transactionId,
			description: `Earned ${points} points from swap of $${amountInUSD}`,
		});

		// Update user's total reward points
		await User.findByIdAndUpdate(userId, {
			$inc: { rewardPoints: points },
		});

		console.log(
			`✅ Awarded ${points} points to user ${userId} for transaction ${transactionId}`,
		);

		return {
			success: true,
			message: "Points awarded successfully",
			points: points,
		};
	} catch (error) {
		console.error("Error awarding points:", error);
		return {
			success: false,
			message: "Failed to award points",
			error: error.message,
			points: 0,
		};
	}
};

const awardAffiliateCommission = async (
	userId,
	transactionId,
	amountInUSD,
) => {
	try {
		// Find user and see if they were referred by anyone
		const user = await User.findById(userId);
		if (!user || !user.referredBy) {
			return { success: true, message: "No referrer found, skipping commission." };
		}

		// Check if commission already awarded for this transaction
		const existingReward = await Reward.findOne({
			user: user.referredBy,
			transaction: transactionId,
			type: "affiliate_commission",
		});

		if (existingReward) {
			return { success: false, message: "Commission already awarded for this transaction" };
		}

		// Calculate 10% commission on the amount in USD
		const commission = amountInUSD * 0.1;

		if (commission <= 0) {
			return { success: false, message: "Transaction amount too small to award commission" };
		}

		// Create reward record for the referrer
		await Reward.create({
			user: user.referredBy,
			type: "affiliate_commission",
			points: commission, // We store the $ amount here, or we can use another field if points is integer only. Wait, points in Schema is Number. Let's use points.
			transaction: transactionId,
			description: `Earned $${commission.toFixed(2)} affiliate commission from a referred user's $${amountInUSD.toFixed(2)} swap`,
		});

		// Update referrer's totals
		await User.findByIdAndUpdate(user.referredBy, {
			$inc: { 
				totalReferralVolume: amountInUSD,
				referralRewardsBalance: commission 
			},
		});

		console.log(
			`✅ Awarded $${commission.toFixed(2)} affiliate commission to user ${user.referredBy} for transaction ${transactionId}`
		);

		return { success: true, message: "Commission awarded successfully", commission };
	} catch (error) {
		console.error("Error awarding affiliate commission:", error);
		return { success: false, message: "Failed to award commission", error: error.message };
	}
};

module.exports = {
	awardPointsForTransaction,
	awardAffiliateCommission,
};
