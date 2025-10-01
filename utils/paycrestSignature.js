// utils/paycrestSignature.js
const crypto = require("crypto");

/**
 * Compute HMAC-SHA256 of raw body buffer and return hex and base64 representations.
 * @param {Buffer} rawBody - Express raw body buffer
 * @param {string} secret - your webhook secret
 * @returns {{hex: string, base64: string}}
 */
function calculateHmacSignatures(rawBody, secret) {
  const hmac = crypto.createHmac("sha256", Buffer.from(secret, "utf8"));
  hmac.update(rawBody);
  const hex = hmac.digest("hex");
  // also return base64 in case provider uses base64
  const base64 = Buffer.from(hex, "hex").toString("base64");
  return { hex, base64 };
}

/**
 * Timing-safe compare of the expected and actual signature strings.
 * Supports hex or base64 forms. Returns boolean.
 */
function safeCompare(a, b) {
  if (!a || !b) return false;
  try {
    const aBuf = Buffer.from(a, "utf8");
    const bBuf = Buffer.from(b, "utf8");
    // if lengths differ, create same length buffers to avoid early return
    if (aBuf.length !== bBuf.length) {
      // make a constant time comparison anyway
      const tmpA = Buffer.alloc(Math.max(aBuf.length, bBuf.length));
      const tmpB = Buffer.alloc(Math.max(aBuf.length, bBuf.length));
      aBuf.copy(tmpA);
      bBuf.copy(tmpB);
      return crypto.timingSafeEqual(tmpA, tmpB);
    }
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch (err) {
    return false;
  }
}

/**
 * Verify Paycrest signature header.
 * @param {Buffer} rawBody
 * @param {string} signatureHeader - header value sent by Paycrest (e.g. 'X-Paycrest-Signature')
 * @param {string} secret
 */
function verifyPaycrestSignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) return false;
  const { hex, base64 } = calculateHmacSignatures(rawBody, secret);

  // Try different plausible encodings providers may use:
  // exact hex, prefixed 'sha256=' form, base64
  const candidates = [hex, `sha256=${hex}`, base64, `sha256=${base64}`];

  return candidates.some((c) => safeCompare(c, signatureHeader));
}

module.exports = {
  verifyPaycrestSignature,
  calculateHmacSignatures,
};
