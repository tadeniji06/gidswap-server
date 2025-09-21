require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const passport = require("./config/passport");
const app = express();

// Middlewares
const corsOptions = {
	origin: [
		"http://localhost:3000",
		"http://localhost:5173",
		"https://gidswap.com",
		"https://www.gidswap.com",
		"https://gidswapv2-indol.vercel.app",
		"https://gidswapv2.vercel.app",
	],
	credentials: true,
};

app.use(cors(corsOptions));
app.use(passport.initialize());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

// Self-ping endpoint
app.get("/api/ping", (req, res) => {
	res.status(200).json({
		status: "success",
		message: "Server is alive",
		timestamp: new Date().toISOString(),
	});
});

// routes
const authRoutes = require("./routes/authRoutes");
const fixedFloatRoutes = require("./routes/fixFloatRoutes");
const authMiddlewares = require("./middlewares/authMiddlewares");
const payCrestRoutes = require("./routes/payCrestRoutes");
const userRoutes = require("./routes/userRoutes");
const webhookRouter = require("./routes/payCrestWebhook")

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/fixfloat/trade", authMiddlewares, fixedFloatRoutes);
app.use("/api/webhooks", webhookRouter)
app.use("/api/payCrest/trade", authMiddlewares, payCrestRoutes);

// Self-ping function to keep server alive
const selfPing = async () => {
	try {
		const serverUrl = process.env.SERVER_URL;
		const response = await fetch(`${serverUrl}/api/ping`);

		if (response.ok) {
			// console.log(
			// 	`Self ping successful at ${new Date().toISOString()}`
			// );
		} else {
			// console.log(`Self ping failed with status: ${response.status}`);
		}
	} catch (error) {
		// console.error(`Self ping error: ${error.message}`);
	}
};

// Start self-ping interval
const startSelfPing = () => {
	// Initial ping after 30 seconds
	setTimeout(() => {
		selfPing();
		setInterval(selfPing, 2 * 60 * 1000);
	}, 30000);

	console.log("Self-ping started");
};

// Start the self-ping when the server starts
startSelfPing();

module.exports = app;
