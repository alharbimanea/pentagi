// End-to-end acceptance run against a live app and a local Supabase stack
// (`supabase start`, `npm run dev` with PAYMENTS_SANDBOX_ENABLED=true).
// Drives two browsers — a customer and the owner — through the whole order
// lifecycle and checks the security boundaries on the way.
//
//   APP_URL=http://localhost:3000 SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SERVICE_ROLE_KEY=... node e2e/full-flow.cjs
//
// Needs the `playwright` package and a Chromium (`npx playwright install chromium`).

const { createHmac, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const APP = process.env.APP_URL ?? "http://localhost:3000";
const SUPABASE = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SHOTS = process.env.SCREENSHOT_DIR ?? path.join(os.tmpdir(), "researchdesk-e2e");
if (!SERVICE) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
fs.mkdirSync(SHOTS, { recursive: true });

const run = randomUUID().slice(0, 8);
const customer = { email: `customer-${run}@example.com`, password: "Research#2026", name: "Sara Customer" };
const intruder = { email: `intruder-${run}@example.com`, password: "Intruder#2026", name: "Ian Intruder" };
const owner = { email: `owner-${run}@example.com`, password: "Owner#Pass2026" };

let step = 0;
function log(message) {
  step += 1;
  console.log(`✓ ${String(step).padStart(2, "0")} ${message}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function service(pathname, init = {}) {
  const res = await fetch(`${SUPABASE}${pathname}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${pathname}: HTTP ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

function pdfFile(name) {
  const file = path.join(SHOTS, name);
  fs.writeFileSync(file, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  return file;
}

async function signIn(page, who) {
  await page.goto(`${APP}/en/login`);
  await page.fill("#email", who.email);
  await page.fill("#password", who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function register(page, who) {
  await page.goto(`${APP}/en/register`);
  await page.fill("#full_name", who.name);
  await page.fill("#email", who.email);
  await page.fill("#password", who.password);
  await page.check('input[name="accept"]');
  await page.getByRole("button", { name: "Create your account" }).click();
  await page.getByText("Check your inbox").waitFor();
}

async function orderStatus(orderId) {
  const [row] = await service(`/rest/v1/orders?id=eq.${orderId}&select=status`);
  return row.status;
}

async function waitForStatus(orderId, expected) {
  for (let i = 0; i < 40; i++) {
    if ((await orderStatus(orderId)) === expected) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`order did not reach ${expected}; it is ${await orderStatus(orderId)}`);
}

async function adminMove(page, orderId, to) {
  await page.goto(`${APP}/en/admin/orders/${orderId}`);
  await page.selectOption('select[name="to"]', to);
  await page.getByRole("button", { name: "Confirm" }).click();
  await waitForStatus(orderId, to);
}

let cust;
let admin;

(async () => {
  // Repeated local runs would otherwise trip the per-IP registration limit.
  await service("/rest/v1/rate_limits?key=neq.__none__", { method: "DELETE", headers: { Prefer: "return=minimal" } });
  const browser = await chromium.launch();
  cust = await (await browser.newContext({ locale: "en-US", timezoneId: "Asia/Riyadh" })).newPage();
  admin = await (await browser.newContext({ locale: "en-US", timezoneId: "Asia/Riyadh" })).newPage();
  const evil = await (await browser.newContext()).newPage();

  // Registration enforces the shared password policy server-side too.
  await cust.goto(`${APP}/en/register`);
  await cust.fill("#full_name", customer.name);
  await cust.fill("#email", customer.email);
  await cust.fill("#password", "weakpass1");
  await cust.check('input[name="accept"]');
  await cust.getByRole("button", { name: "Create your account" }).click();
  await cust.getByText("Under 16 characters").first().waitFor();
  log("weak password rejected");
  await register(cust, customer);
  await signIn(cust, customer);
  await cust.waitForURL(/\/en\/portal$/);
  log("customer registered and signed in");

  // Order wizard: draft save, live estimate, upload, submit.
  await cust.goto(`${APP}/en/portal/orders/new?service=editing-proofreading`);
  await cust.getByRole("button", { name: "Next", exact: true }).click();
  await cust.fill("#title", "Edit chapter two of my thesis");
  await cust.selectOption("#intended_use", "research_support");
  await cust.selectOption("#level", "masters");
  await cust.getByRole("button", { name: "Next", exact: true }).click();
  await cust.fill("#quantity", "5000");
  await cust.fill("#instructions", "Please edit for clarity, grammar and APA 7 consistency. Keep my argument and voice.");
  await cust.getByRole("button", { name: "Next", exact: true }).click();
  const deadline = new Date(Date.now() + 10 * 86_400_000 + 3 * 3_600_000).toISOString().slice(0, 16);
  await cust.fill("#deadline_local", deadline);
  await cust.getByRole("button", { name: "Save draft" }).click();
  await cust.waitForURL(/\/en\/portal\/orders\/[0-9a-f-]{36}$/);
  const orderId = cust.url().split("/").pop();
  await cust.getByText("Draft saved.").waitFor();
  await cust.getByText("Estimated total").waitFor();
  const estimateText = await cust.locator("aside").innerText();
  assert(/690\.00/.test(estimateText), `estimate shows 5000 × 0.12 × 1.15 = 690.00 SAR, got: ${estimateText}`);
  log(`draft ${orderId} saved with server-side estimate 690.00 SAR`);

  await cust.getByRole("button", { name: "5. Files" }).click();
  await cust.setInputFiles('input[type="file"]', pdfFile("brief.pdf"));
  await cust.getByRole("link", { name: "brief.pdf" }).waitFor();
  await cust.setInputFiles('input[type="file"]', { name: "evil.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ not a pdf at all") });
  await cust.getByText("does not match its extension").waitFor();
  log("upload accepted; disguised executable rejected by content sniffing");

  await cust.getByRole("button", { name: "6. Review" }).click();
  await cust.getByRole("button", { name: "Submit order" }).click();
  await cust.getByText("Terms and acceptable use", { exact: false }).or(cust.getByText("Please check the highlighted fields.")).first().waitFor();
  await cust.check('input[name="accept_terms"]');
  await cust.check('input[name="accept_acceptable_use"]');
  await cust.check('input[name="consent_ai"]');
  await cust.getByRole("button", { name: "Submit order" }).click();
  await cust.waitForURL(/submitted=1/);
  await cust.getByText("Order submitted").waitFor();
  assert((await orderStatus(orderId)) === "submitted", "order is submitted");
  log("order submitted only after both consents");

  await cust.goto(`${APP}/en/portal/orders/${orderId}?tab=messages`);
  await cust.getByText("Live").waitFor({ timeout: 15000 });
  await cust.fill('textarea[aria-label="Write a message…"]', "Hello, can you also check my reference list?");
  await cust.keyboard.press("Enter");
  await cust.getByText("Hello, can you also check my reference list?").waitFor();
  log("customer message sent over realtime chat");

  // Owner bootstrap: role granted out of band, MFA enforced before admin access.
  const created = await service("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: owner.email, password: owner.password, email_confirm: true }) });
  await service("/rest/v1/user_roles", { method: "POST", body: JSON.stringify({ user_id: created.id, role: "admin" }), headers: { Prefer: "return=minimal" } });
  await signIn(admin, owner);
  await admin.waitForURL(/\/en\/portal/);
  await admin.goto(`${APP}/en/admin`);
  await admin.waitForURL(/\/en\/mfa/);
  const secret = (await admin.locator("code.break-all").innerText()).trim();
  await admin.fill("#code", totp(secret));
  await admin.getByRole("button", { name: "Verify" }).click();
  await admin.waitForURL(/\/en\/admin$/);
  await admin.getByText("Owner dashboard").waitFor();
  log("owner forced through TOTP enrolment before the admin area");

  await admin.goto(`${APP}/en/admin/orders/${orderId}`);
  await admin.getByText("Hello, can you also check my reference list?").waitFor();
  await admin.fill('textarea[aria-label="Write a message…"]', "Yes — references are included in the quote.");
  await admin.keyboard.press("Enter");
  await cust.getByText("Yes — references are included in the quote.").waitFor({ timeout: 15000 });
  log("owner reply reached the customer's open page in real time");
  await admin.getByText("Seen").waitFor({ timeout: 15000 });
  log("read receipt shown to the owner");
  await cust.goto(`${APP}/en/portal/orders/${orderId}?tab=messages`);
  await cust.getByText("Live").waitFor({ timeout: 15000 });
  await cust.fill('textarea[aria-label="Write a message…"]', "Great, thank you!");
  await cust.keyboard.press("Enter");
  await admin.getByText("Great, thank you!").waitFor({ timeout: 15000 });
  log("customer reply reached the owner's open page in real time");

  await admin.fill('textarea[name="body"]', "Check whether chapter 3 will follow.");
  await admin.getByRole("button", { name: "Add note" }).click();
  await admin.getByText("Check whether chapter 3 will follow.").waitFor();
  await cust.goto(`${APP}/en/portal/orders/${orderId}`);
  assert(!(await cust.content()).includes("Check whether chapter 3"), "internal note invisible to the customer");
  log("internal note visible to owner only");

  // Quote with a 50% deposit.
  await admin.goto(`${APP}/en/admin/orders/${orderId}`);
  assert((await admin.inputValue("#subtotal")) === "690", "quote form prefilled from estimate");
  await admin.fill("#deposit_percent", "50");
  await admin.getByRole("button", { name: "Save and send quote" }).click();
  await waitForStatus(orderId, "awaiting_quote");
  log("quote sent; order awaiting the customer's decision");

  await cust.goto(`${APP}/en/portal/orders/${orderId}?tab=billing`);
  await cust.getByRole("button", { name: "Accept quote" }).click();
  await waitForStatus(orderId, "awaiting_payment");
  await cust.getByRole("button", { name: /Pay deposit/ }).click();
  await cust.waitForURL(/\/portal\/pay\/sandbox\//);
  await cust.goto(`${APP}/en/portal/orders/${orderId}?tab=billing&payment=returned`);
  assert((await orderStatus(orderId)) === "awaiting_payment", "returning from checkout does not mark the order paid");
  log("browser redirect alone does not mark anything paid");

  await cust.getByRole("button", { name: /Pay deposit/ }).click();
  await cust.waitForURL(/\/portal\/pay\/sandbox\//);
  await cust.getByRole("button", { name: "Simulate underpayment" }).click();
  await cust.waitForURL(/tab=billing/);
  assert((await orderStatus(orderId)) === "awaiting_payment", "underpayment not credited");
  await cust.getByRole("button", { name: /Pay deposit/ }).click();
  await cust.waitForURL(/\/portal\/pay\/sandbox\//);
  await cust.getByRole("button", { name: "Approve payment" }).click();
  await waitForStatus(orderId, "paid");
  const [invoice] = await service(`/rest/v1/invoices?order_id=eq.${orderId}&select=amount_paid,total,status`);
  assert(Number(invoice.amount_paid) === 345 && invoice.status === "partially_paid", `deposit recorded: ${JSON.stringify(invoice)}`);
  log("underpayment refused; signed sandbox webhook credited the 345.00 deposit");

  // Work, QC and delivery.
  await adminMove(admin, orderId, "in_review");
  await adminMove(admin, orderId, "in_progress");
  await adminMove(admin, orderId, "quality_check");
  await admin.locator("label", { hasText: "Upload deliverable" }).locator('input[type="file"]').setInputFiles(pdfFile("edited-v1.pdf"));
  await admin.locator('select[name="file_id"]').waitFor();
  await admin.fill('textarea[name="note"]', "First edited version.");
  await admin.getByRole("button", { name: "Approve and deliver" }).click();
  await waitForStatus(orderId, "delivered");
  log("deliverable uploaded and delivered as version 1 after QC");

  await cust.goto(`${APP}/en/portal/orders/${orderId}?tab=files`);
  const downloadHref = await cust.getByRole("link", { name: "Download" }).first().getAttribute("href");
  const locked = await cust.request.get(`${APP}${downloadHref}`, { maxRedirects: 0 });
  assert(locked.status() === 402, `deliverable locked while balance is due (got ${locked.status()})`);
  await cust.goto(`${APP}/en/portal/orders/${orderId}?tab=billing`);
  await cust.getByRole("button", { name: /Pay balance/ }).click();
  await cust.waitForURL(/\/portal\/pay\/sandbox\//);
  await cust.getByRole("button", { name: "Approve payment" }).click();
  await cust.waitForURL(/tab=billing/);
  const unlocked = await cust.request.get(`${APP}${downloadHref}`, { maxRedirects: 0 });
  assert(unlocked.status() === 303, `deliverable downloadable after full payment (got ${unlocked.status()})`);
  log("deliverable locked until the balance was paid, then served by signed URL");

  // Isolation: another customer cannot reach the order or its files.
  await register(evil, intruder);
  await signIn(evil, intruder);
  await evil.waitForURL(/\/en\/portal$/);
  const peek = await evil.goto(`${APP}/en/portal/orders/${orderId}`);
  assert(peek.status() === 404, `foreign order is 404 (got ${peek.status()})`);
  const steal = await evil.request.get(`${APP}${downloadHref}`, { maxRedirects: 0 });
  assert(steal.status() === 404, `foreign file is 404 (got ${steal.status()})`);
  const csvDenied = await evil.request.get(`${APP}/api/admin/reports/orders.csv`);
  assert(csvDenied.status() === 403, "CSV export refused to customers");
  log("second customer cannot see the order, its files or admin exports");

  // Revision within the allowance, then completion.
  await cust.goto(`${APP}/en/portal/orders/${orderId}?tab=revisions`);
  await cust.fill("#description", "Please tighten the literature section.");
  await cust.fill("#requested_changes", "Shorten section 2.3 by about 300 words.");
  await cust.getByRole("button", { name: "Request a revision" }).click();
  await waitForStatus(orderId, "revision_requested");
  await admin.goto(`${APP}/en/admin/orders/${orderId}`);
  await admin.getByRole("button", { name: "Approve revision" }).click();
  await waitForStatus(orderId, "revision_in_progress");
  await admin.getByRole("button", { name: "Ready for quality check" }).click();
  await waitForStatus(orderId, "quality_check");
  await admin.reload();
  await admin.locator("label", { hasText: "Upload deliverable" }).locator('input[type="file"]').setInputFiles(pdfFile("edited-v2.pdf"));
  await admin.locator('select[name="file_id"] option', { hasText: "edited-v2.pdf" }).waitFor({ state: "attached" });
  await admin.selectOption('select[name="file_id"]', { label: (await admin.locator('select[name="file_id"] option', { hasText: "edited-v2.pdf" }).innerText()).trim() });
  await admin.getByRole("button", { name: "Approve and deliver" }).click();
  await waitForStatus(orderId, "delivered");
  const versions = await service(`/rest/v1/deliverable_versions?order_id=eq.${orderId}&select=version`);
  assert(versions.length === 2, "two versions kept");
  await cust.goto(`${APP}/en/portal/orders/${orderId}`);
  await cust.getByRole("button", { name: "Accept delivery and complete" }).click();
  await waitForStatus(orderId, "completed");
  log("included revision delivered as version 2; customer completed the order");

  // Refund with owner approval.
  await admin.goto(`${APP}/en/admin/orders/${orderId}`);
  await admin.fill('input[name="amount"]', "1000");
  await admin.fill('input[name="reason"]', "Goodwill");
  await admin.getByRole("button", { name: "Create refund" }).click();
  await admin.getByText("refund exceeds the refundable amount").waitFor();
  await admin.fill('input[name="amount"]', "50");
  await admin.getByRole("button", { name: "Create refund" }).click();
  await admin.getByRole("button", { name: "Approve and execute" }).click();
  await admin.getByText("succeeded").first().waitFor();
  const [refunded] = await service(`/rest/v1/invoices?order_id=eq.${orderId}&select=amount_refunded,status`);
  assert(Number(refunded.amount_refunded) === 50 && refunded.status === "partially_refunded", "partial refund recorded");
  log("over-limit refund refused; 50.00 refund approved and executed");

  const history = await service(`/rest/v1/order_status_history?order_id=eq.${orderId}&select=to_status&order=id`);
  log(`timeline: ${history.map((h) => h.to_status).join(" → ")}`);

  const csv = await admin.request.get(`${APP}/api/admin/reports/orders.csv`);
  assert(csv.status() === 200 && (await csv.text()).includes("RD-"), "CSV export for the owner");
  await admin.goto(`${APP}/en/admin/reports`);
  await admin.getByText("Net revenue").waitFor();
  log("owner reports and CSV export");

  await admin.goto(`${APP}/en/admin`);
  await admin.screenshot({ path: path.join(SHOTS, "admin-dashboard.png"), fullPage: true });
  await cust.goto(`${APP}/ar/portal/orders/${orderId}?tab=timeline`);
  assert((await cust.getAttribute("html", "dir")) === "rtl", "Arabic workspace is RTL");
  await cust.screenshot({ path: path.join(SHOTS, "workspace-ar.png"), fullPage: true });
  const mobile = await (await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: "dark", locale: "ar-SA" })).newPage();
  await mobile.goto(`${APP}/ar`);
  await mobile.screenshot({ path: path.join(SHOTS, "home-ar-dark-mobile.png"), fullPage: true });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!overflow, "no horizontal scroll at 375 px");
  log(`Arabic RTL, dark mode and 375 px layout (screenshots in ${SHOTS})`);

  await browser.close();
  console.log(`\nall ${step} end-to-end checks passed`);
})().catch(async (err) => {
  console.error(`✗ failed after step ${step}:`, err);
  await cust?.screenshot({ path: path.join(SHOTS, "failure-customer.png"), fullPage: true }).catch(() => {});
  await admin?.screenshot({ path: path.join(SHOTS, "failure-owner.png"), fullPage: true }).catch(() => {});
  process.exit(1);
});
