const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
	fullName: { type: String, required: true },
	email: { type: String, required: true, unique: true },
	password: { type: String, required: true },

	// Google OAuth fields
	googleId: { type: String },
	isGoogleAuth: { type: Boolean, default: false },

	// Existing fields for tracking user info
	ipAddress: { type: String },
	userAgent: { type: String },
	lastLoginIP: { type: String },
	lastLoginUserAgent: { type: String },
	lastLoginAt: { type: Date },

	// Reward points system
	rewardPoints: { type: Number, default: 0 },

	// KYC / Dojah Verification
	kyc: {
		status: {
			type: String,
			enum: ["unverified", "pending", "verified", "failed"],
			default: "unverified",
		},
		tier: { type: Number, default: 0 }, // 0=none, 1=id(bvn/nin), 2=selfie, etc.
		method: { type: String, enum: ["bvn", "nin"], default: "bvn" }, // Track which ID method used
		bvn: { type: String }, // Store encrypted in production!
		nin: { type: String },
		firstName: String,
		lastName: String,
		middleName: String,
		dateOfBirth: String,
		phoneNumber: String,
		gender: String,
		selfieUrl: String,
		verificationReference: String,
		lastVerifiedAt: Date,
		failureReason: String,
	},

	createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
