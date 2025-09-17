const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET;

// GET USER PROFILE - Always returns authenticated user's details
exports.getUserProfile = async (req, res) => {
	try {
		// req.user is set by auth middleware
		const user = req.user;

		res.status(200).json({
			message: "User profile retrieved successfully",
			user: {
				id: user._id,
				fullName: user.fullName,
				email: user.email,
				ipAddress: user.ipAddress,
				userAgent: user.userAgent,
				lastLoginIP: user.lastLoginIP,
				lastLoginUserAgent: user.lastLoginUserAgent,
				lastLoginAt: user.lastLoginAt,
				createdAt: user.createdAt,
			},
		});
	} catch (error) {
		console.error("Get user profile error:", error);
		res.status(500).json({ message: "Internal server error." });
	}
};

// UPDATE USER PROFILE (Full Name only)
exports.updateProfile = async (req, res) => {
	try {
		const { fullName } = req.body;
		const userId = req.user._id;

		if (!fullName || fullName.trim().length === 0) {
			return res.status(400).json({ 
				message: "Full name is required." 
			});
		}

		// Update user profile
		const updatedUser = await User.findByIdAndUpdate(
			userId,
			{ fullName: fullName.trim() },
			{ new: true, runValidators: true }
		);

		if (!updatedUser) {
			return res.status(404).json({ message: "User not found." });
		}

		res.status(200).json({
			message: "Profile updated successfully",
			user: {
				id: updatedUser._id,
				fullName: updatedUser.fullName,
				email: updatedUser.email,
			},
		});
	} catch (error) {
		console.error("Update profile error:", error);
		res.status(500).json({ message: "Internal server error." });
	}
};

// UPDATE EMAIL ADDRESS
exports.updateEmail = async (req, res) => {
	try {
		const { newEmail, password } = req.body;
		const userId = req.user._id;

		if (!newEmail || !password) {
			return res.status(400).json({ 
				message: "New email and current password are required." 
			});
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(newEmail)) {
			return res.status(400).json({ 
				message: "Invalid email format." 
			});
		}

		// Get current user
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found." });
		}

		// Verify current password
		const isPasswordValid = await bcrypt.compare(password, user.password);
		if (!isPasswordValid) {
			return res.status(401).json({ 
				message: "Invalid current password." 
			});
		}

		// Check if new email already exists
		const existingUser = await User.findOne({ email: newEmail });
		if (existingUser && existingUser._id.toString() !== userId.toString()) {
			return res.status(409).json({ 
				message: "Email already in use." 
			});
		}

		// Update email
		const updatedUser = await User.findByIdAndUpdate(
			userId,
			{ email: newEmail },
			{ new: true, runValidators: true }
		);

		// Generate new JWT with updated info
		const token = jwt.sign({ userId: updatedUser._id }, JWT_SECRET, {
			expiresIn: "7d",
		});

		res.status(200).json({
			message: "Email updated successfully",
			token,
			user: {
				id: updatedUser._id,
				fullName: updatedUser.fullName,
				email: updatedUser.email,
			},
		});
	} catch (error) {
		console.error("Update email error:", error);
		res.status(500).json({ message: "Internal server error." });
	}
};

// CHANGE PASSWORD
exports.changePassword = async (req, res) => {
	try {
		const { currentPassword, newPassword } = req.body;
		const userId = req.user._id;

		if (!currentPassword || !newPassword) {
			return res.status(400).json({ 
				message: "Current password and new password are required." 
			});
		}

		// Validate new password length
		if (newPassword.length < 6) {
			return res.status(400).json({ 
				message: "New password must be at least 6 characters long." 
			});
		}

		// Get current user
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found." });
		}

		// Verify current password
		const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
		if (!isCurrentPasswordValid) {
			return res.status(401).json({ 
				message: "Invalid current password." 
			});
		}

		// Hash new password
		const hashedNewPassword = await bcrypt.hash(newPassword, 12);

		// Update password
		await User.findByIdAndUpdate(userId, { 
			password: hashedNewPassword 
		});

		res.status(200).json({
			message: "Password changed successfully",
		});
	} catch (error) {
		console.error("Change password error:", error);
		res.status(500).json({ message: "Internal server error." });
	}
};

// GET USER ACTIVITY/LOGIN HISTORY
exports.getUserActivity = async (req, res) => {
	try {
		const user = req.user;

		res.status(200).json({
			message: "User activity retrieved successfully",
			activity: {
				registrationIP: user.ipAddress,
				registrationUserAgent: user.userAgent,
				registrationDate: user.createdAt,
				lastLoginIP: user.lastLoginIP,
				lastLoginUserAgent: user.lastLoginUserAgent,
				lastLoginAt: user.lastLoginAt,
			},
		});
	} catch (error) {
		console.error("Get user activity error:", error);
		res.status(500).json({ message: "Internal server error." });
	}
};

// DELETE ACCOUNT
exports.deleteAccount = async (req, res) => {
	try {
		const { password } = req.body;
		const userId = req.user._id;

		if (!password) {
			return res.status(400).json({ 
				message: "Password is required to delete account." 
			});
		}

		// Get current user
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found." });
		}

		// Verify password
		const isPasswordValid = await bcrypt.compare(password, user.password);
		if (!isPasswordValid) {
			return res.status(401).json({ 
				message: "Invalid password." 
			});
		}

		// Delete user account
		await User.findByIdAndDelete(userId);

		res.status(200).json({
			message: "Account deleted successfully",
		});
	} catch (error) {
		console.error("Delete account error:", error);
		res.status(500).json({ message: "Internal server error." });
	}
};