const axios = require("axios");
const User = require("../models/User");

const DOJAH_BASE_URL =
	process.env.DOJAH_BASE_URL || "https://api.dojah.io";
const DOJAH_APP_ID = process.env.DOJAH_APP_ID;
const DOJAH_API_KEY = process.env.DOJAH_API_KEY; // Authorization header

const dojahClient = axios.create({
	baseURL: DOJAH_BASE_URL,
	headers: {
		AppId: DOJAH_APP_ID,
		Authorization: DOJAH_API_KEY,
		"Content-Type": "application/json",
	},
});

/**
 * Validate BVN: Verify provided details against BVN records
 * GET/POST /api/kyc/bvn/validate
 * Body: { bvn, firstName, lastName, dob }
 */
exports.validateBVN = async (req, res) => {
	try {
		// Handle both body (POST) and query (GET) for flexibility
		const { bvn, firstName, lastName, dob } = req.body.bvn
			? req.body
			: req.query;
		const userId = req.user._id;

		if (!bvn || !firstName || !lastName) {
			return res.status(400).json({
				success: false,
				error: "Missing fields. Required: bvn, firstName, lastName",
			});
		}

		console.log(`Validating BVN for user ${userId}: ${bvn}`);

		// Dojah Validate Endpoint: GET /api/v1/kyc/bvn
		const response = await dojahClient.get("/api/v1/kyc/bvn", {
			params: {
				bvn,
				first_name: firstName,
				last_name: lastName,
				dob,
			},
		});

		const data = response.data;
		// console.log("Dojah Response:", JSON.stringify(data, null, 2));

		if (data.entity) {
			// Check status of fields
			// Dojah returns { entity: { bvn: { status: true, value: ... }, first_name: { status: true ... } } }
			const bvnStatus = data.entity.bvn?.status || false;
			const firstNameStatus = data.entity.first_name?.status || false;
			const lastNameStatus = data.entity.last_name?.status || false;

			const isVerified =
				bvnStatus && (firstNameStatus || lastNameStatus);

			// Update user
			await User.findByIdAndUpdate(userId, {
				"kyc.bvn": bvn,
				"kyc.firstName": firstName,
				"kyc.lastName": lastName,
				"kyc.dateOfBirth": dob,
				"kyc.status": isVerified ? "verified" : "failed",
				"kyc.tier": isVerified ? 1 : 0,
				"kyc.lastVerifiedAt": new Date(),
				"kyc.failureReason": isVerified ? null : "Details mismatch",
				"kyc.verificationReference": data.entity.reference_id,
			});

			return res.json({
				success: true,
				verified: isVerified,
				message: isVerified
					? "BVN validated successfully"
					: " BVN validation mismatch",
				data: data.entity,
			});
		} else {
			return res.status(400).json({
				success: false,
				error: "BVN validation failed at provider",
				details: data,
			});
		}
	} catch (error) {
		console.error(
			"Dojah Validate Error:",
			error.response?.data || error.message,
		);
		res.status(500).json({
			success: false,
			error: "BVN validation server error",
			details: error.response?.data || error.message,
		});
	}
};

/**
 * Lookup BVN: Get Basic Details
 * GET /api/kyc/bvn/lookup?bvn=123
 */
exports.lookupBVN = async (req, res) => {
	try {
		const { bvn } = req.query;
		if (!bvn)
			return res.status(400).json({ error: "BVN is required" });

		// Using /basic endpoint for lookup if available, or just /bvn without extra params?
		// Documentation implies /api/v1/kyc/bvn/basic for basic details.
		const response = await dojahClient.get("/api/v1/kyc/bvn/basic", {
			params: { bvn },
		});

		return res.json({
			success: true,
			data: response.data,
		});
	} catch (error) {
		// console.error("Dojah Lookup Error:", error.response?.data || error.message);
		// Fallback to try generic endpoint if basic fails?
		try {
			// Fallback
			const response = await dojahClient.get("/api/v1/kyc/bvn", {
				params: { bvn },
			});
			return res.json({ success: true, data: response.data });
		} catch (innerError) {
			res.status(500).json({
				success: false,
				error: "Lookup failed",
				details: error.response?.data || error.message,
			});
		}
	}
};

/**
 * Verify BVN with Selfie
 * POST /api/kyc/bvn/verify-selfie
 * Body: { bvn, selfieImage }
 */
exports.verifySelfie = async (req, res) => {
	try {
		// Can be { bvn, selfieImage } OR { nin, selfieImage }
		const { bvn, nin, selfieImage } = req.body;
		const userId = req.user._id;

		if ((!bvn && !nin) || !selfieImage) {
			return res.status(400).json({
				success: false,
				error: "ID (BVN or NIN) and Selfie Image required",
			});
		}

		const idType = bvn ? "bvn" : "nin";
		const idValue = bvn || nin;

		console.log(
			`Verifying selfie for user ${userId} using ${idType}`,
		);

		// Endpoint varies based on ID type
		const endpoint =
			idType === "bvn"
				? "/api/v1/kyc/bvn/verify"
				: "/api/v1/kyc/nin/verify";

		const payload = {
			selfie_image: selfieImage,
			[idType]: idValue,
		};

		const response = await dojahClient.post(endpoint, payload);
		const data = response.data;

		// Check verification match
		if (
			data.entity &&
			data.entity.selfie_verification &&
			data.entity.selfie_verification.match === true
		) {
			// Extract details from Dojah response to update user profile
			// Docs show snake_case keys in entity: first_name, last_name, etc.
			const entity = data.entity;

			await User.findByIdAndUpdate(userId, {
				"kyc.status": "verified",
				"kyc.tier": 2,
				"kyc.method": idType,
				[`kyc.${idType}`]: idValue,

				// Update personal details from the ID source (optional but good for consistency)
				"kyc.firstName": entity.first_name,
				"kyc.lastName": entity.last_name,
				"kyc.middleName": entity.middle_name,
				"kyc.dateOfBirth": entity.date_of_birth,
				"kyc.phoneNumber":
					entity.phone_number || entity.phone_number1,
				"kyc.gender": entity.gender,

				"kyc.selfieUrl": "uploaded",
				"kyc.lastVerifiedAt": new Date(),
				"kyc.verificationReference":
					data.reference_id || (entity ? entity.reference_id : null),
				"kyc.failureReason": null,
			});

			return res.json({
				success: true,
				message: `Selfie verification successful via ${idType.toUpperCase()}`,
				data: {
					...entity,
					image: undefined, // Don't send back the huge base64 ID image
					selfie_image_url: undefined, // or secure it
				},
			});
		} else {
			// Verification failed
			const confidence =
				data.entity?.selfie_verification?.confidence_value;
			await User.findByIdAndUpdate(userId, {
				"kyc.status": "failed",
				"kyc.failureReason": `Selfie mismatch (Confidence: ${confidence}%)`,
			});
			return res.status(400).json({
				success: false,
				message:
					"Selfie verification failed. Face does not match ID.",
				details: {
					match: data.entity?.selfie_verification?.match,
					confidence:
						data.entity?.selfie_verification?.confidence_value,
				},
			});
		}
	} catch (error) {
		console.error(
			"Dojah Selfie Verify Error:",
			error.response?.data || error.message,
		);
		res.status(500).json({
			success: false,
			error: "Selfie verification failed",
			details: error.response?.data || error.message,
		});
	}
};

/**
 * Get User KYC Status
 * GET /api/kyc/status
 */
exports.getKYCStatus = async (req, res) => {
	try {
		const user = await User.findById(req.user._id).select("kyc");
		// Ensure we return a default structure if kyc is undefined (for existing users)
		const kycData = user.kyc || { status: "unverified", tier: 0 };
		res.json({ success: true, kyc: kycData });
	} catch (error) {
		res.status(500).json({ success: false, error: "Server error" });
	}
};
