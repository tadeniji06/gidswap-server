/**
 * Canonical Paycrest status mapper
 * Maps Paycrest webhook/polling status → our DB enum values
 */
function mapPaycrestStatus(paycrestStatus) {
	switch (paycrestStatus) {
		case "initiated":
		case "order_initiated":
			return "pending";
		case "crypto_deposited":
			return "processing"; // optional intermediate step
		case "settled":
		case "order_settled":
			return "completed"; // or "success"
		case "failed":
		case "cancelled":
			return "failed";
		default:
			return "pending";
	}
}


module.exports = { mapPaycrestStatus };
