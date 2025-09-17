const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const emailjs = require("@emailjs/nodejs");
const {
	getClientIP,
	getUserAgent,
} = require("../helpers/getClientIP");
const passport = require("passport");

const JWT_SECRET = process.env.JWT_SECRET;

// SIGNUP Controller
exports.signUp = async (req, res) => {
	try {
		const { fullName, email, password } = req.body;

		if (!fullName || !email || !password) {
			return res
				.status(400)
				.json({ message: "All fields are required." });
		}

		// Check if user already exists
		const existingUser = await User.findOne({ email });
		if (existingUser) {
			return res
				.status(409)
				.json({ message: "Email already registered." });
		}

		// Get IP and User-Agent
		const ipAddress = getClientIP(req);
		const userAgent = getUserAgent(req);

		// Hash password
		const hashedPassword = await bcrypt.hash(password, 12);

		// Create user with IP and User-Agent info
		const user = new User({
			fullName,
			email,
			password: hashedPassword,
			ipAddress,
			userAgent,
			lastLoginIP: ipAddress,
			lastLoginUserAgent: userAgent,
			lastLoginAt: new Date(),
		});

		await user.save();

		// Generate JWT
		const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
			expiresIn: "7d",
		});

		console.log(
			`New user signup - IP: ${ipAddress}, User-Agent: ${userAgent}`
		);

		res.status(201).json({
			message: "Signup successful",
			token,
			user: {
				id: user._id,
				fullName: user.fullName,
				email: user.email,
			},
		});
	} catch (error) {
		console.error("Signup error:", error);
		res.status(500).json({ message: "Internal server error." });
	}
};

// CHECK EMAIL EXISTS Controller
exports.checkEmailExists = async (req, res) => {
	try {
		const { email } = req.body;

		if (!email) {
			return res.status(400).json({
				message: "Email is required.",
				exists: false,
			});
		}

		// Check if user exists
		const existingUser = await User.findOne({ email });

		res.status(200).json({
			exists: !!existingUser, // converts to boolean
		});
	} catch (error) {
		console.error("Check email error:", error);
		res.status(500).json({
			message: "Internal server error.",
			exists: false,
		});
	}
};

// LOGIN Controller
exports.login = async (req, res) => {
	try {
		const { email, password } = req.body;

		if (!email || !password) {
			return res
				.status(400)
				.json({ message: "Email and password are required." });
		}

		// Find user
		const user = await User.findOne({ email });
		if (!user) {
			return res
				.status(401)
				.json({ message: "Invalid credentials." });
		}

		// Compare password
		const isMatch = await bcrypt.compare(password, user.password);
		if (!isMatch) {
			return res
				.status(401)
				.json({ message: "Invalid credentials." });
		}

		// Get IP and User-Agent for login tracking
		const ipAddress = getClientIP(req);
		const userAgent = getUserAgent(req);

		// Update last login info
		await User.updateOne(
			{ _id: user._id },
			{
				lastLoginIP: ipAddress,
				lastLoginUserAgent: userAgent,
				lastLoginAt: new Date(),
			}
		);

		// Generate JWT
		const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
			expiresIn: "7d",
		});

		console.log(
			`User login - Email: ${email}, IP: ${ipAddress}, User-Agent: ${userAgent}`
		);

		res.status(200).json({
			message: "Login successful",
			token,
			user: {
				id: user._id,
				fullName: user.fullName,
				email: user.email,
			},
		});
	} catch (error) {
		console.error("Login error:", error);
		res.status(500).json({ message: "Internal server error." });
	}
};

const otpStore = {};

// Generate 6-digit OTP
const generateOtp = () =>
	Math.floor(100000 + Math.random() * 900000).toString();

// REQUEST OTP
exports.requestOtp = async (req, res) => {
	try {
		const { email } = req.body;
		if (!email)
			return res.status(400).json({ message: "Email is required." });

		const user = await User.findOne({ email });
		if (!user)
			return res.status(404).json({ message: "User not found." });

		const otp = generateOtp();
		otpStore[email] = {
			code: otp,
			expiresAt: Date.now() + 5 * 60 * 1000,
		}; // 5 mins

		// send email via EmailJS
		await emailjs.send(
			process.env.EMAIL_JS_SERVICE_ID,
			process.env.EMAIL_JS_TEMPLATE_ID,
			{ otp_code: otp, to_email: email },
			{
				publicKey: process.env.EMAIL_JS_PUBLIC_KEY,
				privateKey: process.env.EMAIL_JS_PRIVATE_KEY,
			}
		);

		res.json({ message: "OTP sent to email." });
	} catch (error) {
		console.error("OTP error:", error);
		res.status(500).json({ message: "Internal server error." });
	}
};

// VERIFY OTP
exports.verifyOtp = (req, res) => {
	try {
		const { email, otp } = req.body;
		if (!email || !otp)
			return res
				.status(400)
				.json({ message: "Email and OTP required." });

		const record = otpStore[email];
		if (!record)
			return res
				.status(400)
				.json({ message: "No OTP requested for this email." });

		if (Date.now() > record.expiresAt) {
			delete otpStore[email];
			return res.status(400).json({ message: "OTP expired." });
		}

		if (record.code !== otp)
			return res.status(400).json({ message: "Invalid OTP." });

		// OTP verified — issue short-lived reset token
		const resetToken = jwt.sign({ email }, JWT_SECRET, {
			expiresIn: "15m",
		});

		res.json({ message: "OTP verified.", resetToken });
	} catch (error) {
		console.error("Verify OTP error:", error);
		res.status(500).json({ message: "Internal server error." });
	}
};

// RESET PASSWORD
exports.resetPassword = async (req, res) => {
	try {
		const { resetToken, newPassword } = req.body;
		if (!resetToken || !newPassword) {
			return res
				.status(400)
				.json({ message: "Token and new password required." });
		}

		const decoded = jwt.verify(resetToken, JWT_SECRET);
		const hashedPassword = await bcrypt.hash(newPassword, 12);

		await User.updateOne(
			{ email: decoded.email },
			{ password: hashedPassword }
		);

		res.json({ message: "Password reset successful." });
	} catch (error) {
		console.error("Reset password error:", error);
		res.status(500).json({ message: "Invalid or expired token." });
	}
};

// GOOGLE AUTH INITIATE
exports.googleAuth = (req, res, next) => {
	passport.authenticate("google", {
		scope: ["profile", "email"],
	})(req, res, next);
};

// GOOGLE AUTH CALLBACK
exports.googleCallback = async (req, res, next) => {
	passport.authenticate(
		"google",
		{ session: false },
		async (err, user) => {
			if (err) {
				console.error("Google callback error:", err);
				return res.redirect(
					`${
						process.env.CLIENT_URL || "http://localhost:3000"
					}/login?error=auth_failed`
				);
			}

			if (!user) {
				return res.redirect(
					`${
						process.env.CLIENT_URL || "http://localhost:3000"
					}/login?error=auth_cancelled`
				);
			}

			try {
				// Get IP and User-Agent for login tracking
				const ipAddress = getClientIP(req);
				const userAgent = getUserAgent(req);

				// Update last login info
				await User.updateOne(
					{ _id: user._id },
					{
						lastLoginIP: ipAddress,
						lastLoginUserAgent: userAgent,
						lastLoginAt: new Date(),
						// Set initial IP info if not set (for new OAuth users)
						...((!user.ipAddress || !user.userAgent) && {
							ipAddress: ipAddress,
							userAgent: userAgent,
						}),
					}
				);

				// Generate JWT
				const token = jwt.sign(
					{ userId: user._id },
					process.env.JWT_SECRET,
					{ expiresIn: "7d" }
				);

				console.log(
					`Google OAuth login - Email: ${user.email}, IP: ${ipAddress}`
				);

				// Redirect to frontend with token
				const redirectURL = `${
					process.env.CLIENT_URL || "http://localhost:3000"
				}/auth-success?token=${token}`;
				res.redirect(redirectURL);
			} catch (error) {
				console.error("Token generation error:", error);
				res.redirect(
					`${
						process.env.CLIENT_URL || "http://localhost:3000"
					}/login?error=token_failed`
				);
			}
		}
	)(req, res, next);
};
