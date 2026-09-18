const mongoose = require("mongoose");
require("dotenv").config();
const Transaction = require("./models/Transactions");
const User = require("./models/User");
const SavedAccount = require("./models/SavedAccount");

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        
        // Find top 10 users with 'fulfilled' and 'settled' transactions
        const topUsers = await Transaction.aggregate([
            { $match: { status: { $in: ["fulfilled", "settled"] } } },
            { $group: { _id: "$user", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        const results = [];
        for (const u of topUsers) {
            const user = await User.findById(u._id);
            if (!user) continue;

            const accounts = await SavedAccount.find({ user: user._id });
            
            results.push({
                name: user.fullName,
                email: user.email,
                transactionCount: u.count,
                rewardPoints: user.rewardPoints || 0,
                savedAccounts: accounts.map(a => ({
                    bank: a.bankName,
                    accountName: a.accountName,
                    accountNumber: a.accountNumber,
                    cryptoAddress: a.returnAddress || "N/A"
                }))
            });
        }

        console.log(JSON.stringify(results, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
