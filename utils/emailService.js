const axios = require("axios");

/**
 * Send OTP Email using Resend HTTP API
 */
exports.sendOtpEmail = async (email, otp, type = "verification") => {
	const subject = type === "verification" ? "Verify your GidSwap Account" : "Reset your GidSwap Password";
	const title = type === "verification" ? "Verify Your Email" : "Reset Your Password";
	const message = type === "verification" 
		? "Thank you for joining GidSwap. Please use the following code to verify your account."
		: "We received a request to reset your password. Please use the following code to proceed.";

	const html = `
    <div style="font-family: sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #3b82f6; text-align: center;">${title}</h2>
      <p style="color: #374151; font-size: 16px; line-height: 1.5;">${message}</p>
      <div style="background: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #111827;">${otp}</span>
      </div>
      <p style="color: #6b7280; font-size: 14px; text-align: center;">This code will expire in 10 minutes.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #9ca3af; font-size: 12px; text-align: center;">&copy; 2026 GidSwap. All rights reserved.</p>
    </div>
  `;

	try {
		console.log(`📧 Attempting to send ${type} email via Resend API to: ${email}`);
		
		const response = await axios.post(
			"https://api.resend.com/emails",
			{
				from: "GidSwap Support <support@gidswap.com>",
				to: email,
				subject: subject,
				html: html,
			},
			{
				headers: {
					"Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
					"Content-Type": "application/json",
				},
			}
		);
		
		console.log(`✅ Email sent successfully via Resend: ID ${response.data.id}`);
	} catch (error) {
		console.error("❌ Resend API Error:", error.response?.data || error.message);
		throw error;
	}
};
