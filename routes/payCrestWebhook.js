const express = require("express");
const querystring = require("querystring");
const router = express.Router();

function parseRawBody(req) {
  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString("utf8");
    if (!raw || raw.length === 0) return null;

    const contentType = (req.headers["content-type"] || "").split(";")[0].toLowerCase();

    // Try best-effort parsing
    try {
      if (contentType === "application/json" || contentType === "application/cloudevents+json") {
        return JSON.parse(raw);
      }
      if (contentType === "application/x-www-form-urlencoded") {
        return querystring.parse(raw);
      }

      // Fallback: try JSON parse
      try {
        return JSON.parse(raw);
      } catch (e) {
        // Not JSON — return the raw string so it's visible in logs
        return { _raw: raw };
      }
    } catch (err) {
      console.error("Error parsing raw webhook body:", err);
      return { _raw: raw, _parseError: err.message };
    }
  }

  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  return null;
}

router.post("/paycrest", (req, res) => {
  console.log("=== Incoming webhook ===");
  console.log("Headers:", req.headers);

  const parsed = parseRawBody(req);
  console.log("Parsed body:", parsed);

  if (!parsed || !parsed.event) {
    console.error("Invalid webhook payload (no event). Full payload:", parsed);
    return res.status(400).json({ error: "Invalid payload" });
  }

  const event = parsed;

  try {
    switch (event.event) {
      case "order.initiated":
        console.log(`Order initiated: ${event.orderId}`);
        // TODO: save order to DB as pending
        break;
      case "order.fulfilled":
        console.log(`Order fulfilled: ${event.orderId}`);
        // TODO: update DB, notify user, etc.
        break;
      case "order.settled":
        console.log(`Order settled: ${event.orderId}`);
        // TODO: mark settled in DB
        break;
      case "order.refunded":
        console.log(`Order refunded: ${event.orderId}`);
        // TODO: mark refunded
        break;
      default:
        console.log("Unhandled event type:", event.event);
    }
  } catch (err) {
    console.error("Error handling webhook:", err);
  }

  // Ack quickly
  res.status(200).json({ received: true });
});

module.exports = router;
