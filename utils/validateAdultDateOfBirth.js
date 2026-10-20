module.exports = (value) => {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}

	const [year, month, day] = value.split("-").map(Number);
	const birthDate = new Date(Date.UTC(year, month - 1, day));
	if (
		birthDate.getUTCFullYear() !== year ||
		birthDate.getUTCMonth() !== month - 1 ||
		birthDate.getUTCDate() !== day
	) {
		return false;
	}

	const today = new Date();
	const eighteenthBirthday = new Date(
		Date.UTC(year + 18, month - 1, day),
	);
	return eighteenthBirthday <= new Date(
		Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
	);
};
