const mongoose = require("mongoose");

// Connects to MONGO_URI, or to a throwaway in-memory MongoDB when USE_MEMORY_DB=true.
async function connect() {
  let uri = process.env.MONGO_URI;
  if (process.env.USE_MEMORY_DB === "true") {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    const mem = await MongoMemoryServer.create();
    uri = mem.getUri("bloodbank");
    console.log("Using in-memory MongoDB (data is lost on exit)");
  }
  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

module.exports = { connect };
