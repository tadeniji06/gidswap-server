/**
 * Canonical Paycrest status mapper
 * Handles both forms: "payment_order.settled" and "settled"
 * Maps to our Transaction schema enums
 */
function mapPaycrestStatus(status) {
	if (!status) return "pending";

	// Normalize to lowercase and remove prefix if present
	const normalized = String(status)
		.toLowerCase()
		.replace("payment_order.", "");

	console.log(`🗺️ Mapping status: "${status}" -> normalized: "${normalized}"`);

	switch (normalized) {
		// Initial states
		case "pending":
		case "initiated":
			return "pending";

		// Payment in progress
		case "processing":
		case "assigned":
			return "processing";

		// Provider completed payment
		case "fulfilled":
		case "completed":
			return "fulfilled";

		// System validated the payment
		case "validated":
		case "confirmed":
			return "validated";

		// Blockchain settlement complete
		case "settled":
		case "finalized":
			return "settled";

		// Failure states
		case "cancelled":
		case "canceled":
			return "cancelled";

		case "refunded":
			return "refunded";

		case "expired":
			return "expired";

		case "failed":
		case "error":
			return "failed";

		// Unknown status - default to pending to avoid breaking UI
		default:
			console.warn(`⚠️ Unknown Paycrest status: "${status}", defaulting to "pending"`);
			return "pending";
	}
}

module.exports = { mapPaycrestStatus };