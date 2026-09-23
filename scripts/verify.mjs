/**
 * End-to-end verification for the citizen platform: auth, the report ledger,
 * and the Cloudinary image lifecycle.
 *
 *   npm run verify            # against http://localhost:3000
 *   VERIFY_BASE=http://localhost:3001 npm run verify
 *
 * Needs the dev server running (it exercises the real routes) and the Neon +
 * Cloudinary credentials from .env.local. It creates one throwaway ticket per
 * run and deletes it again through the API, and it signs the probe account in
 * and out on its own cookie jar — a browser session already open on that
 * account is untouched, because sessions are independent rows.
 *
 * Exits non-zero on the first failing expectation group, printing each check.
 */
import { Client } from "pg";
import { v2 as cloudinary } from "cloudinary";

const BASE = process.env.VERIFY_BASE ?? "http://localhost:3000";
const ACCOUNT = {
  identifier: "qoder.auth.test.2309@gmail.com",
  password: "Civic#Test2026",
};

/* A 1x1 PNG stands in for the canvas-downscaled square the picker sends. */
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let passed = 0;
const failures = [];
let group = "";

const check = (label, ok, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failures.push(`${group} → ${label}${detail ? ` (${detail})` : ""}`);
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const section = (name) => {
  group = name;
  console.log(`\n\x1b[1m${name}\x1b[0m`);
};

/* One cookie jar per run, so the suite never fights a browser session. */
let cookie = "";
async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...init.headers,
    },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 120) };
  }
  return { status: res.status, body };
}
const page = async (path) => {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") };
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});
const assetIds = async () => {
  const { resources } = await cloudinary.api.resources({
    type: "upload",
    prefix: "sada-e-awam/",
    max_results: 200,
  });
  return new Set(resources.map((r) => r.public_id.split("/").pop()));
};
const leaf = (url) => (url ?? "").split("/").pop().replace(/\.\w+$/, "");

const db = new Client({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
});
await db.connect();
const rowOf = async (id) =>
  (
    await db.query(
      "select id, status, assigned_unit, upvotes, photo_url, after_photo_url, user_id from reports where id = $1",
      [id]
    )
  ).rows[0];

console.log(`verify ${BASE} · account ${ACCOUNT.identifier}`);

/* ------------------------------- 1. sessions ------------------------------ */
section("Auth");
cookie = "";
let me = await api("/api/auth/me");
check("signed-out /api/auth/me reports authenticated:false", me.body.authenticated === false, JSON.stringify(me.body).slice(0, 60));

let probe = await api("/api/reports", { method: "POST", body: JSON.stringify({}) });
check("anonymous POST /api/reports → 401 AUTH_REQUIRED", probe.status === 401 && probe.body.code === "AUTH_REQUIRED", `${probe.status} ${probe.body.code}`);

probe = await api("/api/reports?mine=1");
check("anonymous GET /api/reports?mine=1 → 401", probe.status === 401, String(probe.status));

probe = await api("/api/auth/signin", {
  method: "POST",
  body: JSON.stringify({ identifier: ACCOUNT.identifier, password: "wrong-password-123" }),
});
const wrongPassword = probe.body.error;
check("wrong password → 401", probe.status === 401, String(probe.status));

probe = await api("/api/auth/signin", {
  method: "POST",
  body: JSON.stringify({ identifier: "nobody-not-a-real-address@example.com", password: "whatever-123" }),
});
check("unknown account answers with byte-identical text (no enumeration)", probe.status === 401 && probe.body.error === wrongPassword, JSON.stringify(probe.body.error));

probe = await api("/api/auth/signup", {
  method: "POST",
  body: JSON.stringify({ name: "Ab", email: "not-an-email", phone: "123", district: "Sialkot", password: "short" }),
});
check("signup rejects every weak field (422 + field errors)", probe.status === 422 && Object.keys(probe.body.field_errors ?? {}).length >= 3, `${probe.status} ${JSON.stringify(Object.keys(probe.body.field_errors ?? {}))}`);

probe = await api("/api/auth/signin", {
  method: "POST",
  body: JSON.stringify({ ...ACCOUNT, remember: true }),
});
check("correct credentials sign in", probe.status === 200 && probe.body.user?.email === ACCOUNT.identifier, `${probe.status}`);
/* A second session on the same account, so the last section can prove that
   revoking one does not log the other out. */
const sessionA = cookie;
await api("/api/auth/signin", { method: "POST", body: JSON.stringify({ ...ACCOUNT, remember: true }) });
const sessionB = cookie;

/* ---------------------------- 2. profile writes --------------------------- */
section("Profile");
let before = await api("/api/auth/me");
const avatarBefore = before.body.settings.avatar_url;

probe = await api("/api/auth/me", {
  method: "PUT",
  body: JSON.stringify({ name: "Qoder T. Citizen", reports_filed: 9999, email: "evil@evil.test", id: "cit_other", avatar_url: "data:image/png;base64,AAAA" }),
});
let after = await api("/api/auth/me");
check("PUT strips server-owned counters, email, id and the portrait", after.body.settings.reports_filed === before.body.settings.reports_filed && after.body.settings.email === ACCOUNT.identifier && after.body.settings.id === before.body.settings.id && after.body.settings.avatar_url === avatarBefore, JSON.stringify(after.body.settings.avatar_url)?.slice(0, 40));

probe = await api("/api/auth/avatar", { method: "POST", body: JSON.stringify({ image: "https://evil.example/x.png" }) });
check("avatar endpoint rejects a non-image payload (422)", probe.status === 422, String(probe.status));

probe = await api("/api/auth/avatar", { method: "POST", body: JSON.stringify({ image: PIXEL }) });
const avatarUrl = probe.body.url ?? "";
check("avatar upload returns a Cloudinary URL", probe.status === 200 && avatarUrl.startsWith("https://res.cloudinary.com/"), avatarUrl.slice(0, 52));
check("the portrait is readable back through /api/auth/me", (await api("/api/auth/me")).body.settings.avatar_url === avatarUrl);

const replaced = await api("/api/auth/avatar", { method: "POST", body: JSON.stringify({ image: PIXEL }) });
const assetsAfterReplace = await assetIds();
check("replacing the portrait destroys the previous asset", replaced.status === 200 && !assetsAfterReplace.has(leaf(avatarUrl)), leaf(avatarUrl));

probe = await api("/api/auth/avatar", { method: "DELETE" });
const assetsAfterDelete = await assetIds();
check("removing the portrait clears the column and destroys the asset", probe.status === 200 && !assetsAfterDelete.has(leaf(replaced.body.url)) && (await api("/api/auth/me")).body.settings.avatar_url === undefined, leaf(replaced.body.url));

/* ------------------------- 3. filing + dispatch flow ---------------------- */
section("Ledger");
const template = (
  await db.query(
    "select city_id, city_name, area_id, area_name, jurisdiction, category_id, category_title, assigned_agency from reports order by created_at desc limit 1"
  )
).rows[0];
const filed = await api("/api/reports", {
  method: "POST",
  body: JSON.stringify({
    ...template,
    sla_hours: 24,
    urgency: "medium",
    description: "Verification-suite ticket — safe to delete.",
    title: "Verification suite",
    photo_url: PIXEL,
  }),
});
const ticket = filed.body.report?.id ?? "";
const citizenPhoto = leaf(filed.body.report?.photo_url);
check("signed-in citizen files a ticket (201 + #TICKET)", filed.status === 201 && /^#/.test(ticket), `${filed.status} ${ticket}`);
check("the row is attributed to the account, not the body", (await rowOf(ticket))?.user_id === before.body.settings.id);
check("evidence photo landed in Cloudinary and the row stores the URL", citizenPhoto !== "" && (await assetIds()).has(citizenPhoto), citizenPhoto);

let row = await rowOf(ticket);
const upvoted = row?.upvotes;
await api("/api/reports", { method: "PATCH", body: JSON.stringify({ id: ticket, upvote: true }) });
check("upvote increments the ledger count", (await rowOf(ticket)).upvotes === (upvoted ?? 0) + 1);

probe = await api("/api/reports", { method: "PATCH", body: JSON.stringify({ id: ticket, status: "bogus" }) });
check("an unknown status is rejected (400)", probe.status === 400, String(probe.status));

probe = await api("/api/reports", { method: "PATCH", body: JSON.stringify({ id: ticket, status: "resolved", after_photo_url: PIXEL, resolution_notes: "fixed" }) });
const firstProof = leaf(probe.body.report?.after_photo_url);
check("squad resolve stores a proof photo", probe.status === 200 && (await assetIds()).has(firstProof), firstProof);

probe = await api("/api/reports", { method: "PATCH", body: JSON.stringify({ id: ticket, status: "resolved", after_photo_url: PIXEL, resolution_notes: "re-fixed" }) });
const secondProof = leaf(probe.body.report?.after_photo_url);
check("a replaced proof destroys the earlier asset", secondProof !== firstProof && !(await assetIds()).has(firstProof), `${firstProof} → ${secondProof}`);

probe = await api("/api/reports", { method: "PATCH", body: JSON.stringify({ id: ticket, status: "triage", after_photo_url: PIXEL }) });
check("proof + re-open answers 400 instead of 500", probe.status === 400, `${probe.status} ${JSON.stringify(probe.body.error).slice(0, 60)}`);

probe = await api("/api/reports", { method: "PATCH", body: JSON.stringify({ id: ticket, status: "triage", assigned_unit: "Squad-9" }) });
row = await rowOf(ticket);
check("assigned_unit + re-open no longer breaks the UPDATE, and the crew clears", probe.status === 200 && row.status === "triage" && row.assigned_unit === null && row.after_photo_url === null, JSON.stringify({ s: probe.status, u: row?.assigned_unit, p: row?.after_photo_url }));

/* ------------------------------ 4. deletion ------------------------------- */
section("Delete");
const assetsPreDelete = await assetIds();
check("the re-open above already retired the proof asset", !assetsPreDelete.has(secondProof), secondProof);
check("the citizen's evidence photo is still referenced", assetsPreDelete.has(citizenPhoto), citizenPhoto);

probe = await api(`/api/reports?id=${encodeURIComponent(ticket)}`, { method: "DELETE" });
const assetsPostDelete = await assetIds();
check("DELETE removes the ticket", probe.status === 200 && probe.body.deleted === ticket && (await rowOf(ticket)) === undefined, `${probe.status} ${probe.body.deleted}`);
check("deleting the ticket destroys its remaining evidence photo", !assetsPostDelete.has(citizenPhoto), citizenPhoto);

probe = await api(`/api/reports?id=${encodeURIComponent(ticket)}`, { method: "DELETE" });
check("deleting twice answers 404", probe.status === 404, String(probe.status));

probe = await api("/api/reports?id=", { method: "DELETE" });
check("a delete with no id is rejected (400)", probe.status === 400, String(probe.status));

/* -------------------------------- 5. gates -------------------------------- */
section("Gates & pages");
const signedOut = { cookie: "sada_session=garbage-value" };
probe = await api("/api/reports", { method: "POST", headers: signedOut, body: JSON.stringify({}) });
check("a forged session cookie is not a session", probe.status === 401, String(probe.status));

let rendered = await page("/report");
check("/report redirects a signed-out visitor to /auth", [302, 307, 308].includes(rendered.status) && (rendered.location ?? "").startsWith("/auth"), `${rendered.status} → ${rendered.location}`);
rendered = await page("/settings");
check("/settings redirects too", [302, 307, 308].includes(rendered.status), `${rendered.status} → ${rendered.location}`);

rendered = await page("/report?city=sialkot&tab=x");
check("the redirect preserves the deep link", (rendered.location ?? "").includes("redirect=%2Freport%3Fcity%3Dsialkot"), rendered.location ?? "");

for (const path of ["/", "/feed", "/auth", "/track", "/departments", "/sitemap", "/blueprint", "/admin/triage"]) {
  const res = await fetch(`${BASE}${path}`);
  check(`${path} renders`, res.status === 200, String(res.status));
}

/* --------------------- 6. portrait restore + sign out --------------------- */
/* Give the probe account a portrait again — the Profile section deleted the
   last one — using a real photo already in the bucket. */
const donor = (
  await db.query("select photo_url from reports where photo_url like 'https://%' limit 1")
).rows[0]?.photo_url;
if (donor) {
  const bytes = Buffer.from(await (await fetch(donor)).arrayBuffer()).toString("base64");
  probe = await api("/api/auth/avatar", { method: "POST", body: JSON.stringify({ image: `data:image/jpeg;base64,${bytes}` }) });
  check("the probe account is left with a portrait", probe.status === 200 && Boolean(probe.body.url), String(probe.status));
}

section("Sign out");
probe = await api("/api/auth/signout", { method: "POST" });
check("sign-out succeeds", probe.status === 200, String(probe.status));
cookie = sessionB;
probe = await api("/api/auth/me");
check("the revoked token no longer authenticates", probe.body.authenticated === false, JSON.stringify(probe.body).slice(0, 60));
cookie = sessionA;
probe = await api("/api/auth/me");
check("a second session on the same account survives it", probe.body.authenticated === true, JSON.stringify(probe.body).slice(0, 60));
await api("/api/auth/signout", { method: "POST" });
cookie = sessionA;
probe = await api("/api/auth/me");
check("and that session is revoked by its own sign-out", probe.body.authenticated === false, JSON.stringify(probe.body).slice(0, 60));

await db.end();
console.log(`\n\x1b[1m${passed} passed, ${failures.length} failed\x1b[0m`);
if (failures.length) {
  for (const f of failures) console.log(`  \x1b[31m✗\x1b[0m ${f}`);
  process.exit(1);
}
