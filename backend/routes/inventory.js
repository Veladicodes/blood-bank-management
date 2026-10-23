const router = require("express").Router();
const Inventory = require("../models/Inventory");
const { BLOOD_GROUPS } = require("../models/constants");

const statusFor = (units) => (units < 5 ? "Low" : units < 15 ? "Adequate" : "Good");

// Aggregation: total units per blood group. All eight groups always appear.
router.get("/", async (req, res) => {
  const rows = await Inventory.aggregate([
    { $group: { _id: "$bloodGroup", units: { $sum: "$unitsAvailable" }, lastUpdated: { $max: "$lastUpdated" } } },
  ]);
  const byGroup = Object.fromEntries(rows.map((r) => [r._id, r]));
  res.json(
    BLOOD_GROUPS.map((bloodGroup) => {
      const units = byGroup[bloodGroup]?.units ?? 0;
      return {
        bloodGroup,
        unitsAvailable: units,
        status: statusFor(units),
        lastUpdated: byGroup[bloodGroup]?.lastUpdated ?? null,
      };
    })
  );
});

module.exports = router;
