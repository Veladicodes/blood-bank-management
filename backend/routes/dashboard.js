const router = require("express").Router();
const Donor = require("../models/Donor");
const Inventory = require("../models/Inventory");
const BloodRequest = require("../models/BloodRequest");

router.get("/", async (req, res) => {
  const [totalDonors, stock, byStatus] = await Promise.all([
    Donor.countDocuments(),
    Inventory.aggregate([{ $group: { _id: null, total: { $sum: "$unitsAvailable" } } }]),
    BloodRequest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
  res.json({
    totalDonors,
    totalUnits: stock[0]?.total ?? 0,
    pendingRequests: counts.pending ?? 0,
    approvedRequests: counts.approved ?? 0,
    fulfilledRequests: counts.fulfilled ?? 0,
    rejectedRequests: counts.rejected ?? 0,
  });
});

module.exports = router;
