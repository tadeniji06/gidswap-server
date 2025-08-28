const express = require("express");
const router = express.Router();
const userControllers = require("../controllers/userControllers");
const authMiddleware = require("../middlewares/authMiddlewares");

// All user routes require authentication
router.use(authMiddleware);

// GET user profile (always returns authenticated user's details)
router.get("/profile", userControllers.getUserProfile);

// UPDATE user profile (full name only)
router.put("/profile", userControllers.updateProfile);

// UPDATE email address (requires current password)
router.put("/email", userControllers.updateEmail);

// CHANGE password (requires current password)
router.put("/password", userControllers.changePassword);

// GET user activity/login history
router.get("/activity", userControllers.getUserActivity);

// DELETE account (requires password confirmation)
// router.delete("/account", userControllers.deleteAccount);

module.exports = router;