const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

const BASE_URL = process.env.FIXFLOAT_API;
const API_KEY = process.env.FIXFLOAT_API_KEY;
const API_SECRET = process.env.FIXFLOAT_API_SECRET;

const signPayload = (payload) => {
	const jsonPayload = payload ? JSON.stringify(payload) : "{}";
	return crypto
		.createHmac("sha256", API_SECRET)
		.update(jsonPayload)
		.digest("hex");
};

const headersFor = (payload = {}) => ({
	Accept: "application/json",
	"Content-Type": "application/json; charset=UTF-8",
	"X-API-KEY": API_KEY,
	"X-API-SIGN": signPayload(payload),
});

module.exports = {
	createOrder: async (payload) => {
		const res = await axios.post(`${BASE_URL}/create`, payload, {
			headers: headersFor(payload),
		});
		return res.data;
	},

	getRate: async (payload) => {
		const res = await axios.post(`${BASE_URL}/price`, payload, {
			headers: headersFor(payload),
		});
		return res.data;
	},

	getCurrencies: async () => {
		const res = await axios.post(
			`${BASE_URL}/ccies`,
			{},
			{
				headers: headersFor({}),
			}
		);
		return res.data;
	},
};
