const axios = require("axios");
require("dotenv").config();

const BASE_URL = process.env.PAY_CREST_API;
const API_KEY = process.env.PAY_CREST_API_KEY;

const defaultHeaders = {
	Accept: "application/json",
	"Content-Type": "application/json; charset=UTF-8",
	"API-Key": API_KEY,
};

module.exports = {
	initOrder: async (payload) => {
		try {
			const res = await axios.post(
				`${BASE_URL}/sender/orders`,
				payload,
				{ headers: defaultHeaders }
			);
			return res.data;
		} catch (error) {
			console.error("PayCrest InitOrder Error:", {
				status: error.response?.status,
				statusText: error.response?.statusText,
				data: error.response?.data,
			});
			throw error;
		}
	},

	getSupportedBanks: async (currency_code) => {
		try {
			const res = await axios.get(
				`${BASE_URL}/institutions/${currency_code}`,
				{ headers: defaultHeaders }
			);
			return res.data;
		} catch (error) {
			console.error(
				"PayCrest Banks API Error:",
				error.response?.data || error.message
			);
			throw error;
		}
	},

	verifyAccount: async (payload) => {
		try {
			const res = await axios.post(
				`${BASE_URL}/verify-account`,
				payload,
				{ headers: defaultHeaders }
			);
			return res.data;
		} catch (error) {
			console.error(
				"PayCrest VerifyAccount Error:",
				error.response?.data || error.message
			);
			throw error;
		}
	},

	getTokenRate: async ({ token, amount, fiat }) => {
		try {
			const res = await axios.get(
				`${BASE_URL}/rates/${token}/${amount}/${fiat}`,
				{ headers: defaultHeaders }
			);
			return res.data;
		} catch (error) {
			console.error(
				"PayCrest TokenRate Error:",
				error.response?.data || error.message
			);
			throw error;
		}
	},

	getSupportedCurrencies: async () => {
		try {
			const res = await axios.get(`${BASE_URL}/currencies`, {
				headers: defaultHeaders,
			});
			return res.data;
		} catch (error) {
			console.error(
				"PayCrest Currencies Error:",
				error.response?.data || error.message
			);
			throw error;
		}
	},

	getSupportedTokens: async () => {
		try {
			const res = await axios.get(`${BASE_URL}/tokens`, {
				headers: defaultHeaders,
			});
			return res.data;
		} catch (error) {
			console.error(
				"PayCrest Tokens Error:",
				error.response?.data || error.message
			);
			throw error;
		}
	},
};
