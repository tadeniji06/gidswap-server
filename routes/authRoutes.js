const express = require("express");
const router = express.Router();
const passport = require("../config/passport");
const authControllers = require("../controllers/authControllers");
const { generateJWT } = require("../utils/jwt");

// --- Regular auth routes ---
router.post("/login", authControllers.login);

router.post("/signup", authControllers.signUp);

// Check email
router.post("/check-email", authControllers.checkEmailExists);
router.post("/verify-email", authControllers.verifyEmail);
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
				return res.redirect(`https://www.gidswap.com`);
			}

			// Generate JWT
			const token = generateJWT(req.user);

			// Redirect with token only
			return res.redirect(
				`https://www.gidswap.com/auth/callback?token=${token}`
			);
		} catch (error) {
			console.error("Google OAuth error:", error);
			return res.redirect(`https://www.gidswap.com`);
		}
	}
);

module.exports = router;
