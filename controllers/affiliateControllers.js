const User = require("../models/User");
const { generateUniqueReferralCode } = require("../utils/referralCode");

// Get affiliate stats for the authenticated user
exports.getAffiliateStats = async (req, res) => {
	try {
		const userId = req.user._id;

		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ success: false, message: "User not found" });
		}

		// Backfill referral code for older accounts that were created before this field existed.
		if (!user.referralCode) {
			user.referralCode = await generateUniqueReferralCode();
			await user.save();
		}

		// Count how many users have this user's ID as referredBy
		const totalReferralsCount = await User.countDocuments({ referredBy: userId });

		res.status(200).json({
			success: true,
			data: {
				referralCode: user.referralCode,
				totalReferrals: totalReferralsCount,
				totalReferralVolume: user.totalReferralVolume || 0,
				referralRewardsBalance: user.referralRewardsBalance || 0,
			},
		});
	} catch (error) {
		console.error("Get affiliate stats error:", error);
		res.status(500).json({ success: false, message: "Internal server error" });
	}
};
