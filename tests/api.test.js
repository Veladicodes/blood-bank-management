const { describe: nodeDescribe, test, before: beforeAll, after: afterAll, beforeEach } = require("node:test");
// Auth is exercised in the dedicated "auth" suite; other suites run with it switched off.
process.env.AUTH_DISABLED = "true";
const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app = require("../backend/app");
const expect = require("./expect");
// Suites share one database, so run them strictly one after another.
const describe = (name, fn) => nodeDescribe(name, { concurrency: false }, fn);

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri("test"));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.models).map((m) => m.deleteMany()));
});

const donorBody = (over = {}) => ({
  name: "Arun Kumar", age: 24, bloodGroup: "O+", phone: "9876543210", city: "Chennai", ...over,
});
const addDonor = async (over) => (await request(app).post("/api/donors").send(donorBody(over))).body;
const stockOf = async (g) => (await request(app).get("/api/inventory")).body.find((r) => r.bloodGroup === g).unitsAvailable;

// Creates a donation and marks screening as passed -> adds units to stock.
async function addStock(group, units, phone) {
  const donor = await addDonor({ bloodGroup: group, phone });
  let d;
  // A single donation is capped at 2 units, so split larger amounts.
  for (let left = units; left > 0; left -= 2) {
    d = (await request(app).post("/api/donations").send({ donorId: donor._id, unitsCollected: Math.min(2, left) })).body;
    await request(app).patch(`/api/donations/${d._id}/screening`).send({ screeningStatus: "passed" });
  }
  return { donor, donation: d };
}

describe("donors", () => {
  test("create, read, update, delete", async () => {
    const created = await request(app).post("/api/donors").send(donorBody());
    expect(created.status).toBe(201);
    const id = created.body._id;
    expect((await request(app).get(`/api/donors/${id}`)).body.name).toBe("Arun Kumar");
    const upd = await request(app).put(`/api/donors/${id}`).send({ city: "Madurai" });
    expect(upd.body.city).toBe("Madurai");
    expect((await request(app).delete(`/api/donors/${id}`)).status).toBe(200);
    expect((await request(app).get(`/api/donors/${id}`)).status).toBe(404);
  });

  test("rejects invalid data", async () => {
    for (const bad of [{ age: 10 }, { bloodGroup: "Z+" }, { phone: "123" }, { name: "" }]) {
      expect((await request(app).post("/api/donors").send(donorBody(bad))).status).toBe(400);
    }
  });

  test("duplicate phone is rejected with 409", async () => {
    await addDonor();
    expect((await request(app).post("/api/donors").send(donorBody({ name: "Other" }))).status).toBe(409);
  });

  test("search by blood group and name, regex input is treated literally", async () => {
    await addDonor();
    await addDonor({ name: "Priya Nair", bloodGroup: "A+", phone: "9876543211" });
    expect((await request(app).get("/api/donors?bloodGroup=A%2B")).body).toHaveLength(1);
    expect((await request(app).get("/api/donors?q=priya")).body).toHaveLength(1);
    expect((await request(app).get("/api/donors?q=.*")).body).toHaveLength(0);
  });

  test("malformed id returns 400, unknown id 404", async () => {
    expect((await request(app).get("/api/donors/abc")).status).toBe(400);
    expect((await request(app).get(`/api/donors/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
  });

  test("donor with donations cannot be deleted", async () => {
    const { donor } = await addStock("O+", 1, "9000000001");
    expect((await request(app).delete(`/api/donors/${donor._id}`)).status).toBe(409);
  });
});

describe("donations and stock", () => {
  test("stock is added once, only when screening passes", async () => {
    const donor = await addDonor();
    const d = (await request(app).post("/api/donations").send({ donorId: donor._id, unitsCollected: 2 })).body;
    expect(d.bloodGroup).toBe("O+");
    expect(await stockOf("O+")).toBe(0);
    expect((await request(app).patch(`/api/donations/${d._id}/screening`).send({ screeningStatus: "passed" })).status).toBe(200);
    expect(await stockOf("O+")).toBe(2);
    expect((await request(app).patch(`/api/donations/${d._id}/screening`).send({ screeningStatus: "passed" })).status).toBe(409);
    expect(await stockOf("O+")).toBe(2);
  });

  test("failed screening adds nothing", async () => {
    const donor = await addDonor();
    const d = (await request(app).post("/api/donations").send({ donorId: donor._id, unitsCollected: 1 })).body;
    await request(app).patch(`/api/donations/${d._id}/screening`).send({ screeningStatus: "failed" });
    expect(await stockOf("O+")).toBe(0);
  });

  test("ineligible or unknown donor cannot donate; bad screening value rejected", async () => {
    const donor = await addDonor({ eligible: false });
    expect((await request(app).post("/api/donations").send({ donorId: donor._id, unitsCollected: 1 })).status).toBe(409);
    expect((await request(app).post("/api/donations").send({ donorId: new mongoose.Types.ObjectId(), unitsCollected: 1 })).status).toBe(404);
    const ok = await addDonor({ phone: "9000000002" });
    const d = (await request(app).post("/api/donations").send({ donorId: ok._id, unitsCollected: 1 })).body;
    expect((await request(app).patch(`/api/donations/${d._id}/screening`).send({ screeningStatus: "maybe" })).status).toBe(400);
  });
});

describe("blood requests", () => {
  const makeRequest = async (over = {}) =>
    (await request(app).post("/api/requests").send({ requester: "Ravi", hospital: "City Hospital", bloodGroup: "O+", unitsRequested: 2, ...over })).body;
  const setStatus = (id, status) => request(app).patch(`/api/requests/${id}/status`).send({ status });

  test("creating, approving and rejecting do not change stock", async () => {
    await addStock("O+", 5, "9000000003");
    const r = await makeRequest();
    expect(r.status).toBe("pending");
    expect(await stockOf("O+")).toBe(5);
    await setStatus(r._id, "approved");
    expect(await stockOf("O+")).toBe(5);
    const r2 = await makeRequest();
    await setStatus(r2._id, "rejected");
    expect(await stockOf("O+")).toBe(5);
  });

  test("fulfilling deducts stock exactly once", async () => {
    await addStock("O+", 5, "9000000004");
    const r = await makeRequest();
    await setStatus(r._id, "approved");
    expect((await setStatus(r._id, "fulfilled")).status).toBe(200);
    expect(await stockOf("O+")).toBe(3);
    expect((await setStatus(r._id, "fulfilled")).status).toBe(409);
    expect(await stockOf("O+")).toBe(3);
  });

  test("insufficient stock blocks fulfilment and keeps request approved", async () => {
    await addStock("O+", 1, "9000000005");
    const r = await makeRequest({ unitsRequested: 3 });
    await setStatus(r._id, "approved");
    const res = await setStatus(r._id, "fulfilled");
    expect(res.status).toBe(409);
    expect(await stockOf("O+")).toBe(1);
    const list = (await request(app).get("/api/requests?status=approved")).body;
    expect(list).toHaveLength(1);
  });

  test("concurrent fulfil calls deduct only once", async () => {
    await addStock("O+", 10, "9000000006");
    const r = await makeRequest({ unitsRequested: 4 });
    await setStatus(r._id, "approved");
    const results = await Promise.all([setStatus(r._id, "fulfilled"), setStatus(r._id, "fulfilled"), setStatus(r._id, "fulfilled")]);
    expect(results.filter((x) => x.status === 200)).toHaveLength(1);
    expect(await stockOf("O+")).toBe(6);
  });

  test("invalid transitions and validation errors", async () => {
    const r = await makeRequest();
    expect((await setStatus(r._id, "fulfilled")).status).toBe(409); // pending -> fulfilled not allowed
    expect((await setStatus(r._id, "bogus")).status).toBe(409);
    expect((await request(app).post("/api/requests").send({ requester: "X", bloodGroup: "O+", unitsRequested: 0 })).status).toBe(400);
  });
});

describe("auth and hardening", () => {
  const withAuth = async (fn) => {
    process.env.AUTH_DISABLED = "false";
    try { await fn(); } finally { process.env.AUTH_DISABLED = "true"; }
  };

  test("API requires a token; health stays public", () => withAuth(async () => {
    expect((await request(app).get("/api/donors")).status).toBe(401);
    expect((await request(app).get("/api/donors").set("Authorization", "Bearer junk")).status).toBe(401);
    expect((await request(app).get("/api/health")).status).toBe(200);
  }));

  test("login with wrong password fails, correct password gives a working token", () => withAuth(async () => {
    expect((await request(app).post("/api/auth/login").send({ username: "admin", password: "nope" })).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ username: { $ne: 1 }, password: { $ne: 1 } })).status).toBe(401);
    const res = await request(app).post("/api/auth/login").send({ username: "admin", password: "admin123" });
    expect(res.status).toBe(200);
    const ok = await request(app).get("/api/donors").set("Authorization", `Bearer ${res.body.token}`);
    expect(ok.status).toBe(200);
    // Tampered token is rejected
    const bad = await request(app).get("/api/donors").set("Authorization", `Bearer ${res.body.token}x`);
    expect(bad.status).toBe(401);
  }));

  test("security headers are set", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBe(undefined);
  });

  test("future donation date is rejected", async () => {
    const donor = await addDonor();
    const future = new Date(Date.now() + 5 * 86400000).toISOString();
    const res = await request(app).post("/api/donations").send({ donorId: donor._id, unitsCollected: 1, donationDate: future });
    expect(res.status).toBe(400);
  });

  test("non-string status values are rejected", async () => {
    const r = (await request(app).post("/api/requests").send({ requester: "R", bloodGroup: "O+", unitsRequested: 1 })).body;
    expect((await request(app).patch(`/api/requests/${r._id}/status`).send({ status: { $ne: 1 } })).status).toBe(409);
  });
});

describe("inventory and dashboard", () => {
  test("inventory lists all eight groups with status", async () => {
    await addStock("A+", 20, "9000000007");
    const inv = (await request(app).get("/api/inventory")).body;
    expect(inv).toHaveLength(8);
    expect(inv.find((r) => r.bloodGroup === "A+")).toMatchObject({ unitsAvailable: 20, status: "Good" });
    expect(inv.find((r) => r.bloodGroup === "B-").status).toBe("Low");
  });

  test("dashboard totals", async () => {
    await addStock("O+", 4, "9000000008");
    await request(app).post("/api/requests").send({ requester: "R", bloodGroup: "O+", unitsRequested: 1 });
    const d = (await request(app).get("/api/dashboard")).body;
    expect(d).toMatchObject({ totalDonors: 1, totalUnits: 4, pendingRequests: 1, fulfilledRequests: 0 });
  });

  test("malformed JSON gives 400", async () => {
    const res = await request(app).post("/api/donors").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
  });
});
