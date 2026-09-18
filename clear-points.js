const mongoose = require("mongoose");
require("dotenv").config();
const User = require("./models/User");

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        
        const emailsToClear = [
            "sundayhumble2@gmail.com",
            "princeazubuike18@gmail.com",
            "engrvirus011@gmail.com",
            "tessyfriday50@gmail.com",
            "timilehinabidoye17@gmail.com",
            "adesoyeadelakun@gmail.com",
            "adebolaadeboi@gmail.com"
        ];

        const result = await User.updateMany(
            { email: { $in: emailsToClear } },
            { $set: { rewardPoints: 0 } }
        );

        console.log(`Successfully cleared points for ${result.modifiedCount} users.`);
    } catch (err) {
        console.error("Error clearing points:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
