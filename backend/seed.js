require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const mongoose = require("mongoose");
const Donor = require("./models/Donor");
const Donation = require("./models/Donation");
const Inventory = require("./models/Inventory");
const BloodRequest = require("./models/BloodRequest");
const { BLOOD_GROUPS } = require("./models/constants");

// All data below is fictional.
const NAMES = ["Arun Kumar", "Priya Nair", "Karthik Raj", "Divya Menon", "Suresh Babu", "Meena Iyer", "Vikram Singh", "Anitha Rao", "Rahul Das", "Lakshmi Devi", "Imran Khan", "Sneha Patel"];
const CITIES = ["Chennai", "Coimbatore", "Madurai", "Bengaluru"];

async function run() {
  await Promise.all([Donor.deleteMany(), Donation.deleteMany(), Inventory.deleteMany(), BloodRequest.deleteMany()]);
  const donors = await Donor.insertMany(
    NAMES.map((name, i) => ({
      name,
      age: 20 + i * 3,
      bloodGroup: BLOOD_GROUPS[i % 8],
      phone: `98765${String(43210 + i)}`,
      city: CITIES[i % 4],
      eligible: i !== 5,
    }))
  );
  // Stock mirrors the screened-and-passed donations (6 units each, fictional).
  const stock = {};
  const donations = donors.map((d, i) => {
    const passed = i % 4 !== 3;
    if (passed) stock[d.bloodGroup] = (stock[d.bloodGroup] || 0) + 6;
    return {
      donorId: d._id,
      bloodGroup: d.bloodGroup,
      unitsCollected: 1,
      screeningStatus: passed ? "passed" : "pending",
      stockApplied: passed,
    };
  });
  await Donation.insertMany(donations);
  await Inventory.insertMany(BLOOD_GROUPS.map((g) => ({ bloodGroup: g, unitsAvailable: stock[g] || 0 })));
  await BloodRequest.insertMany([
    { requester: "Ravi Shankar", hospital: "City General Hospital", bloodGroup: "O+", unitsRequested: 2 },
    { requester: "Kavya R", hospital: "Sunrise Clinic", bloodGroup: "A+", unitsRequested: 1, status: "approved" },
    { requester: "Mohan Lal", hospital: "Metro Hospital", bloodGroup: "B+", unitsRequested: 3 },
    { requester: "Anushka", hospital: "CMC", bloodGroup: "A+", unitsRequested: 1 }
  ]);
  console.log("Seeded fictional sample data");
}

module.exports = { run };

if (require.main === module) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(run)
    .then(() => mongoose.disconnect())
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
