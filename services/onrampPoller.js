const axios = require("axios");
const crypto = require("crypto");
const OnrampSession = require("../models/OnrampSession");
const {
	mapFixedFloatStatus,
	isFixedFloatDone,
	isFixedFloatTerminal,
	isFixedFloatActive,
} = require("../utils/mapFixedFloatStatus");
const { initiatePayCrestLeg, pollPayCrestStatus } = require("../utils/payCrestBridge");

const FF_BASE = process.env.FIXFLOAT_API || "https://ff.io/api/v2";
const FF_API_KEY = process.env.FIXFLOAT_API_KEY;
const FF_API_SECRET = process.env.FIXFLOAT_API_SECRET;

// How often to poll (milliseconds)
const FF_POLL_INTERVAL_MS = 30_000;   // 30 seconds while awaiting deposit
const PC_POLL_INTERVAL_MS = 45_000;   // 45 seconds while PayCrest is processing
const POLLER_TICK_MS = 15_000;        // Main ticker - checks every 15 seconds

// Max polls before giving up on a session (safety valve — ~6 hours at 30s intervals)
const MAX_POLL_COUNT = 720;

// Singleton poller state
let pollerInterval = null;
let isRunning = false;

/**
 * Sign a FixedFloat API request payload
 */
function signFFPayload(payload) {
	const body = payload ? JSON.stringify(payload) : "{}";
	return crypto.createHmac("sha256", FF_API_SECRET).update(body).digest("hex");
}

/**
 * Get FixedFloat order status from their API
 * @param {string} orderId
 * @returns {Promise<Object>} - FF order data
 */
async function fetchFixedFloatStatus(orderId) {
	const payload = { id: orderId };
	const response = await axios.post(
		`${FF_BASE}/order`,
		payload,
		{
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json; charset=UTF-8",
				"X-API-KEY": FF_API_KEY,
				"X-API-SIGN": signFFPayload(payload),
			},
			validateStatus: null,
		}
	);

	if (response.status >= 400) {
		throw new Error(
			`FF API error ${response.status}: ${JSON.stringify(response.data)}`
		);
	}

	return response.data?.data || response.data;
}

/**
 * Process a single session — check FF, bridge to PC if needed, check PC
 * @param {OnrampSession} session
 */
async function processSession(session) {
	const sid = session._id;

	// ── Safety valve: too many polls ─────────────────────────────────────
	if (session.pollCount >= MAX_POLL_COUNT) {
		console.warn(`⚠️ [Poller] Session ${sid} exceeded max polls. Marking expired.`);
		session.status = "expired";
		session.errorMessage = "Polling limit exceeded";
		await session.save();
		return;
	}

	// ── STAGE: FixedFloat polling ─────────────────────────────────────────
	if (["ff_awaiting", "ff_converting"].includes(session.status)) {
		try {
			console.log(`🔍 [Poller] Polling FF for session ${sid} (poll #${session.pollCount + 1})`);

			const ffOrder = await fetchFixedFloatStatus(session.fixedFloat.orderId);
			const ffStatus = ffOrder?.status || ffOrder?.type;

			session.fixedFloat.ffStatus = ffStatus;
			session.fixedFloat.ffRawResponse = ffOrder;
			session.lastPolledAt = new Date();
			session.pollCount += 1;

			const pipelineStatus = mapFixedFloatStatus(ffStatus);

			if (pipelineStatus && pipelineStatus !== session.status) {
				console.log(
					`🔄 [Poller] Session ${sid} FF status: ${ffStatus} → pipeline: ${pipelineStatus}`
				);
				session.status = pipelineStatus;
			}

			// Extract actual to-amount when FF is withdrawing/done
			if (ffOrder?.to?.amount) {
				session.fixedFloat.actualToAmount = parseFloat(ffOrder.to.amount);
			}

			await session.save();

			// ── If FF is DONE → wait for user confirmation ────────────────────────────────
			if (isFixedFloatDone(ffStatus)) {
				console.log(
					`✅ [Poller] FF done for session ${sid}! Awaiting user confirmation before PayCrest leg...`
				);
				session.status = "ff_done";
				await session.save();
				return;
			}

			// ── If FF is in a terminal failed state ────────────────────────────
			if (isFixedFloatTerminal(ffStatus)) {
				console.log(
					`💀 [Poller] FF terminal for session ${sid}: ${ffStatus}`
				);
				session.status = mapFixedFloatStatus(ffStatus);
				session.errorStage = "ff";
				session.errorMessage = `FixedFloat order ${ffStatus}`;
				await session.save();
			}
		} catch (error) {
			console.error(
				`❌ [Poller] FF poll error for session ${sid}:`,
				error.message
			);
		}
		return;
	}

	// ── STAGE: PayCrest polling ──────────────────────────────────────────
	if (["pc_awaiting", "pc_processing"].includes(session.status)) {
		console.log(`🔍 [Poller] Polling PayCrest for session ${sid}`);
		session.lastPolledAt = new Date();
		session.pollCount += 1;
		await session.save();
		await pollPayCrestStatus(session);
		return;
	}
}

/**
 * Main tick — fetches all active sessions and processes them
 */
async function tick() {
	if (isRunning) return; // Prevent overlapping ticks
	isRunning = true;

	try {
		// Find all sessions that need attention
		const activeSessions = await OnrampSession.find({
			status: {
				$in: [
					"ff_awaiting",
					"ff_converting",
					"pc_pending",   // Just transitioned — will be picked up on retry
					"pc_awaiting",
					"pc_processing",
				],
			},
		}).lean(false); // We need Mongoose docs to save()

		if (activeSessions.length > 0) {
			console.log(
				`\n⏰ [Poller Tick] Found ${activeSessions.length} active onramp session(s)`
			);
		}

		// Process each session (sequentially to avoid rate limits)
		for (const session of activeSessions) {
			try {
				await processSession(session);
				// Small sleep between sessions to be kind to external APIs
				await new Promise((r) => setTimeout(r, 500));
			} catch (err) {
				console.error(
					`❌ [Poller] Unhandled error processing session ${session._id}:`,
					err.message
				);
			}
		}
	} catch (err) {
		console.error("❌ [Poller] Tick error:", err.message);
	} finally {
		isRunning = false;
	}
}

/**
 * Start the background poller.
 * Should be called once when the server starts.
 */
function startOnrampPoller() {
	if (pollerInterval) {
		console.warn("⚠️ [Poller] Already running — skipped duplicate start");
		return;
	}

	console.log(`🚀 [Poller] Starting onramp background poller (tick every ${POLLER_TICK_MS / 1000}s)`);

	// Initial tick after 10s (give server time to fully boot)
	setTimeout(tick, 10_000);

	// Then tick every POLLER_TICK_MS
	pollerInterval = setInterval(tick, POLLER_TICK_MS);

	// Unref so it doesn't prevent clean process exit
	if (pollerInterval.unref) pollerInterval.unref();
}

/**
 * Stop the poller (for graceful shutdown / testing)
 */
function stopOnrampPoller() {
	if (pollerInterval) {
		clearInterval(pollerInterval);
		pollerInterval = null;
		console.log("🛑 [Poller] Stopped");
	}
}

module.exports = { startOnrampPoller, stopOnrampPoller };
