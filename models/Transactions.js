const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
	orderId: { type: String, required: true, unique: true },
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
	},
	status: {
		type: String,
		enum: [
			"pending", // waiting / initiated
			"processing", // provider assigned, crypto deposited
			"fulfilled", // provider paid user
			"validated", // double-checked by system
			"settled", // blockchain settlement confirmed
			"cancelled",
			"refunded",
			"expired",
			"failed",
		],
		default: "pending",
	},
	amount: { type: Number }, // store numeric for math
	currency: { type: String },
	lastWebhook: {
		receivedAt: Date,
		raw: Object, // full payload for debugging
	},
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

// Keep updatedAt fresh
transactionSchema.pre("save", function (next) {
	this.updatedAt = Date.now();
	next();
});

module.exports = mongoose.model("Transaction", transactionSchema);
