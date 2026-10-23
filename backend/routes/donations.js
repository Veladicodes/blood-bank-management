const router = require("express").Router();
const Donation = require("../models/Donation");
const Donor = require("../models/Donor");
const Inventory = require("../models/Inventory");
const httpError = require("../middleware/httpError");

router.post("/", async (req, res) => {
  const { donorId, unitsCollected, donationDate } = req.body;
  const donor = await Donor.findById(donorId);
  if (!donor) throw httpError(404, "Donor not found");
  if (!donor.eligible) throw httpError(409, "Donor is not eligible to donate");
  // Blood group always comes from the donor record, never from the client.
  const donation = await Donation.create({ donorId, bloodGroup: donor.bloodGroup, unitsCollected, donationDate });
  // Guard against the donor being deleted or made ineligible while we were creating the record.
  if (!(await Donor.exists({ _id: donorId, eligible: true }))) {
    await Donation.deleteOne({ _id: donation._id });
    throw httpError(409, "Donor is no longer available to donate");
  }
  res.status(201).json(donation);
});

router.get("/", async (req, res) => {
  const filter = {};
  if (typeof req.query.donorId === "string") filter.donorId = req.query.donorId;
  if (typeof req.query.screeningStatus === "string") filter.screeningStatus = req.query.screeningStatus;
  res.json(await Donation.find(filter).populate("donorId", "name bloodGroup").sort({ donationDate: -1 }).limit(500));
});

// Screening result: pending -> passed | failed. Stock is added once, only when passed.
router.patch("/:id/screening", async (req, res) => {
  const { screeningStatus } = req.body;
  if (typeof screeningStatus !== "string" || !["passed", "failed"].includes(screeningStatus)) {
    throw httpError(400, "screeningStatus must be 'passed' or 'failed'");
  }
  const donation = await Donation.findOneAndUpdate(
    { _id: req.params.id, screeningStatus: "pending" },
    { screeningStatus, stockApplied: screeningStatus === "passed" },
    { returnDocument: "after" }
  );
  if (!donation) {
    if (!(await Donation.exists({ _id: req.params.id }))) throw httpError(404, "Donation not found");
    throw httpError(409, "Donation has already been screened");
  }
  if (screeningStatus === "passed") {
    const addStock = () =>
      Inventory.findOneAndUpdate(
        { bloodGroup: donation.bloodGroup },
        { $inc: { unitsAvailable: donation.unitsCollected }, $set: { lastUpdated: new Date() } },
        { upsert: true }
      );
    try {
      try {
        await addStock();
      } catch (err) {
        // Two first-ever upserts for a group can collide on the unique index; the retry then updates.
        if (err.code !== 11000) throw err;
        await addStock();
      }
    } catch (err) {
      // Stock update failed: put the donation back to pending so it can be screened again.
      await Donation.updateOne({ _id: donation._id }, { screeningStatus: "pending", stockApplied: false });
      throw err;
    }
  }
  res.json(donation);
});

module.exports = router;
