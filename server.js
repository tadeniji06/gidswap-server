const http = require("http");
const app = require("./app");
const { connectDB } = require("./config/db");

const PORT = process.env.PORT;
const server = http.createServer(app);

connectDB().then(() => {
	server.listen(PORT, () =>
		console.log(`Server up on http://localhost${PORT} `)
	);
});
