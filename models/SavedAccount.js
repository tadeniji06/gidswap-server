const mongoose = require("mongoose");

const SavedAccountSchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},

		// ── Display label (user-chosen nickname) ──────────────────────
		label: {
			type: String,
			default: "My Account",
			maxlength: 50,
			trim: true,
		},

		// ── Bank Details ──────────────────────────────────────────────
		bankName: { type: String, required: true, trim: true },
		bankCode: { type: String, required: true, trim: true },
		accountNumber: { type: String, required: true, trim: true },
		accountName: { type: String, required: true, trim: true },
		currency: { type: String, default: "NGN", uppercase: true },

		// ── Refund / Return Wallet Address ────────────────────────────
		// Used as returnAddress when placing a PayCrest order
		returnAddress: {
			type: String,
			default: null,
			trim: true,
		},

		// ── Meta ──────────────────────────────────────────────────────
		isDefault: {
			type: Boolean,
			default: false,
		},
	},
	{ timestamps: true }
);

// Prevent exact duplicates per user (same bank + account number)
SavedAccountSchema.index(
	{ user: 1, accountNumber: 1, bankCode: 1 },
	{ unique: true }
);

module.exports = mongoose.model("SavedAccount", SavedAccountSchema);
