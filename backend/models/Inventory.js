const mongoose = require("mongoose");
const { BLOOD_GROUPS } = require("./constants");

const inventorySchema = new mongoose.Schema({
  bloodGroup: { type: String, required: true, enum: BLOOD_GROUPS, unique: true },
  unitsAvailable: { type: Number, default: 0, min: 0 },
  lastUpdated: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Inventory", inventorySchema);
