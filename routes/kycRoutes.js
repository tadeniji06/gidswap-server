const express = require("express");
const router = express.Router();
const dojahController = require("../controllers/dojahController");
const authMiddleware = require("../middlewares/authMiddlewares");

// All routes are protected
router.use(authMiddleware);

/**
 * @route   GET /api/kyc/status
 * @desc    Get current user KYC status
 * @access  Private
 */
router.get("/status", dojahController.getKYCStatus);

/**
 * @route   POST /api/kyc/bvn/validate
 * @desc    Validate BVN details (Name match)
 * @access  Private
 */
router.post("/bvn/validate", dojahController.validateBVN);

/**
 * @route   POST /api/kyc/bvn/verify-selfie
 * @desc    Verify BVN with Selfie Image
 * @access  Private
 */
router.post("/selfie/verify", dojahController.verifySelfie);

/**
 * @route   GET /api/kyc/bvn/lookup
 * @desc    Lookup BVN Basic Details (Admin/Advanced use)
 * @access  Private
 */
router.get("/bvn/lookup", dojahController.lookupBVN);

module.exports = router;
