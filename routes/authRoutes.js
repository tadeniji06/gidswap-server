const express = require("express");
const router = express.Router();
const authControllers = require("../controllers/authControllers");

// login
router.post("/login", authControllers.login);

// signup
router.post("/signup", authControllers.signUp);

module.exports = router;
