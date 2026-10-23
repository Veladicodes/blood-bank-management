const API = "/api";
const GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const $ = (id) => document.getElementById(id);

// Build DOM nodes with textContent so server data is never parsed as HTML.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) node.append(c);
  return node;
}

// Login token lives in sessionStorage (cleared when the tab closes).
const getToken = () => { try { return sessionStorage.getItem("token"); } catch { return null; } };
const setToken = (t) => { try { t ? sessionStorage.setItem("token", t) : sessionStorage.removeItem("token"); } catch { /* storage unavailable */ } };

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch(API + path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/auth/login") {
    setToken(null);
    route();
    throw new Error("Session expired. Please log in again.");
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let messageTimer;
function showMessage(text, type = "success") {
  const box = $("message");
  box.textContent = text;
  box.className = `message ${type}`;
  box.hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => (box.hidden = true), 5000);
}

// Wrap an async handler so failures are shown to the user.
const guard = (fn) => async (...args) => {
  try { await fn(...args); } catch (e) { showMessage(e.message, "error"); }
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "-");
const badge = (text, cls) => el("span", { className: `badge ${cls}`, textContent: text });
const emptyRow = (cols, text) => el("tr", {}, el("td", { colSpan: cols, className: "empty", textContent: text }));
const groupOptions = () => GROUPS.map((g) => el("option", { value: g, textContent: g }));

/* ---------- navigation ---------- */
const pages = ["dashboard", "donors", "inventory", "requests"];
const loaders = { dashboard: loadDashboard, donors: loadDonors, inventory: loadInventory, requests: loadRequests };

function route() {
  const loggedIn = Boolean(getToken());
  $("logout").hidden = !loggedIn;
  $("page-login").hidden = loggedIn;
  if (!loggedIn) {
    for (const p of pages) $(`page-${p}`).hidden = true;
    return;
  }
  const page = pages.includes(location.hash.slice(1)) ? location.hash.slice(1) : "dashboard";
  for (const p of pages) $(`page-${p}`).hidden = p !== page;
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("active", a.dataset.page === page));
  guard(loaders[page])();
}

/* ---------- dashboard ---------- */
async function loadDashboard() {
  const d = await api("/dashboard");
  const items = [
    ["Total donors", d.totalDonors], ["Units in stock", d.totalUnits], ["Pending requests", d.pendingRequests],
    ["Approved requests", d.approvedRequests], ["Fulfilled requests", d.fulfilledRequests], ["Rejected requests", d.rejectedRequests],
  ];
  $("cards").replaceChildren(...items.map(([label, value]) =>
    el("div", { className: "card" }, el("div", { className: "value", textContent: String(value) }), el("div", { className: "label", textContent: label }))));
}

/* ---------- donors ---------- */
async function loadDonors() {
  const params = new URLSearchParams();
  if ($("f-q").value.trim()) params.set("q", $("f-q").value.trim());
  if ($("f-group").value) params.set("bloodGroup", $("f-group").value);
  if ($("f-city").value.trim()) params.set("city", $("f-city").value.trim());
  const [donors, allDonors, donations] = await Promise.all([
    api(`/donors?${params}`), api("/donors"), api("/donations"),
  ]);

  $("donor-rows").replaceChildren(...(donors.length ? donors.map((d) => el("tr", {},
    el("td", { textContent: d.name }), el("td", { textContent: d.age }), el("td", { textContent: d.bloodGroup }),
    el("td", { textContent: d.phone }), el("td", { textContent: d.city }),
    el("td", {}, badge(d.eligible ? "Yes" : "No", d.eligible ? "ok" : "muted")),
    el("td", { className: "actions-cell" },
      el("button", { className: "small secondary", textContent: "Edit", onclick: () => startEdit(d) }),
      el("button", { className: "small danger", textContent: "Delete", onclick: guard(() => removeDonor(d)) })),
  )) : [emptyRow(7, "No donors found")]));

  const selected = $("dn-donor").value;
  $("dn-donor").replaceChildren(...allDonors.filter((d) => d.eligible)
    .map((d) => el("option", { value: d._id, textContent: `${d.name} (${d.bloodGroup})` })));
  if (selected) $("dn-donor").value = selected;
  $("dn-submit").disabled = !$("dn-donor").options.length;

  const cls = { passed: "ok", failed: "bad", pending: "warn" };
  $("donation-rows").replaceChildren(...(donations.length ? donations.map((n) => el("tr", {},
    el("td", { textContent: fmtDate(n.donationDate) }), el("td", { textContent: n.donorId?.name ?? "(deleted)" }),
    el("td", { textContent: n.bloodGroup }), el("td", { textContent: n.unitsCollected }),
    el("td", {}, badge(n.screeningStatus, cls[n.screeningStatus])),
    el("td", { className: "actions-cell" }, ...(n.screeningStatus === "pending" ? [
      el("button", { className: "small", textContent: "Pass", onclick: guard(() => screen(n._id, "passed")) }),
      el("button", { className: "small danger", textContent: "Fail", onclick: guard(() => screen(n._id, "failed")) }),
    ] : [])),
  )) : [emptyRow(6, "No donations recorded")]));
}

function startEdit(d) {
  $("donor-id").value = d._id;
  $("d-name").value = d.name; $("d-age").value = d.age; $("d-group").value = d.bloodGroup;
  $("d-phone").value = d.phone; $("d-city").value = d.city; $("d-eligible").checked = d.eligible;
  $("donor-submit").textContent = "Save changes";
  $("donor-cancel").hidden = false;
  $("d-name").focus();
}

function resetDonorForm() {
  $("donor-form").reset();
  $("donor-id").value = "";
  $("donor-submit").textContent = "Add donor";
  $("donor-cancel").hidden = true;
}

async function removeDonor(d) {
  if (!confirm(`Delete donor ${d.name}?`)) return;
  await api(`/donors/${d._id}`, { method: "DELETE" });
  showMessage("Donor deleted");
  await loadDonors();
}

async function screen(id, screeningStatus) {
  await api(`/donations/${id}/screening`, { method: "PATCH", body: { screeningStatus } });
  showMessage(`Screening marked ${screeningStatus}`);
  await loadDonors();
}

/* ---------- inventory ---------- */
async function loadInventory() {
  const rows = await api("/inventory");
  const cls = { Low: "bad", Adequate: "warn", Good: "ok" };
  $("inventory-rows").replaceChildren(...rows.map((r) => el("tr", {},
    el("td", { textContent: r.bloodGroup }), el("td", { textContent: r.unitsAvailable }),
    el("td", {}, badge(r.status, cls[r.status])), el("td", { textContent: fmtDate(r.lastUpdated) }))));
}

/* ---------- requests ---------- */
async function loadRequests() {
  const status = $("r-filter").value;
  const list = await api(`/requests${status ? `?status=${encodeURIComponent(status)}` : ""}`);
  const cls = { pending: "warn", approved: "ok", fulfilled: "ok", rejected: "bad" };
  const next = { pending: [["approved", "Approve"], ["rejected", "Reject"]], approved: [["fulfilled", "Fulfil"], ["rejected", "Reject"]] };
  $("request-rows").replaceChildren(...(list.length ? list.map((r) => el("tr", {},
    el("td", { textContent: r.requester }), el("td", { textContent: r.hospital || "-" }),
    el("td", { textContent: r.bloodGroup }), el("td", { textContent: r.unitsRequested }),
    el("td", {}, badge(r.status, cls[r.status])),
    el("td", { className: "actions-cell" }, ...(next[r.status] || []).map(([s, label]) =>
      el("button", { className: `small ${s === "rejected" ? "danger" : ""}`, textContent: label, onclick: guard(() => setStatus(r._id, s)) }))),
  )) : [emptyRow(6, "No requests found")]));
}

async function setStatus(id, status) {
  await api(`/requests/${id}/status`, { method: "PATCH", body: { status } });
  showMessage(`Request ${status}`);
  await loadRequests();
}

/* ---------- wiring ---------- */
$("login-form").addEventListener("submit", guard(async (e) => {
  e.preventDefault();
  const { token } = await api("/auth/login", { method: "POST", body: { username: $("l-user").value, password: $("l-pass").value } });
  setToken(token);
  $("l-pass").value = "";
  route();
}));
$("logout").addEventListener("click", () => { setToken(null); route(); });

$("donor-form").addEventListener("submit", guard(async (e) => {
  e.preventDefault();
  const id = $("donor-id").value;
  const body = {
    name: $("d-name").value.trim(), age: Number($("d-age").value), bloodGroup: $("d-group").value,
    phone: $("d-phone").value.trim(), city: $("d-city").value.trim(), eligible: $("d-eligible").checked,
  };
  await api(id ? `/donors/${id}` : "/donors", { method: id ? "PUT" : "POST", body });
  showMessage(id ? "Donor updated" : "Donor registered");
  resetDonorForm();
  await loadDonors();
}));
$("donor-cancel").addEventListener("click", resetDonorForm);

$("donation-form").addEventListener("submit", guard(async (e) => {
  e.preventDefault();
  await api("/donations", { method: "POST", body: { donorId: $("dn-donor").value, unitsCollected: Number($("dn-units").value) } });
  showMessage("Donation recorded; mark the screening result to add it to stock");
  await loadDonors();
}));

$("request-form").addEventListener("submit", guard(async (e) => {
  e.preventDefault();
  await api("/requests", { method: "POST", body: {
    requester: $("r-requester").value.trim(), hospital: $("r-hospital").value.trim(),
    bloodGroup: $("r-group").value, unitsRequested: Number($("r-units").value),
  } });
  showMessage("Request submitted");
  e.target.reset();
  await loadRequests();
}));

let searchTimer;
for (const id of ["f-q", "f-city"]) {
  $(id).addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(guard(loadDonors), 250); });
}
$("f-group").addEventListener("change", guard(loadDonors));
$("r-filter").addEventListener("change", guard(loadRequests));

$("d-group").replaceChildren(...groupOptions());
$("r-group").replaceChildren(...groupOptions());
$("f-group").append(...groupOptions());
window.addEventListener("hashchange", route);
route();
