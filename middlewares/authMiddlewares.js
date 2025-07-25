const jwt = require("jsonwebtoken");
const User = require("../models/user");
const JWT_SECRET = process.env.JWT_SECRET;

module.exports = async (req, res, next) => {
	try {
		const token = req.headers.authorization?.split(" ")[1];
		if (!token)
			return res.status(401).json({ message: "Not authorized" });
		// console.log("JWT_SECRET used in middleware:", JWT_SECRET);

		const decoded = jwt.verify(token, JWT_SECRET);
		// console.log(`JWT`, JWT_SECRET);
		const user = await User.findById(decoded.userId);
		if (!user)
			return res.status(401).json({ message: "User not found" });

		req.user = user;
		next();
	} catch (err) {
		console.error("Auth middleware error:", err);
		res.status(401).json({ message: "Token invalid or expired" });
	}
};
