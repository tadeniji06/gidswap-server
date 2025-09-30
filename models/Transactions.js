const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: {
    type: String,
    enum: [
      "pending",     // order created, waiting
      "processing",  // provider assigned
      "fulfilled",   // payment completed by provider
      "validated",   // validated and confirmed
      "settled",     // blockchain settlement
      "cancelled",   // user or system cancelled
      "refunded",    // refunded back
      "expired",     // expired without completion
      "failed"       // failed in process
    ],
    default: "pending",
  },
  amount: Number,
  currency: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

transactionSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Transaction", transactionSchema);
