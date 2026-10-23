const mongoose = require("mongoose");
const { BLOOD_GROUPS } = require("./constants");

const donationSchema = new mongoose.Schema(
  {
    donorId: { type: mongoose.Schema.Types.ObjectId, ref: "Donor", required: true },
    bloodGroup: { type: String, required: true, enum: BLOOD_GROUPS },
    unitsCollected: { type: Number, required: true, min: 1, max: 2, validate: Number.isInteger },
    screeningStatus: { type: String, enum: ["pending", "passed", "failed"], default: "pending" },
    donationDate: {
      type: Date,
      default: Date.now,
      validate: { validator: (d) => d.getTime() <= Date.now() + 60000, message: "Donation date cannot be in the future" },
    },
    stockApplied: { type: Boolean, default: false },
  },
  { timestamps: true }
);

donationSchema.index({ donorId: 1 });
donationSchema.index({ screeningStatus: 1 });

module.exports = mongoose.model("Donation", donationSchema);
