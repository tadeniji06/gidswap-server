/**
 * Maps FixedFloat order statuses to our OnrampSession pipeline status.
 *
 * FixedFloat known statuses:
 *   NEW       → Order created, awaiting deposit
 *   PENDING   → Deposit detected, waiting confirmations
 *   EXCHANGE  → Actively converting
 *   WITHDRAW  → Sending converted funds out
 *   DONE      → Order fully complete ✅
 *   EXPIRED   → Order expired before deposit
 *   EMERGENCY → Requires manual intervention
 *   REFUND    → Refund in progress
 *
 * Source: https://ff.io/docs#statuses
 */
function mapFixedFloatStatus(ffStatus) {
	if (!ffStatus) return null;

	const s = String(ffStatus).toUpperCase();

	switch (s) {
		case "NEW":
			return "ff_awaiting"; // Waiting for user to deposit

		case "PENDING":
			return "ff_converting"; // Deposit seen, waiting for confirmations

		case "EXCHANGE":
			return "ff_converting"; // Actively swapping

		case "WITHDRAW":
			return "ff_converting"; // Sending out converted coins (almost done)

		case "DONE":
			return "ff_done"; // Conversion complete ✅ → trigger PayCrest

		case "EXPIRED":
			return "expired";

		case "EMERGENCY":
		case "REFUND":
			return "failed";

		default:
			return null; // Unknown — don't update status
	}
}

/**
 * Returns true if FixedFloat order is still "active" (needs polling)
 */
function isFixedFloatActive(ffStatus) {
	if (!ffStatus) return true;
	const s = String(ffStatus).toUpperCase();
	return ["NEW", "PENDING", "EXCHANGE", "WITHDRAW"].includes(s);
}

/**
 * Returns true if FixedFloat conversion is complete
 */
function isFixedFloatDone(ffStatus) {
	return String(ffStatus).toUpperCase() === "DONE";
}

/**
 * Returns true if FixedFloat order is in a terminal failed state
 */
function isFixedFloatTerminal(ffStatus) {
	const s = String(ffStatus).toUpperCase();
	return ["EXPIRED", "EMERGENCY", "REFUND"].includes(s);
}

module.exports = {
	mapFixedFloatStatus,
	isFixedFloatActive,
	isFixedFloatDone,
	isFixedFloatTerminal,
};
