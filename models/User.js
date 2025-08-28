const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
	fullName: { type: String, required: true },
	email: { type: String, required: true, unique: true },
	password: { type: String, required: true },

	// New fields for tracking user info
	ipAddress: { type: String },
	userAgent: { type: String },
	lastLoginIP: { type: String },
	lastLoginUserAgent: { type: String },
	lastLoginAt: { type: Date },

	createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
