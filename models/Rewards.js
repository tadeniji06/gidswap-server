const mongoose = require("mongoose");

const rewardSchema = new mongoose.Schema({
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
		index: true,
	},
	type: {
		type: String,
		enum: ["earned", "withdrawn"],
		required: true,
	},
	points: {
		type: Number,
		required: true,
	},
	// For earned rewards - link to the transaction
	transaction: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Transaction",
	},
	// For withdrawals
	withdrawalDetails: {
		amountInNaira: Number, // Amount withdrawn in Naira
		status: {
			type: String,
			enum: ["pending", "completed", "failed"],
			default: "pending",
		},
		accountDetails: Object, // Store user's bank details or payment info
		processedAt: Date,
	},
	description: {
		type: String,
	},
	createdAt: {
		type: Date,
		default: Date.now,
	},
});

// Index for faster queries
rewardSchema.index({ user: 1, createdAt: -1 });
rewardSchema.index({ user: 1, type: 1 });

module.exports = mongoose.model("Reward", rewardSchema);
