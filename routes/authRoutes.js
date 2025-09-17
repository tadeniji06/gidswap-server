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
	passport.authenticate("google", {
		failureRedirect: "/",
		session: false,
	}),
	async (req, res) => {
		try {
			// Generate JWT for logged-in user
			const token = generateJWT(req.user);

			// Redirect to frontend with token
			res.redirect(
				`https://gidswapv2-indol.vercel.app/dashboard?token=${token}`
			);
		} catch (error) {
			console.error("JWT generation error:", error);
			res.redirect(
				"https://gidswapv2-indol.vercel.app/?error=oauth_failed"
			);
		}
	}
);

module.exports = router;
