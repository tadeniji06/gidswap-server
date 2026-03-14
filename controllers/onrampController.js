const axios = require("axios");
const crypto = require("crypto");
const OnrampSession = require("../models/OnrampSession");
const { getPayCrestConfig, DEFAULT_STABLE_TARGET, VALID_FF_STABLE_CURRENCIES } = require("../utils/stableConfig");

const FF_BASE = process.env.FIXFLOAT_API || "https://ff.io/api/v2";
const FF_API_KEY = process.env.FIXFLOAT_API_KEY;
const FF_API_SECRET = process.env.FIXFLOAT_API_SECRET;

const PAYCREST_BASE =
	process.env.PAY_CREST_API?.replace(/\/+$/, "") || "https://api.paycrest.io/v1";
const PAYCREST_API_KEY = process.env.PAY_CREST_API_KEY;

// ─── FixedFloat helpers ───────────────────────────────────────────────────────

function signFFPayload(payload) {
	const body = payload ? JSON.stringify(payload) : "{}";
	return crypto
		.createHmac("sha256", FF_API_SECRET)
		.update(body)
		.digest("hex");
}

function ffHeaders(payload = {}) {
	return {
		Accept: "application/json",
		"Content-Type": "application/json; charset=UTF-8",
		"X-API-KEY": FF_API_KEY,
		"X-API-SIGN": signFFPayload(payload),
	};
}

// ─── PayCrest helpers ─────────────────────────────────────────────────────────

const pcHeaders = {
	Accept: "application/json",
	"Content-Type": "application/json; charset=UTF-8",
	"API-Key": PAYCREST_API_KEY,
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/onramp/initiate
 *
 * The single entry point for the full Crypto → Stables → Fiat pipeline.
 *
 * Body:
 * {
 *   fromCurrency: "ETH",          // What the user is sending (FF currency code)
 *   fromNetwork:  "ETH",          // Network for fromCurrency
 *   toStable:     "USDTBSC",      // Target stable (optional - defaults to USDTBSC)
 *   fromAmount:   0.05,           // Amount user will send
 *   payoutDetails: {
 *     walletAddress:  "0xYourWallet...",// Required
 *     bankCode:       "GTB",
 *     accountNumber:  "0123456789",
 *     accountName:    "John Doe",     // optional
 *     currency:       "NGN",
 *     memo:           "rent"          // optional
 *   }
 * }
 *
 * Response: session ID + FixedFloat deposit address + estimated amounts.
 * Client sends crypto to depositAddress and polls /api/onramp/status/:sessionId.
 */
exports.initiateOnramp = async (req, res) => {
	try {
		const {
			fromCurrency,
			fromNetwork,
			toStable,
			fromAmount,
			payoutDetails,
		} = req.body;

		const userId = req.user._id;

		// ── Validate inputs ───────────────────────────────────────────────────
		if (!fromCurrency || !fromAmount || !payoutDetails) {
			return res.status(400).json({
				success: false,
				message: "fromCurrency, fromAmount, and payoutDetails are required",
			});
		}

		if (!payoutDetails.bankCode || !payoutDetails.accountNumber || !payoutDetails.walletAddress) {
			return res.status(400).json({
				success: false,
				message: "payoutDetails must include bankCode, accountNumber, and walletAddress",
			});
		}

		if (parseFloat(fromAmount) <= 0) {
			return res.status(400).json({
				success: false,
				message: "fromAmount must be greater than 0",
			});
		}

		// ── Resolve target stablecoin ────────────────────────────────────────
		const stableTarget = toStable
			? toStable.toUpperCase()
			: DEFAULT_STABLE_TARGET.ffCurrency;

		const pcConfig = getPayCrestConfig(stableTarget);
		if (!pcConfig) {
			return res.status(400).json({
				success: false,
				message: `Unsupported stable target: ${stableTarget}. Valid options: ${VALID_FF_STABLE_CURRENCIES.join(", ")}`,
			});
		}

		console.log(
			`\n🚀 [Onramp] Initiating for user ${userId}: ${fromAmount} ${fromCurrency} → ${stableTarget} → NGN`
		);

		// ── Step 1: Get rate quote from FixedFloat ────────────────────────────
		const ratePayload = {
			fromCcy: fromCurrency.toUpperCase(),
			toCcy: stableTarget,
			fromAmount: parseFloat(fromAmount),
			direction: "from",
			type: "float",
		};

		if (fromNetwork) ratePayload.fromNetwork = fromNetwork.toUpperCase();

		console.log(`📊 [Onramp] Fetching FF rate...`, ratePayload);

		const rateRes = await axios.post(`${FF_BASE}/price`, ratePayload, {
			headers: ffHeaders(ratePayload),
			validateStatus: null,
		});

		let rateData = rateRes.data?.data;

		// ─── Handle non-200 or empty response ─────────────────────────────────
		if (rateRes.data?.code !== 0 || !rateData) {
			console.error("❌ [Onramp] FF rate error:", rateRes.data);
			return res.status(502).json({
				success: false,
				message: `Exchange rate unavailable: ${rateRes.data?.msg || "unknown error"}`,
			});
		}

		const estimatedStableAmount = parseFloat(rateData.to?.amount || 0);

		console.log(`💱 [Onramp] Got FF rate. ~${estimatedStableAmount} ${stableTarget} expected`);

		// ── Step 2: Get estimated NGN from PayCrest ────────────────────────
		let estimatedNGN = null;
		try {
			const pcRateRes = await axios.get(
				`${PAYCREST_BASE}/rates/${pcConfig.token}/1/NGN`,
				{ headers: pcHeaders }
			);
			// PayCrest returns: { status, message, data: '1391.01' } — a plain string
			const rateStr = pcRateRes.data?.data;
			if (rateStr && estimatedStableAmount > 0) {
				estimatedNGN = parseFloat(rateStr) * estimatedStableAmount;
				console.log(`💰 [Onramp] Estimated NGN payout: ₦${estimatedNGN.toFixed(2)}`);
			}
		} catch (rateErr) {
			console.warn("⚠️ [Onramp] Could not fetch NGN rate:", rateErr.message);
		}

		// We use the user's wallet address as the recipient of the stables from FF
		const orderPayload = {
			fromCcy: fromCurrency.toUpperCase(),
			toCcy: stableTarget,
			fromAmount: parseFloat(fromAmount),
			direction: "from",
			type: "float",
			toAddress: payoutDetails.walletAddress, // User's wallet that receives stables
		};

		if (fromNetwork) orderPayload.fromNetwork = fromNetwork.toUpperCase();

		console.log(`📝 [Onramp] Creating FF order...`, orderPayload);

		const orderRes = await axios.post(`${FF_BASE}/create`, orderPayload, {
			headers: ffHeaders(orderPayload),
			validateStatus: null,
		});

		let ffOrder = orderRes.data?.data;

		// ─── Handle error from FF order creation ──────────────────────────────
		if (orderRes.data?.code !== 0 || !ffOrder) {
			console.error("❌ [Onramp] FF order creation failed:", orderRes.data);
			return res.status(502).json({
				success: false,
				message: `Failed to create swap order: ${orderRes.data?.msg || "unknown error"}`,
			});
		}

		console.log(`✅ [Onramp] FF order created: ${ffOrder.id}`);

		// ── Step 4: Create OnrampSession in DB ───────────────────────────────
		const session = await OnrampSession.create({
			user: userId,
			status: "ff_awaiting",

			fixedFloat: {
				orderId: ffOrder.id,
				fromCurrency: fromCurrency.toUpperCase(),
				fromNetwork: fromNetwork?.toUpperCase(),
				toCurrency: stableTarget,
				toNetwork: pcConfig.network,
				fromAmount: parseFloat(fromAmount),
				toAmount: estimatedStableAmount,
				depositAddress: ffOrder.from?.address || ffOrder.fromAddress,
				depositExtraId: ffOrder.from?.tag || ffOrder.fromTag || null,
				ffStatus: "NEW",
				ffRawResponse: ffOrder,
				expiresAt: ffOrder.expiresAt ? new Date(ffOrder.expiresAt) : null,
			},

			payCrest: {
				token: pcConfig.token,
				network: pcConfig.network,
			},

			payoutDetails: {
				walletAddress: payoutDetails.walletAddress,
				bankCode: payoutDetails.bankCode,
				accountNumber: payoutDetails.accountNumber,
				accountName: payoutDetails.accountName || null,
				currency: payoutDetails.currency || "NGN",
				memo: payoutDetails.memo || null,
			},

			estimatedNGN,
		});

		console.log(`💾 [Onramp] Session created: ${session._id}`);

		// ── Return to client ──────────────────────────────────────────────────
		return res.status(201).json({
			success: true,
			message: "Onramp initiated successfully. Send your crypto to the deposit address.",
			data: {
				sessionId: session._id,
				status: session.status,
				// What to show the user
				sendCrypto: {
					currency: fromCurrency.toUpperCase(),
					network: fromNetwork?.toUpperCase() || fromCurrency.toUpperCase(),
					amount: parseFloat(fromAmount),
					depositAddress: session.fixedFloat.depositAddress,
					depositExtraId: session.fixedFloat.depositExtraId || null,
					expiresAt: session.fixedFloat.expiresAt,
				},
				estimates: {
					stableAmount: estimatedStableAmount,
					stableCurrency: stableTarget,
					ngnPayout: estimatedNGN
						? Math.floor(estimatedNGN).toString()
						: null,
				},
			},
		});
	} catch (error) {
		console.error("❌ [Onramp] initiateOnramp error:", error.response?.data || error.message);
		return res.status(500).json({
			success: false,
			message: "Internal server error",
			details: error.response?.data || error.message,
		});
	}
};

/**
 * GET /api/onramp/status/:sessionId
 *
 * Returns the full status of an onramp session — what stage it's at,
 * what the estimates are, and any error info.
 */
exports.getOnrampStatus = async (req, res) => {
	try {
		const { sessionId } = req.params;
		const userId = req.user._id;

		const session = await OnrampSession.findOne({
			_id: sessionId,
			user: userId,
		});

		if (!session) {
			return res.status(404).json({
				success: false,
				message: "Session not found",
			});
		}

		// Build a clean, readable status response
		const response = {
			success: true,
			data: {
				sessionId: session._id,
				status: session.status,
				statusLabel: getStatusLabel(session.status),
				createdAt: session.createdAt,
				updatedAt: session.updatedAt,

				// Leg 1 info
				cryptoLeg: {
					currency: session.fixedFloat.fromCurrency,
					network: session.fixedFloat.fromNetwork,
					amount: session.fixedFloat.fromAmount,
					depositAddress: session.fixedFloat.depositAddress,
					depositExtraId: session.fixedFloat.depositExtraId,
					expiresAt: session.fixedFloat.expiresAt,
					status: session.fixedFloat.ffStatus,
					convertingTo: session.fixedFloat.toCurrency,
					expectedStableAmount: session.fixedFloat.toAmount,
					actualStableAmount: session.fixedFloat.actualToAmount || null,
				},

				// Leg 2 info (populated once FF completes and user confirms)
				fiatLeg: session.payCrest?.orderId
					? {
						status: session.payCrest.pcStatus,
						token: session.payCrest.token,
						network: session.payCrest.network,
						amountToSend: session.payCrest.amount,
						payCrestDepositAddress: session.payCrest.receiveAddress,
						reference: session.payCrest.reference,
					}
					: null,

				// Estimates & final
				estimatedNGN: session.estimatedNGN,
				finalNGN: session.finalNGN || null,
				completedAt: session.completedAt || null,

				// Error info
				error: session.status === "failed"
					? {
						stage: session.errorStage,
						message: session.errorMessage,
					}
					: null,
			},
		};

		return res.status(200).json(response);
	} catch (error) {
		console.error("❌ [Onramp] getOnrampStatus error:", error.message);
		return res.status(500).json({
			success: false,
			message: "Internal server error",
		});
	}
};

/**
 * GET /api/onramp/history
 *
 * Returns a user's past onramp sessions.
 */
exports.getOnrampHistory = async (req, res) => {
	try {
		const userId = req.user._id;
		const page = parseInt(req.query.page) || 1;
		const limit = parseInt(req.query.limit) || 10;
		const skip = (page - 1) * limit;

		const [sessions, total] = await Promise.all([
			OnrampSession.find({ user: userId })
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.select(
					"status estimatedNGN finalNGN completedAt createdAt fixedFloat.fromCurrency fixedFloat.fromAmount fixedFloat.toCurrency fixedFloat.toAmount errorStage errorMessage"
				),
			OnrampSession.countDocuments({ user: userId }),
		]);

		return res.status(200).json({
			success: true,
			data: {
				sessions,
				pagination: {
					currentPage: page,
					totalPages: Math.ceil(total / limit),
					totalRecords: total,
				},
			},
		});
	} catch (error) {
		console.error("❌ [Onramp] getOnrampHistory error:", error.message);
		return res.status(500).json({
			success: false,
			message: "Internal server error",
		});
	}
};

/**
 * GET /api/onramp/rate
 *
 * Get estimated rates for the full pipeline (FF leg + PC leg).
 * Useful for showing the user how much NGN they'll receive before initiating.
 */
exports.getOnrampRate = async (req, res) => {
	try {
		const { fromCurrency, fromAmount, toStable } = req.query;

		if (!fromCurrency || !fromAmount) {
			return res.status(400).json({
				success: false,
				message: "fromCurrency and fromAmount are required",
			});
		}

		const stableTarget =
			toStable?.toUpperCase() || DEFAULT_STABLE_TARGET.ffCurrency;
		const pcConfig = getPayCrestConfig(stableTarget);

		if (!pcConfig) {
			return res.status(400).json({
				success: false,
				message: `Invalid stable target: ${stableTarget}`,
			});
		}

		// Get FF rate
		const ffRatePayload = {
			fromCcy: fromCurrency.toUpperCase(),
			toCcy: stableTarget,
			fromAmount: parseFloat(fromAmount),
			direction: "from",
			type: "float",
		};

		const [ffRes, pcRes] = await Promise.allSettled([
			axios.post(`${FF_BASE}/price`, ffRatePayload, { headers: ffHeaders(ffRatePayload), validateStatus: null }),
			axios.get(
				`${PAYCREST_BASE}/rates/${pcConfig.token}/1/NGN`,
				{ headers: { Accept: "application/json", "API-Key": PAYCREST_API_KEY } }
			),
		]);

		let ffRate =
			ffRes.status === "fulfilled" && ffRes.value?.data?.code === 0
				? ffRes.value.data.data
				: null;

		const pcRate =
			pcRes.status === "fulfilled"
				// PayCrest returns data as plain string e.g. '1391.01'
				? pcRes.value?.data?.data || null
				: null;

		const estimatedStable = parseFloat(ffRate?.to?.amount || 0);
		const ratePerStable = pcRate ? parseFloat(pcRate) : null;
		const estimatedNGN = ratePerStable && estimatedStable > 0 ? estimatedStable * ratePerStable : null;

		return res.status(200).json({
			success: true,
			data: {
				from: {
					currency: fromCurrency.toUpperCase(),
					amount: parseFloat(fromAmount),
				},
				intermediate: {
					currency: stableTarget,
					estimatedAmount: estimatedStable,
				},
				to: {
					currency: "NGN",
					estimatedAmount: estimatedNGN ? Math.floor(estimatedNGN) : null,
					ratePerStable,
				},
				ffMinAmount: ffRate?.from?.min || null,
				ffMaxAmount: ffRate?.from?.max || null,
				warning: !ffRate || !pcRate
					? "Rate unavailable, check back before sending."
					: null,
			},
		});
	} catch (error) {
		console.error("❌ [Onramp] getOnrampRate error:", error.message);
		return res.status(500).json({
			success: false,
			message: "Failed to fetch rates",
			details: error.message,
		});
	}
};

/**
 * POST /api/onramp/continue-to-fiat
 * 
 * Called by the user after they have received the stables in their wallet.
 * Initiates the PayCrest leg.
 */
exports.continueToFiat = async (req, res) => {
	try {
		const { sessionId } = req.body;
		const userId = req.user._id;

		if (!sessionId) {
			return res.status(400).json({ success: false, message: "sessionId is required" });
		}

		const session = await OnrampSession.findOne({ _id: sessionId, user: userId });

		if (!session) {
			return res.status(404).json({ success: false, message: "Session not found" });
		}

		if (session.status !== "ff_done" && session.status !== "ff_converting") {
			// Actually we can allow either if the user believes they got the funds.
			// But sticking to ff_done is safer.
			// If they wanna proceed, let's allow "ff_done"
			return res.status(400).json({ 
				success: false, 
				message: `Cannot continue to fiat from status: ${session.status}. Please wait until FF completes.` 
			});
		}

		// Import dynamically to avoid circular dependencies if any
		const { initiatePayCrestLeg } = require("../utils/payCrestBridge");
		const success = await initiatePayCrestLeg(session);

		if (!success) {
			return res.status(502).json({
				success: false,
				message: "Failed to initiate fiat payout",
				error: session.errorMessage
			});
		}

		return res.status(200).json({
			success: true,
			message: "Fiat payout initiated. Please send stables to the PayCrest address.",
			data: {
				status: session.status,
				fiatLeg: {
					amountToSend: session.payCrest.amount,
					token: session.payCrest.token,
					network: session.payCrest.network,
					payCrestDepositAddress: session.payCrest.receiveAddress,
					reference: session.payCrest.reference
				}
			}
		});

	} catch (error) {
		console.error("❌ [Onramp] continueToFiat error:", error.message);
		return res.status(500).json({
			success: false,
			message: "Internal server error"
		});
	}
};

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Returns a user-friendly label for each pipeline status.
 */
function getStatusLabel(status) {
	const labels = {
		ff_pending: "Preparing swap order…",
		ff_awaiting: "Waiting for your crypto deposit",
		ff_converting: "Converting your crypto to stablecoin…",
		ff_done: "Crypto converted successfully. Awaiting your confirmation.",
		pc_pending: "Initiating fiat payout…",
		pc_awaiting: "Please send stablecoins to the provided address",
		pc_processing: "Fiat payout processing…",
		completed: "Complete — fiat sent to your bank ✅",
		failed: "Transaction failed",
		expired: "Order expired",
	};
	return labels[status] || status;
}
