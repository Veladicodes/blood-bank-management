const mongoose = require("mongoose");
const { BLOOD_GROUPS } = require("./constants");

const STATUSES = ["pending", "approved", "rejected", "fulfilled"];

const bloodRequestSchema = new mongoose.Schema(
  {
    requester: { type: String, required: true, trim: true, maxlength: 80 },
    hospital: { type: String, trim: true, maxlength: 80, default: "" },
    bloodGroup: { type: String, required: true, enum: BLOOD_GROUPS },
    unitsRequested: { type: Number, required: true, min: 1, max: 20, validate: Number.isInteger },
    status: { type: String, enum: STATUSES, default: "pending" },
  },
  { timestamps: true }
);

bloodRequestSchema.index({ status: 1 });
bloodRequestSchema.index({ bloodGroup: 1, status: 1 });

module.exports = mongoose.model("BloodRequest", bloodRequestSchema);
module.exports.STATUSES = STATUSES;
