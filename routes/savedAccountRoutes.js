const express = require("express");
const SavedAccount = require("../models/SavedAccount");
const authMiddleware = require("../middlewares/authMiddlewares");

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/saved-accounts
 * List all saved accounts for the logged-in user
 */
router.get("/", async (req, res) => {
	try {
		const accounts = await SavedAccount.find({ user: req.user._id }).sort({
			isDefault: -1, // Defaults first
			createdAt: -1,
		});

		return res.json({ success: true, data: accounts });
	} catch (err) {
		console.error("❌ [SavedAccounts] List error:", err.message);
		return res.status(500).json({ success: false, message: "Server error" });
	}
});

/**
 * GET /api/saved-accounts/default
 * Get the user's default saved account (returns null if none set)
 */
router.get("/default", async (req, res) => {
	try {
		const account = await SavedAccount.findOne({
			user: req.user._id,
			isDefault: true,
		});

		return res.json({ success: true, data: account || null });
	} catch (err) {
		console.error("❌ [SavedAccounts] Default fetch error:", err.message);
		return res.status(500).json({ success: false, message: "Server error" });
	}
});

/**
 * GET /api/saved-accounts/:id
 * Get a single saved account by ID
 */
router.get("/:id", async (req, res) => {
	try {
		const account = await SavedAccount.findOne({
			_id: req.params.id,
			user: req.user._id,
		});

		if (!account) {
			return res.status(404).json({ success: false, message: "Account not found" });
		}

		return res.json({ success: true, data: account });
	} catch (err) {
		console.error("❌ [SavedAccounts] Get error:", err.message);
		return res.status(500).json({ success: false, message: "Server error" });
	}
});

/**
 * POST /api/saved-accounts
 * Save a new bank account
 * Body: { label, bankName, bankCode, accountNumber, accountName, returnAddress, isDefault }
 */
router.post("/", async (req, res) => {
	try {
		const {
			label,
			bankName,
			bankCode,
			accountNumber,
			accountName,
			returnAddress,
			isDefault,
		} = req.body;

		// Validate required fields
		if (!bankName || !bankCode || !accountNumber || !accountName) {
			return res.status(400).json({
				success: false,
				message: "bankName, bankCode, accountNumber and accountName are required",
			});
		}

		// If setting this as default, unset any existing default first
		if (isDefault) {
			await SavedAccount.updateMany(
				{ user: req.user._id, isDefault: true },
				{ $set: { isDefault: false } }
			);
		}

		const account = await SavedAccount.create({
			user: req.user._id,
			label: label || "My Account",
			bankName,
			bankCode,
			accountNumber,
			accountName,
			returnAddress: returnAddress || null,
			// If this is the user's first account, make it default automatically
			isDefault: isDefault || (await SavedAccount.countDocuments({ user: req.user._id })) === 0,
		});

		console.log(`✅ [SavedAccounts] New account saved for user ${req.user._id}: ${account._id}`);

		return res.status(201).json({ success: true, data: account });
	} catch (err) {
		if (err.code === 11000) {
			// Duplicate key — same bank + account already saved
			return res.status(409).json({
				success: false,
				message: "This bank account is already saved",
			});
		}
		console.error("❌ [SavedAccounts] Create error:", err.message);
		return res.status(500).json({ success: false, message: "Server error" });
	}
});

/**
 * PATCH /api/saved-accounts/:id
 * Update a saved account (label, returnAddress, or set as default)
 */
router.patch("/:id", async (req, res) => {
	try {
		const account = await SavedAccount.findOne({
			_id: req.params.id,
			user: req.user._id,
		});

		if (!account) {
			return res.status(404).json({ success: false, message: "Account not found" });
		}

		const allowed = ["label", "returnAddress", "isDefault"];
		for (const field of allowed) {
			if (req.body[field] !== undefined) {
				account[field] = req.body[field];
			}
		}

		// If setting default, clear others first
		if (req.body.isDefault === true) {
			await SavedAccount.updateMany(
				{ user: req.user._id, _id: { $ne: account._id }, isDefault: true },
				{ $set: { isDefault: false } }
			);
			account.isDefault = true;
		}

		await account.save();

		return res.json({ success: true, data: account });
	} catch (err) {
		console.error("❌ [SavedAccounts] Update error:", err.message);
		return res.status(500).json({ success: false, message: "Server error" });
	}
});

/**
 * DELETE /api/saved-accounts/:id
 * Delete a saved account
 */
router.delete("/:id", async (req, res) => {
	try {
		const account = await SavedAccount.findOneAndDelete({
			_id: req.params.id,
			user: req.user._id,
		});

		if (!account) {
			return res.status(404).json({ success: false, message: "Account not found" });
		}

		// If deleted account was the default, make the most recent account the new default
		if (account.isDefault) {
			const next = await SavedAccount.findOne({ user: req.user._id }).sort({ createdAt: -1 });
			if (next) {
				next.isDefault = true;
				await next.save();
			}
		}

		return res.json({ success: true, message: "Account deleted" });
	} catch (err) {
		console.error("❌ [SavedAccounts] Delete error:", err.message);
		return res.status(500).json({ success: false, message: "Server error" });
	}
});

module.exports = router;
