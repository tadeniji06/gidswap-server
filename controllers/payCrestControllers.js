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
			const baseUrl = BASE_URL.replace("/v1", "/v2");
			
			// --- AUTO-MIGRATE V1 TO V2 SCHEMA ---
			// If we see legacy top-level 'token' or 'network', it's a v1 payload.
			// We wrap it in the v2 source/destination shape for PayCrest v2.
			let v2Payload = payload;
			if (payload.token || (payload.recipient && !payload.destination)) {
				console.log("🔄 Migrating V1 payload to V2...");
				v2Payload = {
					amount: payload.amount?.toString(),
					amountIn: payload.amountIn || "crypto",
					rate: payload.rate?.toString(),
					reference: payload.reference,
					senderFeePercent: payload.senderFeePercent,
					source: {
						type: "crypto",
						currency: payload.token,
						network: payload.network,
						refundAddress: payload.returnAddress
					},
					destination: {
						type: "fiat",
						currency: payload.recipient?.currency || "NGN",
						recipient: payload.recipient
					}
				};
			}

			const res = await axios.post(
				`${baseUrl}/sender/orders`,
				v2Payload,
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
			const baseUrl = BASE_URL.replace("/v1", "/v2");
			const res = await axios.post(
				`${baseUrl}/verify-account`,
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

	getTokenRate: async ({ network, token, amount, fiat, side }) => {
		try {
			const baseUrl = BASE_URL.replace("/v1", "/v2");
			
			// V2 REQUIRES a network segment. If missing, we try to guess it.
			// Defaulting to 'bnb-smart-chain' as a safe common denominator if absolutely missing.
			const safeNetwork = network || "bnb-smart-chain";
			
			let endpoint = `${baseUrl}/rates/${safeNetwork}/${token}/${amount}/${fiat}`;
			
			if (side) {
				endpoint += `?side=${side}`;
			}

			const res = await axios.get(endpoint, {
				headers: defaultHeaders,
			});
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
