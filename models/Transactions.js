const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
	orderId: {
		type: String,
		required: true,
		unique: true,
		index: true, // For faster lookups
	},
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
		index: true, // For faster user queries
	},
	status: {
		type: String,
		enum: [
			"pending", // Order created, waiting
			"processing", // Provider assigned, crypto deposited
			"fulfilled", // Provider completed payment
			"validated", // System validated payment
			"settled", // Blockchain settlement confirmed
			"cancelled", // Order cancelled
			"refunded", // Funds refunded
			"expired", // Order expired
			"failed", // Order failed
		],
		default: "pending",
	},

	// Transaction details
	amount: { type: Number },
	currency: { type: String }, // e.g., "USDT", "USDC"
	network: { type: String }, // e.g., "bnb-smart-chain", "polygon"
	receiveAddress: { type: String }, // Paycrest deposit address
	reference: { type: String }, // Your internal reference
	validUntil: { type: Date }, // Payment expiration

	// Store complete Paycrest response
	paycrestData: {
		type: Object,
		default: {},
	},

	// Webhook tracking
	lastWebhook: {
		receivedAt: Date,
		raw: Object, // Full webhook payload for debugging
	},

	// Manual polling tracking
	lastPolledAt: { type: Date },
	lastPaycrestResponse: { type: Object },

	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

// Auto-update timestamp on save
transactionSchema.pre("save", function (next) {
	this.updatedAt = Date.now();
	next();
});

// Compound index for user + orderId queries
transactionSchema.index({ user: 1, orderId: 1 });

module.exports = mongoose.model("Transaction", transactionSchema);
