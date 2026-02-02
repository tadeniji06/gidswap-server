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

	createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
