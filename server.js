const http = require("http");
const app = require("./app");
const { connectDB } = require("./config/db");

const PORT = process.env.PORT;
const server = http.createServer(app);

connectDB().then(() => {
	server.listen(PORT, "0.0.0.0", () =>
		console.log(`🚀 Server up on http://0.0.0.0:${PORT}`)
	);
});
