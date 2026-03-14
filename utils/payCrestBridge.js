const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const OnrampSession = require("../models/OnrampSession");
const { mapPaycrestStatus } = require("./mapPaycrestStatus");

const PAYCREST_BASE =
	process.env.PAY_CREST_API?.replace(/\/+$/, "") ||
	"https://api.paycrest.io/v1";
const PAYCREST_API_KEY = process.env.PAY_CREST_API_KEY;

const paycrestHeaders = {
	Accept: "application/json",
	"Content-Type": "application/json; charset=UTF-8",
	"API-Key": PAYCREST_API_KEY,
};

/**
 * Initiates the PayCrest (Stables → Fiat) leg for a completed FixedFloat session.
 *
 * This is called automatically by the background poller when FF status is "DONE".
 * It reads the session's stables amount + user payout details, creates a PayCrest
 * order, and updates the session accordingly.
 *
 * @param {OnrampSession} session - The Mongoose session document
 * @returns {Promise<boolean>} - true on success, false on failure
 */
async function initiatePayCrestLeg(session) {
	console.log(`\n🔄 [PayCrest Bridge] Initiating PayCrest leg for session: ${session._id}`);

	try {
		// Amount to send: use actual received amount from FF
		const stableAmount = session.fixedFloat.actualToAmount || session.fixedFloat.toAmount;

		if (!stableAmount || stableAmount <= 0) {
			throw new Error(`Invalid stable amount: ${stableAmount}`);
		}

		const { token, network } = session.payCrest; // Preloaded from session creation
		const { bankCode, accountNumber, accountName, currency, memo } = session.payoutDetails;

		const reference = `ONRAMP-${session._id}-${uuidv4().slice(0, 8)}`.toUpperCase();

		// Build PayCrest order payload
		const payload = {
			amount: stableAmount,
			token: token.toUpperCase(),
			network: network,
			recipient: {
				institution: {
					code: bankCode,
					currency: currency || "NGN",
				},
				accountIdentifier: accountNumber,
				accountName: accountName || "",
				memo: memo || `GidSwap onramp ${session._id}`,
			},
			reference,
			feePercent: 2, // Optional: include platform fee if applicable
		};

		console.log(`📤 [PayCrest Bridge] Calling PayCrest API:`, JSON.stringify(payload, null, 2));

		const response = await axios.post(
			`${PAYCREST_BASE}/sender/orders`,
			payload,
			{ headers: paycrestHeaders }
		);

		const orderData = response.data?.data;

		if (!orderData?.id) {
			throw new Error(`PayCrest returned no order ID: ${JSON.stringify(response.data)}`);
		}

		console.log(`✅ [PayCrest Bridge] PayCrest order created: ${orderData.id}`);

		// Update session with PayCrest order details
		session.status = "pc_awaiting";
		session.payCrest.orderId = orderData.id;
		session.payCrest.amount = stableAmount;
		session.payCrest.receiveAddress = orderData.receiveAddress;
		session.payCrest.reference = reference;
		session.payCrest.validUntil = orderData.validUntil
			? new Date(orderData.validUntil)
			: undefined;
		session.payCrest.pcStatus = "pending";
		session.payCrest.pcRawResponse = orderData;
		session.pcInitiatedAt = new Date();

		await session.save();

		console.log(`💾 [PayCrest Bridge] Session updated to pc_awaiting`);
		return true;
	} catch (error) {
		console.error(
			`❌ [PayCrest Bridge] Failed for session ${session._id}:`,
			error.response?.data || error.message
		);

		session.status = "failed";
		session.errorStage = "pc";
		session.errorMessage = error.message;
		session.errorDetails = error.response?.data || null;
		await session.save();

		return false;
	}
}

/**
 * Polls PayCrest for the status of a session's PayCrest order.
 * Updates the session status accordingly.
 *
 * @param {OnrampSession} session
 * @returns {Promise<void>}
 */
async function pollPayCrestStatus(session) {
	if (!session.payCrest?.orderId) return;

	const orderId = session.payCrest.orderId;
	console.log(`📡 [PayCrest Poll] Checking orderId: ${orderId}`);

	try {
		const response = await axios.get(
			`${PAYCREST_BASE}/sender/orders/${encodeURIComponent(orderId)}`,
			{ headers: paycrestHeaders, validateStatus: null }
		);

		if (response.status >= 400) {
			console.warn(`⚠️ [PayCrest Poll] Non-200 response: ${response.status}`);
			return;
		}

		const rawStatus =
			response.data?.data?.status ||
			response.data?.status ||
			response.data?.event;

		if (!rawStatus) return;

		const mapped = mapPaycrestStatus(rawStatus);
		session.payCrest.pcStatus = rawStatus;
		session.payCrest.pcRawResponse = response.data?.data || response.data;

		console.log(`🗺️ [PayCrest Poll] Status: ${rawStatus} → ${mapped}`);

		// Translate to our pipeline status
		if (mapped === "fulfilled" || mapped === "validated" || mapped === "settled") {
			session.status = "completed";
			session.completedAt = new Date();
			session.finalNGN =
				response.data?.data?.amountReceived ||
				response.data?.data?.fiatAmount ||
				session.estimatedNGN;
			console.log(`🎉 [PayCrest Poll] Pipeline COMPLETE for session ${session._id}`);
		} else if (mapped === "processing") {
			session.status = "pc_processing";
		} else if (["failed", "cancelled", "refunded", "expired"].includes(mapped)) {
			session.status = "failed";
			session.errorStage = "pc";
			session.errorMessage = `PayCrest order ${mapped}`;
		}
		// else: still pending/awaiting — no status change

		await session.save();
	} catch (error) {
		console.error(
			`❌ [PayCrest Poll] Error for session ${session._id}:`,
			error.message
		);
	}
}

module.exports = { initiatePayCrestLeg, pollPayCrestStatus };
