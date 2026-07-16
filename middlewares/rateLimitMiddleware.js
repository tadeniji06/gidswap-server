const rateLimit = require("express-rate-limit");

/**
 * Auth rate limiter — applies to /login, /signup, /request-otp
 * Max 10 attempts per IP per 15 minutes
 */
const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		success: false,
		message: "Too many requests from this IP. Please try again in 15 minutes.",
	},
	handler: (req, res, next, options) => {
		const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
		console.warn(`[RateLimit] ⚠️ Auth rate limit exceeded — IP: ${ip}`);
		res.status(429).json(options.message);
	},
});

/**
 * Sensitive update rate limiter — applies to account update endpoints
 * Max 20 updates per IP per 10 minutes
 */
const updateLimiter = rateLimit({
	windowMs: 10 * 60 * 1000, // 10 minutes
	max: 20,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		success: false,
		message: "Too many update requests. Please slow down.",
	},
	handler: (req, res, next, options) => {
		const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
		console.warn(`[RateLimit] ⚠️ Update rate limit exceeded — IP: ${ip}`);
		res.status(429).json(options.message);
	},
});

module.exports = { authLimiter, updateLimiter };
