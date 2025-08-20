require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

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
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
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

app.use("/api/auth", authRoutes);
app.use("/api/fixfloat/trade", authMiddlewares, fixedFloatRoutes);

// Self-ping function to keep server alive
const selfPing = async () => {
	try {
		const serverUrl = process.env.SERVER_URL;
		const response = await fetch(`${serverUrl}/api/ping`);

		if (response.ok) {
			console.log(
				`✅ Self ping successful at ${new Date().toISOString()}`
			);
		} else {
			console.log(
				`⚠️ Self ping failed with status: ${response.status}`
			);
		}
	} catch (error) {
		console.error(`❌ Self ping error: ${error.message}`);
	}
};

// Start self-ping interval (every 2 minutes = 120000ms)
const startSelfPing = () => {
	// Initial ping after 30 seconds
	setTimeout(() => {
		selfPing();
		// Then ping every 2 minutes
		setInterval(selfPing, 2 * 60 * 1000);
	}, 30000);

	console.log("🔄 Self-ping mechanism started (every 2 minutes)");
};

// Start the self-ping when the server starts
startSelfPing();

module.exports = app;
