require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const passport = require("./config/passport");

const app = express();

// ----------------------
// Middleware Setup
// ----------------------

// CORS options
const corsOptions = {
	origin: [
		"http://localhost:3000",
		"http://192.168.1.205:3000",
		"http://192.168.1.204:3000",
		"https://gidswap.com",
		"https://www.gidswap.com",
	],
	credentials: true,
};

// Apply middlewares
app.use(cors(corsOptions));
app.use(passport.initialize());
app.use(helmet());
app.use(morgan("dev"));
app.use(cookieParser());

// Webhook: Paycrest requires raw body
app.use(
	"/api/webhooks/paycrest",
	express.raw({ type: "application/json", limit: "10mb" })
);

// JSON parser for all other routes
app.use(express.json({ limit: "10mb" }));

// ----------------------
// Healthcheck
// ----------------------
app.get("/api/ping", (req, res) => {
	res.status(200).json({
		status: "success",
		message: "Server is alive",
		timestamp: new Date().toISOString(),
	});
});

// ----------------------
// Routes
// ----------------------
const authRoutes = require("./routes/authRoutes");
const fixedFloatRoutes = require("./routes/fixFloatRoutes");
const authMiddlewares = require("./middlewares/authMiddlewares");
const payCrestRoutes = require("./routes/payCrestRoutes");
const userRoutes = require("./routes/userRoutes");
const webhookRouter = require("./routes/payCrestWebhook");
const transactionRoutes = require("./routes/transactionRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/transactions", authMiddlewares, transactionRoutes);
app.use("/api/fixfloat/trade", authMiddlewares, fixedFloatRoutes);
app.use("/api/payCrest/trade", authMiddlewares, payCrestRoutes);
app.use("/api/webhooks", webhookRouter);

// ----------------------
// Self-Ping to Prevent Idle Shutdown (Render workaround)
// ----------------------
// const selfPing = async () => {
// 	try {
// 		const serverUrl = process.env.SERVER_URL;
// 		if (!serverUrl) return;
// 		await fetch(`${serverUrl}/api/ping`);
// 	} catch {
// 		// ignore errors silently
// 	}
// };

// const startSelfPing = () => {
// 	setTimeout(() => {
// 		selfPing();
// 		setInterval(selfPing, 2 * 60 * 1000); // every 2 mins
// 	}, 30000); // wait 30s before starting
// 	console.log("✅ Self-ping started");
// };

// startSelfPing();

// ----------------------
// Export App
// ----------------------
module.exports = app;
