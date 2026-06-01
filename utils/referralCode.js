const crypto = require("crypto");
const User = require("../models/User");

const buildReferralCode = () =>
	`${crypto.randomBytes(4).toString("hex")}${Math.floor(Math.random() * 10000)}`;

const generateUniqueReferralCode = async () => {
	let code;
	let exists = true;

	while (exists) {
		code = buildReferralCode();
		exists = await User.exists({ referralCode: code });
	}

	return code;
};

module.exports = {
	generateUniqueReferralCode,
};
