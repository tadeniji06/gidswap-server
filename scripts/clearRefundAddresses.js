
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const SavedAccount = require("../models/SavedAccount");

const MONGO_URL = process.env.MONGO_URL;

if (!MONGO_URL) {
	console.error("❌  MONGO_URL not found in .env — aborting.");
	process.exit(1);
}

(async () => {
	console.log("🔌  Connecting to MongoDB...");

	try {
		await mongoose.connect(MONGO_URL);
		console.log("✅  Connected to MongoDB.");

		// Count how many have a non-null returnAddress before cleanup
		const total = await SavedAccount.countDocuments({});
		const withAddress = await SavedAccount.countDocuments({
			returnAddress: { $ne: null, $exists: true, $ne: "" },
		});

		console.log(`📊  Total SavedAccounts: ${total}`);
		console.log(`📍  Accounts with a returnAddress set: ${withAddress}`);

		if (withAddress === 0) {
			console.log("ℹ️   No returnAddress fields to clear. Nothing to do.");
			await mongoose.disconnect();
			process.exit(0);
		}

		console.log("🧹  Clearing ALL returnAddress fields...");

		const result = await SavedAccount.updateMany(
			{},                              // match ALL documents
			{ $set: { returnAddress: null } } // set returnAddress to null
		);

		console.log(`✅  Done! Modified ${result.modifiedCount} out of ${result.matchedCount} documents.`);

		// Verify
		const remaining = await SavedAccount.countDocuments({
			returnAddress: { $ne: null },
		});
		console.log(`🔍  Verification — accounts still with a returnAddress: ${remaining}`);

		if (remaining === 0) {
			console.log("🎉  All returnAddress fields successfully cleared.");
		} else {
			console.warn(`⚠️   ${remaining} document(s) still have a returnAddress — investigate manually.`);
		}

	} catch (err) {
		console.error("❌  Error during cleanup:", err.message || err);
		process.exit(1);
	} finally {
		await mongoose.disconnect();
		console.log("🔌  Disconnected from MongoDB.");
		process.exit(0);
	}
})();
