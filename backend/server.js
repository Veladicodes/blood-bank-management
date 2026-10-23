require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const app = require("./app");
const { connect } = require("./db");

const port = process.env.PORT || 5000;

connect()
  .then(async () => {
    console.log("MongoDB connected!");
    if (process.env.USE_MEMORY_DB === "true") await require("./seed").run();
    app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });
