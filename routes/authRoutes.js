const express = require("express");
const router = express.Router();
const passport = require("../config/passport");
const authControllers = require("../controllers/authControllers");
const { generateJWT } = require("../utils/jwt");

// --- Regular auth routes ---
router.post("/login", async (req, res) => {
	try {
		const user = await authControllers.login(req, res);
		if (!user) {
			return res
				.status(401)
				.json({ success: false, message: "Invalid credentials" });
		}

		const token = generateJWT(user);
		return res.status(200).json({
			success: true,
			message: "Login successful",
			token,
			user: {
				id: user._id,
				fullName: user.fullName,
				email: user.email,
				isGoogleAuth: user.isGoogleAuth,
			},
		});
	} catch (error) {
		console.error("Login error:", error);
		return res.status(500).json({
			success: false,
			message: "Server error",
			error: error.message,
		});
	}
});

router.post("/signup", async (req, res) => {
	try {
		const user = await authControllers.signUp(req, res);
		if (!user) {
			return res
				.status(400)
				.json({ success: false, message: "Signup failed" });
		}

		const token = generateJWT(user);
		return res.status(201).json({
			success: true,
			message: "Signup successful",
			token,
			user: {
				id: user._id,
				fullName: user.fullName,
				email: user.email,
				isGoogleAuth: user.isGoogleAuth,
			},
		});
	} catch (error) {
		console.error("Signup error:", error);
		return res.status(500).json({
			success: false,
			message: "Server error",
			error: error.message,
		});
	}
});

// Check email
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
				return res.redirect(
					`https://gidswapv2-indol.vercel.app?error=google_auth_failed`
				);
			}

			// Generate JWT
			const token = generateJWT(req.user);

			// Redirect with token only
			return res.redirect(
				`https://gidswapv2-indol.vercel.app/auth/callback?token=${token}`
			);
		} catch (error) {
			console.error("Google OAuth error:", error);
			return res.redirect(
				`https://gidswapv2-indol.vercel.app?error=server_error`
			);
		}
	}
);

module.exports = router;
