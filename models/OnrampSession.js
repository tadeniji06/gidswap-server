const mongoose = require("mongoose");

/**
 * OnrampSession
 *
 * Tracks the full crypto → stables → fiat pipeline.
 * One session = one end-to-end user swap.
 *
 * Pipeline stages:
 *  1. ff_pending        → Session created, waiting for FF order creation
 *  2. ff_awaiting       → FF order created, waiting for user to send crypto
 *  3. ff_converting     → FF detected the deposit, converting crypto → stables
 *  4. ff_done           → FF conversion complete (stables arrived at user's wallet)
 *  5. pc_pending        → User confirmed receipt, initiating PayCrest order
 *  6. pc_awaiting       → PayCrest order created, waiting for user to send stables to PayCrest
 *  7. pc_processing     → PayCrest received stables, processing fiat payout
 *  8. completed         → Fiat sent to user's bank ✅
 *  9. failed            → Something went wrong at any stage
 * 10. expired           → FF order expired before user deposited
 */
const onrampSessionSchema = new mongoose.Schema({
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
		index: true,
	},

	// ─── Overall Pipeline Status ───────────────────────────────────────────
	status: {
		type: String,
		enum: [
			"ff_pending",
			"ff_awaiting",
			"ff_converting",
			"ff_done",
			"pc_pending",
			"pc_awaiting",
			"pc_processing",
			"completed",
			"failed",
			"expired",
		],
		default: "ff_pending",
	},

	// ─── LEG 1: FixedFloat (Crypto → Stablecoins) ──────────────────────────
	fixedFloat: {
		orderId: { type: String }, // FF's order ID
		fromCurrency: { type: String, required: true }, // e.g. "BTC", "ETH"
		fromNetwork: { type: String }, // e.g. "ETH", "BTC"
		toCurrency: { type: String, required: true }, // e.g. "USDT", "USDC"
		toNetwork: { type: String, required: true }, // e.g. "ETH", "MATIC", "BSC"
		fromAmount: { type: Number }, // Amount user is sending
		toAmount: { type: Number }, // Expected stables amount after conversion
		actualToAmount: { type: Number }, // Actual received amount (after FF takes fees)
		depositAddress: { type: String }, // Address user should send crypto to
		depositExtraId: { type: String }, // Memo/tag if needed
		ffStatus: { type: String }, // Raw FF status string
		ffRawResponse: { type: Object }, // Full FF API response for debugging
		expiresAt: { type: Date }, // When the FF order expires
	},

	// ─── LEG 2: PayCrest (Stablecoins → NGN Fiat) ──────────────────────────
	payCrest: {
		orderId: { type: String }, // PayCrest order ID
		token: { type: String }, // "USDT" or "USDC"
		network: { type: String }, // PayCrest network code e.g. "bnb-smart-chain"
		amount: { type: Number }, // Amount of stables to send to PayCrest
		receiveAddress: { type: String }, // PayCrest's deposit address
		reference: { type: String }, // Internal reference
		validUntil: { type: Date },
		pcStatus: { type: String }, // Raw PC status
		pcRawResponse: { type: Object }, // Full PayCrest API response
	},

	// ─── User's Payout & Receive Details ──────────────────────────────────────
	payoutDetails: {
		walletAddress: { type: String, required: true }, // User's wallet to receive stables
		bankCode: { type: String, required: true },
		accountNumber: { type: String, required: true },
		accountName: { type: String },
		currency: { type: String, default: "NGN" },
		memo: { type: String }, // Optional memo/note from user
	},

	// ─── Amounts & Rates ────────────────────────────────────────────────────
	estimatedNGN: { type: Number }, // Estimated NGN payout at time of initiation
	finalNGN: { type: Number }, // Actual NGN payout after completion

	// ─── Error Tracking ─────────────────────────────────────────────────────
	errorStage: { type: String }, // Which stage failed: "ff" or "pc"
	errorMessage: { type: String },
	errorDetails: { type: Object },

	// ─── Background Job Tracking ─────────────────────────────────────────────
	lastPolledAt: { type: Date }, // Last time background poller checked FF
	pollCount: { type: Number, default: 0 }, // Total poll attempts
	pcInitiatedAt: { type: Date }, // When PayCrest leg was triggered
	completedAt: { type: Date }, // When the whole pipeline finished

	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

// Auto-update timestamp on save
onrampSessionSchema.pre("save", function (next) {
	this.updatedAt = Date.now();
	next();
});

// Indexes for efficient queries
onrampSessionSchema.index({ user: 1, createdAt: -1 });
onrampSessionSchema.index({ "fixedFloat.orderId": 1 });
onrampSessionSchema.index({ "payCrest.orderId": 1 });
onrampSessionSchema.index({ status: 1 }); // For background poller to find active sessions

module.exports = mongoose.model("OnrampSession", onrampSessionSchema);
