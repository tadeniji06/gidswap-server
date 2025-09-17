const jwt = require("jsonwebtoken");

function generateJWT(user) {
  const payload = {
    id: user._id,
    email: user.email,
    fullName: user.fullName,
    isGoogleAuth: user.isGoogleAuth,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "7d", 
  });
}

module.exports = { generateJWT };
