const express = require("express");
const router = express.Router();
const passport = require("../config/passport");
const authControllers = require("../controllers/authControllers");

// --- Regular auth routes ---
router.post("/login", authControllers.login);
router.post("/signup", authControllers.signUp);
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
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    // success → redirect frontend dashboard
    res.redirect("https://gidswapv2-indol.vercel.app/dashboard");
  }
);

module.exports = router;
