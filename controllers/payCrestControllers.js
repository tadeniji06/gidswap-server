const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

const BASE_URL = process.env.PAY_CREST_API;
const API_KEY = process.env.PAY_CREST_API_KEY;
const API_SECRET = process.env.PAY_CREST_API_SECRET;

const signPayload = (payload) => {
	const jsonPayload = JSON.stringify(payload);
	return crypto
		.createHmac("sha256", API_SECRET)
		.update(jsonPayload)
		.digest("hex");
};

const headersFor = (payload = {}) => {
	const signature = signPayload(payload);

	return {
		Accept: "application/json",
		"Content-Type": "application/json; charset=UTF-8",
		"API-Key": API_KEY,
		Authorization: `HMAC ${API_KEY}:${signature}`,
	};
};

module.exports = {
	initOrder: async (payload) => {
		try {
			const headers = headersFor(payload);
			const res = await axios.post(
				`${BASE_URL}/sender/orders`,
				payload,
				{ headers }
			);

			console.log(
				"PayCrest order created successfully:",
				res.data
			);
			return res.data;
		} catch (error) {
			console.error("PayCrest API Error:", {
				status: error.response?.status,
				statusText: error.response?.statusText,
				data: error.response?.data,
			});
			throw error;
		}
	},

	getSupportedBanks: async (currency_code) => {
		try {
			const headers = headersFor();
			const res = await axios.get(
				`${BASE_URL}/institutions/${currency_code}`,
				{ headers }
			);
			return res.data;
		} catch (error) {
			console.error("PayCrest Banks API Error:", {
				status: error.response?.status,
				statusText: error.response?.statusText,
				data: error.response?.data,
			});
			throw error;
		}
	},

	verifyAccount: async (payload) => {
		try {
			const headers = headersFor(payload);
			const res = await axios.post(
				`${BASE_URL}/verify-account`,
				payload,
				{
					headers,
				}
			);
			return res.data;
		} catch (error) {
			console.error(error);
		}
	},

	getTokenRate: async ({ token, amount, fiat }) => {
		try {
			const headers = headersFor();
			const res = await axios.get(
				`${BASE_URL}/rates/${token}/${amount}/${fiat}`,
				{ headers }
			);
			return res.data;
		} catch (error) {
			console.error(error);
		}
	},

	getSupportedCurrencies: async () => {
		try {
			const headers = headersFor();
			const res = await axios.get(`${BASE_URL}/currencies`, {
				headers,
			});
			return res.data;
		} catch (error) {
			console.error(error);
		}
	},
	getSupportedTokens: async () => {
		try {
			const headers = headersFor();
			const res = await axios.get(`${BASE_URL}/tokens`, {
				headers,
			});
			return res.data;
		} catch (error) {
			console.error(error);
		}
	},
};
