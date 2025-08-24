const express = require("express");
const router = express.Router();
const authControllers = require("../controllers/authControllers");

// login
router.post("/login", authControllers.login);

// signup
router.post("/signup", authControllers.signUp);

// check email
router.post("/check-email", authControllers.checkEmailExists);

// request OTP
router.post("/request-otp", authControllers.requestOtp);

// verify OTP
router.post("/verify-otp", authControllers.verifyOtp);

// reset password
router.post("/reset-password", authControllers.resetPassword);

module.exports = router;
