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
		"https://gidswap.com",
		"https://www.gidswap.com",
	],
	credentials: true,
};

app.use(cors(corsOptions));
app.use(passport.initialize());
app.use(helmet());
app.use(morgan("dev"));
app.use(cookieParser());

// Raw body only for Paycrest webhook
app.use(
	"/api/webhooks/paycrest",
	express.raw({ type: "application/json", limit: "10mb" })
);

// Global JSON parser for all other routes
app.use(express.json({ limit: "10mb" }));

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
const webhookRouter = require("./routes/payCrestWebhook");
const transactionRoutes = require("./routes/transactionRoutes");

app.use("/api/transactions", authMiddlewares, transactionRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/fixfloat/trade", authMiddlewares, fixedFloatRoutes);
app.use("/api/webhooks", webhookRouter);
app.use("/api/payCrest/trade", authMiddlewares, payCrestRoutes);

// Self-ping function to keep server alive (Render workaround)
const selfPing = async () => {
	try {
		const serverUrl = process.env.SERVER_URL;
		if (!serverUrl) return;
		await fetch(`${serverUrl}/api/ping`);
	} catch {
		// ignore
	}
};

const startSelfPing = () => {
	setTimeout(() => {
		selfPing();
		setInterval(selfPing, 2 * 60 * 1000);
	}, 30000);
	console.log("Self-ping started");
};

startSelfPing();

module.exports = app;
