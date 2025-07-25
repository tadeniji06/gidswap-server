const mongoose = require("mongoose");

const connectDB = async () => {
	try {
		await mongoose.connect(process.env.MONGO_URL);
		console.log("Connection to GidSwap DataBase Successful!");
	} catch (error) {
		console.error("Connection Error", error);
		process.exit(1);
	}
};

module.exports = { connectDB };
