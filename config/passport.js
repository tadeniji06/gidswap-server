const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");
const bcrypt = require("bcrypt");

passport.use(
	new GoogleStrategy(
		{
			clientID: process.env.OAUTH_CLIENT_ID,
			clientSecret: process.env.OAUTH_CLIENT_SECRET,
			callbackURL: "https://gidswapv2-indol.vercel.app/auth/callback",
		},
		async (profile, done) => {
			try {
				// Check if user exists
				let existingUser = await User.findOne({
					email: profile.emails[0].value,
				});
				if (existingUser) return done(null, existingUser);

				// Create new user
				const newUser = new User({
					fullName: profile.displayName,
					email: profile.emails[0].value,
					password: await bcrypt.hash(Math.random().toString(36), 12),
					googleId: profile.id,
					isGoogleAuth: true,
					lastLoginAt: new Date(),
				});

				await newUser.save();
				return done(null, newUser);
			} catch (error) {
				console.error("Google OAuth error:", error);
				return done(error, null);
			}
		}
	)
);

passport.serializeUser((user, done) => {
	done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
	try {
		const user = await User.findById(id);
		done(null, user);
	} catch (error) {
		done(error, null);
	}
});

module.exports = passport;
