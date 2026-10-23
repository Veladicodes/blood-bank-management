const router = require("express").Router();
const BloodRequest = require("../models/BloodRequest");
const Inventory = require("../models/Inventory");
const httpError = require("../middleware/httpError");

const TRANSITIONS = {
  pending: ["approved", "rejected"],
  approved: ["fulfilled", "rejected"],
  rejected: [],
  fulfilled: [],
};

// Creating a request never touches stock.
router.post("/", async (req, res) => {
  const { requester, hospital, bloodGroup, unitsRequested } = req.body;
  res.status(201).json(await BloodRequest.create({ requester, hospital, bloodGroup, unitsRequested }));
});

router.get("/", async (req, res) => {
  const filter = {};
  if (typeof req.query.status === "string" && req.query.status) filter.status = req.query.status;
  if (typeof req.query.bloodGroup === "string" && req.query.bloodGroup) filter.bloodGroup = req.query.bloodGroup;
  res.json(await BloodRequest.find(filter).sort({ createdAt: -1 }).limit(500));
});

router.patch("/:id/status", async (req, res) => {
  const { status } = req.body;
  const current = await BloodRequest.findById(req.params.id);
  if (!current) throw httpError(404, "Request not found");
  if (typeof status !== "string" || !(TRANSITIONS[current.status] || []).includes(status)) {
    throw httpError(409, `Cannot change status from '${current.status}' to '${status}'`);
  }

  if (status === "fulfilled") {
    // Deduct first, only if enough stock exists (single atomic conditional update).
    const stock = await Inventory.findOneAndUpdate(
      { bloodGroup: current.bloodGroup, unitsAvailable: { $gte: current.unitsRequested } },
      { $inc: { unitsAvailable: -current.unitsRequested }, $set: { lastUpdated: new Date() } }
    );
    if (!stock) throw httpError(409, `Insufficient ${current.bloodGroup} stock to fulfil this request`);
  }

  // Atomic claim of the transition: a repeated or concurrent call matches nothing.
  const claimed = await BloodRequest.findOneAndUpdate(
    { _id: current._id, status: current.status },
    { status },
    { returnDocument: "after" }
  );
  if (!claimed) {
    // Lost the race: give back anything we deducted.
    if (status === "fulfilled") {
      await Inventory.updateOne({ bloodGroup: current.bloodGroup }, { $inc: { unitsAvailable: current.unitsRequested } });
    }
    throw httpError(409, "Request status changed concurrently; reload and retry");
  }
  res.json(claimed);
});

module.exports = router;
