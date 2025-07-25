const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/user");

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

		// Hash password
		const hashedPassword = await bcrypt.hash(password, 12);

		// Create user
		const user = new User({
			fullName,
			email,
			password: hashedPassword,
		});

		await user.save();

		// Generate JWT
		const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
			expiresIn: "7d",
		});

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

		// Generate JWT
		const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
			expiresIn: "7d",
		});

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
