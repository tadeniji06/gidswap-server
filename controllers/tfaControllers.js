const User = require("../models/User");
const { generateSecret, generateURI, verifySync } = require("otplib");
const qrcode = require("qrcode");

exports.setupTFA = async (req, res) => {
	try {
		const userId = req.user.id;
		const user = await User.findById(userId);

		if (!user) return res.status(404).json({ message: "User not found" });

		// Generate a secret
		const secret = generateSecret();
		
		// Save the secret temporarily or permanently, but don't enable yet
		user.twoFactorSecret = secret;
		user.isTwoFactorEnabled = false;
		await user.save();

		const otpauth = generateURI({ label: user.email, issuer: "Gidswap", secret });

		qrcode.toDataURL(otpauth, (err, imageUrl) => {
			if (err) {
				return res.status(500).json({ message: "Error generating QR code" });
			}
			res.json({ secret, qrCodeUrl: imageUrl });
		});
	} catch (error) {
		console.error("Error setting up 2FA:", error);
		res.status(500).json({ message: "Internal server error" });
	}
};

exports.verifyTFA = async (req, res) => {
	try {
		const { token } = req.body;
		const userId = req.user.id;
		
		if (!token) return res.status(400).json({ message: "Token is required" });

		const user = await User.findById(userId);
		if (!user || !user.twoFactorSecret) {
			return res.status(400).json({ message: "2FA setup not initialized" });
		}

		const isValid = verifySync({
			token,
			secret: user.twoFactorSecret,
		});

		if (isValid) {
			user.isTwoFactorEnabled = true;
			await user.save();
			res.json({ success: true, message: "2FA enabled successfully" });
		} else {
			res.status(400).json({ message: "Invalid 2FA token" });
		}
	} catch (error) {
		console.error("Error verifying 2FA:", error);
		res.status(500).json({ message: "Internal server error" });
	}
};

exports.disableTFA = async (req, res) => {
	try {
		const { token } = req.body;
		const userId = req.user.id;

		if (!token) return res.status(400).json({ message: "Token is required" });

		const user = await User.findById(userId);
		if (!user || !user.isTwoFactorEnabled) {
			return res.status(400).json({ message: "2FA is not enabled" });
		}

		const isValid = verifySync({
			token,
			secret: user.twoFactorSecret,
		});

		if (isValid) {
			user.isTwoFactorEnabled = false;
			user.twoFactorSecret = null;
			await user.save();
			res.json({ success: true, message: "2FA disabled successfully" });
		} else {
			res.status(400).json({ message: "Invalid 2FA token" });
		}
	} catch (error) {
		console.error("Error disabling 2FA:", error);
		res.status(500).json({ message: "Internal server error" });
	}
};

exports.checkTFAStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        res.json({ isTwoFactorEnabled: user.isTwoFactorEnabled });
    } catch(err) {
        res.status(500).json({ message: "Internal server error" });
    }
};
