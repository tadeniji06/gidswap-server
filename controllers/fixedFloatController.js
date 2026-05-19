const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

const BASE_URL = process.env.FIXFLOAT_API;
const API_KEY = process.env.FIXFLOAT_API_KEY;
const API_SECRET = process.env.FIXFLOAT_API_SECRET;
const DEFAULT_REFCODE = process.env.FIXFLOAT_REFCODE;
const DEFAULT_AFFTAX = process.env.FIXFLOAT_AFFTAX;

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

const buildOrderPayload = (payload = {}) => {
	const orderPayload = { ...payload };

	if (!orderPayload.refcode && DEFAULT_REFCODE) {
		orderPayload.refcode = DEFAULT_REFCODE;
	}

	if (orderPayload.afftax == null && DEFAULT_AFFTAX != null) {
		const parsed = parseFloat(DEFAULT_AFFTAX);
		if (!Number.isNaN(parsed)) {
			orderPayload.afftax = parsed;
		}
	}

	return orderPayload;
};

const ensureAffiliatePayload = (payload = {}) => {
	const orderPayload = buildOrderPayload(payload);
	const missingFields = [];

	if (!orderPayload.refcode) missingFields.push("refcode");
	if (orderPayload.afftax == null) missingFields.push("afftax");

	if (missingFields.length) {
		throw new Error(
			`FixedFloat create order requires affiliate fields: ${missingFields.join(", ")}. Include them in the request body or set FIXFLOAT_REFCODE and FIXFLOAT_AFFTAX.`,
		);
	}

	return orderPayload;
};

module.exports = {
	createOrder: async (payload) => {
		const orderPayload = ensureAffiliatePayload(payload);
		const res = await axios.post(`${BASE_URL}/create`, orderPayload, {
			headers: headersFor(orderPayload),
		});
		return res.data;
	},

	getRate: async (payload) => {
		const ratePayload = buildOrderPayload(payload);
		const res = await axios.post(`${BASE_URL}/price`, ratePayload, {
			headers: headersFor(ratePayload),
		});
		return res.data;
	},

	getCurrencies: async () => {
		const res = await axios.post(
			`${BASE_URL}/ccies`,
			{},
			{
				headers: headersFor({}),
			},
		);
		return res.data;
	},
};
