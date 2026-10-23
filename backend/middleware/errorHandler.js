module.exports = (err, req, res, next) => {
  if (err.name === "ValidationError") {
    return res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join("; ") });
  }
  if (err.name === "CastError") return res.status(400).json({ error: `Invalid ${err.path}` });
  if (err.code === 11000) return res.status(409).json({ error: "Duplicate value: record already exists" });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON" });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
