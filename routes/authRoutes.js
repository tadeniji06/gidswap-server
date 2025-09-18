const express = require("express");
const router = express.Router();
const passport = require("../config/passport");
const authControllers = require("../controllers/authControllers");
const { generateJWT } = require("../utils/jwt");

// --- Regular auth routes ---
router.post("/login", authControllers.login);
router.post("/signup", authControllers.signUp);
router.post("/check-email", authControllers.checkEmailExists);
router.post("/request-otp", authControllers.requestOtp);
router.post("/verify-otp", authControllers.verifyOtp);
router.post("/reset-password", authControllers.resetPassword);

// --- Google OAuth ---
router.get(
	"/google",
	passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
	"/callback",
	passport.authenticate("google", { session: false }),
	async (req, res) => {
		try {
			if (!req.user) {
				return res.status(401).json({
					success: false,
					message: "Google authentication failed",
				});
			}

			// Generate JWT
			const token = generateJWT(req.user);

			res.status(200).json({
				success: true,
				message: "Google authentication successful",
				token,
				user: {
					id: req.user._id,
					fullName: req.user.fullName,
					email: req.user.email,
					isGoogleAuth: req.user.isGoogleAuth,
				},
			});
		} catch (error) {
			console.error("JWT generation error:", error);
			res.status(500).json({
				success: false,
				message: "Server error during Google OAuth",
				error: error.message,
			});
		}
	}
);

module.exports = router;
