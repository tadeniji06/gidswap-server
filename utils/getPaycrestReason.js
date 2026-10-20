function getPaycrestReason(order) {
	const data = order?.data || order || {};
	const candidates = [
		data.refundReason,
		data.refund_reason,
		data.failureReason,
		data.failure_reason,
		data.reason,
		typeof data.error === "string" ? data.error : data.error?.message,
		data.error?.description,
		typeof data.details === "string" ? data.details : data.details?.message,
		data.details?.reason,
		data.description,
		data.message,
		order?.message,
	];

	const directReason = candidates.find(
		(value) => typeof value === "string" && value.trim(),
	);
	if (directReason) return directReason.trim().slice(0, 500);

	const findNestedReason = (value, depth = 0) => {
		if (!value || typeof value !== "object" || depth >= 4) return null;
		for (const [key, child] of Object.entries(value)) {
			if (
				/(reason|message|error|description)/i.test(key) &&
				typeof child === "string" &&
				child.trim()
			) {
				return child.trim().slice(0, 500);
			}
			const nestedReason = findNestedReason(child, depth + 1);
			if (nestedReason) return nestedReason;
		}
		return null;
	};

	return findNestedReason(data);
}

module.exports = { getPaycrestReason };
