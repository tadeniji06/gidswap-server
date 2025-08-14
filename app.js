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
		"https://gidswapv2.vercel.app"
	],
	credentials: true,
};

app.use(cors(corsOptions));
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// routes
const authRoutes = require("./routes/authRoutes");
const fixedFloatRoutes = require("./routes/fixFloatRoutes");
const authMiddlewares = require("./middlewares/authMiddlewares");

app.use("/api/auth", authRoutes);
app.use("/api/fixfloat/trade", authMiddlewares, fixedFloatRoutes);



module.exports = app;
