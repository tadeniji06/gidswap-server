// utils/mapPaycrestStatus.js

/**
 * canonical mapping for DB statuses (pick the set you want)
 * returns one of:
 * 'pending', 'processing', 'validated', 'settled', 'fulfilled', 'refunded', 'expired', 'cancelled', 'failed'
 */
function mapPaycrestStatus(status) {
  if (!status) return "pending";

  const s = String(status).toLowerCase();

  // handle both forms like 'payment_order.settled' and 'settled'
  if (s.includes("pending")) return "pending";
  if (s.includes("processing")) return "processing";
  if (s.includes("validated")) return "validated";
  if (s.includes("settled")) return "settled";
  if (s.includes("fulfilled") || s.includes("completed")) return "fulfilled";
  if (s.includes("refunded")) return "refunded";
  if (s.includes("expired")) return "expired";
  if (s.includes("cancel") || s.includes("cancelled")) return "cancelled";
  if (s.includes("failed")) return "failed";

  // fallback - keep it pending so UI doesn't break
  return "pending";
}

module.exports = { mapPaycrestStatus };
