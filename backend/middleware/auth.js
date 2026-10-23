const crypto = require("crypto");

// Stateless admin auth: HMAC-signed token "<base64url payload>.<signature>", no extra dependencies.
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

const sign = (data) => crypto.createHmac("sha256", secret).update(data).digest("base64url");
const safeEqual = (a, b) => {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

const authDisabled = () => process.env.AUTH_DISABLED === "true";

function issueToken(user) {
  const payload = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + TOKEN_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (typeof token !== "string") return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined || !safeEqual(sig, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

// Simple in-memory limiter: max failed logins per IP per window.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 10;
const fails = new Map();
const tooMany = (ip) => {
  const rec = fails.get(ip);
  return Boolean(rec && rec.reset > Date.now() && rec.count >= MAX_FAILS);
};
const recordFail = (ip) => {
  const rec = fails.get(ip);
  if (!rec || rec.reset <= Date.now()) fails.set(ip, { count: 1, reset: Date.now() + WINDOW_MS });
  else rec.count += 1;
};

function login(req, res) {
  const ip = req.ip;
  if (tooMany(ip)) return res.status(429).json({ error: "Too many failed attempts. Try again later." });
  const { username, password } = req.body || {};
  const expectedUser = process.env.ADMIN_USER || "admin";
  const expectedPass = process.env.ADMIN_PASSWORD || "admin123";
  // Both comparisons always run (no short-circuit) so timing does not reveal which field was wrong.
  const userOk = typeof username === "string" && safeEqual(username, expectedUser);
  const passOk = typeof password === "string" && safeEqual(password, expectedPass);
  if (!(userOk && passOk)) {
    recordFail(ip);
    return res.status(401).json({ error: "Invalid username or password" });
  }
  fails.delete(ip);
  res.json({ token: issueToken(expectedUser), expiresInMs: TOKEN_TTL_MS });
}

function requireAuth(req, res, next) {
  if (authDisabled()) return next();
  const header = req.get("authorization") || "";
  if (header.startsWith("Bearer ") && verifyToken(header.slice(7))) return next();
  res.status(401).json({ error: "Authentication required" });
}

// Baseline security headers; CSP allows only same-origin scripts/styles.
function securityHeaders(req, res, next) {
  res.set({
    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  });
  next();
}

module.exports = { login, requireAuth, securityHeaders, issueToken, verifyToken };
