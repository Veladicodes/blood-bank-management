const mongoose = require("mongoose");
const { BLOOD_GROUPS } = require("./constants");

const donorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    age: { type: Number, required: true, min: 18, max: 65 },
    bloodGroup: { type: String, required: true, enum: BLOOD_GROUPS },
    phone: { type: String, required: true, trim: true, match: [/^\d{10}$/, "Phone must be 10 digits"] },
    city: { type: String, required: true, trim: true, maxlength: 60 },
    eligible: { type: Boolean, default: true },
  },
  { timestamps: true }
);

donorSchema.index({ bloodGroup: 1 });
donorSchema.index({ city: 1 });
donorSchema.index({ phone: 1 }, { unique: true });

module.exports = mongoose.model("Donor", donorSchema);
