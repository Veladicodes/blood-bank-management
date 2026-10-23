const path = require("path");
const express = require("express");
const errorHandler = require("./middleware/errorHandler");
const { login, requireAuth, securityHeaders } = require("./middleware/auth");

// The frontend is served by this same app, so cross-origin access is not enabled.
const app = express();
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.json({ limit: "100kb" }));

// Public endpoints
app.get("/api/health", (req, res) => res.send("Blood Bank Management API is running!"));
app.post("/api/auth/login", login);

// Everything else under /api needs an admin token
app.use("/api", requireAuth);
app.use("/api/donors", require("./routes/donors"));
app.use("/api/donations", require("./routes/donations"));
app.use("/api/inventory", require("./routes/inventory"));
app.use("/api/requests", require("./routes/requests"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

app.use(express.static(path.join(__dirname, "..", "frontend")));
app.use(errorHandler);

module.exports = app;
