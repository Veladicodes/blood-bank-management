const router = require("express").Router();
const Donor = require("../models/Donor");
const Donation = require("../models/Donation");
const httpError = require("../middleware/httpError");

const FIELDS = ["name", "age", "bloodGroup", "phone", "city", "eligible"];
const pick = (body) => Object.fromEntries(FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

router.post("/", async (req, res) => {
  res.status(201).json(await Donor.create(pick(req.body)));
});

router.get("/", async (req, res) => {
  const { bloodGroup, city, q } = req.query;
  const filter = {};
  if (typeof bloodGroup === "string" && bloodGroup) filter.bloodGroup = bloodGroup;
  if (typeof city === "string" && city) filter.city = new RegExp(`^${escapeRegex(city.slice(0, 60))}$`, "i");
  if (typeof q === "string" && q) filter.name = new RegExp(escapeRegex(q.slice(0, 80)), "i");
  res.json(await Donor.find(filter).sort({ createdAt: -1 }).limit(500));
});

router.get("/:id", async (req, res) => {
  const donor = await Donor.findById(req.params.id);
  if (!donor) throw httpError(404, "Donor not found");
  res.json(donor);
});

router.put("/:id", async (req, res) => {
  const donor = await Donor.findByIdAndUpdate(req.params.id, pick(req.body), {
    returnDocument: "after",
    runValidators: true,
  });
  if (!donor) throw httpError(404, "Donor not found");
  res.json(donor);
});

router.delete("/:id", async (req, res) => {
  if (await Donation.exists({ donorId: req.params.id })) {
    throw httpError(409, "Donor has donation records and cannot be deleted");
  }
  const donor = await Donor.findByIdAndDelete(req.params.id);
  if (!donor) throw httpError(404, "Donor not found");
  res.json({ message: "Donor deleted" });
});

module.exports = router;
