/**
 * Canonical Paycrest status mapper
 * Maps Paycrest webhook/polling status → our DB enum values
 */
function mapPaycrestStatus(status) {
	switch (status) {
		case "payment_order.pending":
			return "pending"; // Order created, waiting for provider
		case "payment_order.processing":
			return "processing"; // Provider assigned
		case "payment_order.fulfilled":
		case "payment_order.completed":
			return "fulfilled"; // Provider completed payment
		case "payment_order.validated":
			return "validated"; // Funds delivered to recipient bank
		case "payment_order.settled":
			return "settled"; // Blockchain settlement
		case "payment_order.cancelled":
			return "cancelled"; // Cancelled
		case "payment_order.refunded":
			return "refunded"; // Refunded
		case "payment_order.expired":
			return "expired"; // Expired
		case "payment_order.failed":
			return "failed"; // Failed
		default:
			return "pending"; // fallback
	}
}

module.exports = { mapPaycrestStatus };
