const express = require("express");
const router = express.Router();
const authControllers = require("../controllers/authControllers");

// login
router.post("/login", authControllers.login);

// signup
router.post("/signup", authControllers.signUp);

// check if email exists
router.post("/check-email", authControllers.checkEmailExists);

module.exports = router;
