const jwt = require("jsonwebtoken");
const User = require("../models/User");
const JWT_SECRET = process.env.JWT_SECRET;

module.exports = async (req, res, next) => {
	try {
		const authHeader = req.headers.authorization;

		// Must be "Bearer <token>" — reject anything else immediately
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return res.status(401).json({ message: "Not authorized: missing or malformed Authorization header" });
		}

		const token = authHeader.split(" ")[1];
		if (!token || token.trim() === "") {
			return res.status(401).json({ message: "Not authorized: token is empty" });
		}

		let decoded;
		try {
			decoded = jwt.verify(token, JWT_SECRET);
		} catch (jwtErr) {
			const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";

			if (jwtErr.name === "TokenExpiredError") {
				console.warn(`[Auth] Expired token from IP: ${ip}`);
				return res.status(401).json({ message: "Token has expired. Please log in again." });
			}

			// Log suspicious probing (malformed tokens are a red flag)
			console.warn(`[Auth] ⚠️ Suspicious request — ${jwtErr.name} from IP: ${ip} | UA: ${req.headers["user-agent"] || "unknown"}`);
			return res.status(401).json({ message: "Token invalid or expired" });
		}

		if (!decoded?.userId) {
			return res.status(401).json({ message: "Token payload is invalid" });
		}

		const user = await User.findById(decoded.userId).select("-password -currentOtp -kyc.bvn -kyc.nin");
		if (!user) {
			return res.status(401).json({ message: "User not found" });
		}

		req.user = user;
		next();
	} catch (err) {
		console.error("[Auth] Unexpected middleware error:", err);
		return res.status(500).json({ message: "Internal server error" });
	}
};
