const express = require("express");
const Stripe = require("stripe");
require("dotenv").config();
const path = require("path");

const PORT = process.env.PORT || 3000;
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn(
    "Warning: STRIPE_SECRET_KEY not set. Stripe endpoints will fail until it is configured. See .env.example"
  );
}
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || "");

const app = express();
app.use(express.json());
const session = require('express-session');
const cookieParser = require('cookie-parser');

// Session configuration - requires SESSION_SECRET in environment for production
const SESS_SECRET = process.env.SESSION_SECRET || 'dev-secret-please-change';
app.use(cookieParser());
app.use(session({
  secret: SESS_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, sameSite: 'lax' } // secure should be true behind HTTPS in production
}));

// Admin token (optional). If set, require this token to access admin pages/endpoints.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

// Simple admin middleware: protects /admin.html and /payments endpoints when ADMIN_TOKEN is set.
app.use(function (req, res, next) {
  // If ADMIN_TOKEN is not set, allow access (dev mode). Otherwise require session or token.
  if (!ADMIN_TOKEN) return next();
  var allowed = ['/admin.html', '/admin-login', '/admin-logout'];
  if (allowed.indexOf(req.path) !== -1) return next();
  // Session-based auth: check if req.session.isAdmin
  if (req.session && req.session.isAdmin) return next();
  // Fallback: check token in header or query
  const token = req.headers['x-admin-token'] || req.query.admin_token || '';
  if (token === ADMIN_TOKEN) return next();
  res.status(401).send('Unauthorized');
});

// Admin login endpoint: POST { token } -> sets session if token matches
app.post('/admin-login', express.json(), function (req, res) {
  const token = (req.body && req.body.token) || req.query.token || '';
  if (!ADMIN_TOKEN) return res.status(400).json({ ok: false, error: 'ADMIN_TOKEN not configured on server' });
  if (token === ADMIN_TOKEN) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false });
});

app.post('/admin-logout', function (req, res) {
  if (req.session) req.session.isAdmin = false;
  return res.json({ ok: true });
});

// Serve static files from repo root so the client can be visited at the same origin
app.use(express.static(path.join(__dirname)));

app.post("/create-checkout-session", async (req, res) => {
  const origin = req.get("origin") || `http://localhost:${PORT}`;
  const { priceId } = req.body || {};
  const price = priceId || process.env.PRICE_ID;
  if (!price)
    return res
      .status(400)
      .json({ error: "priceId or PRICE_ID not configured" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: process.env.CHECKOUT_MODE || "subscription", // 'payment' or 'subscription'
      line_items: [{ price: price, quantity: 1 }],
      success_url: `${origin}/?success=true`,
      cancel_url: `${origin}/?canceled=true`,
    });
    res.json({ id: session.id, publicKey: process.env.STRIPE_PUBLISHABLE_KEY });
  } catch (err) {
    console.error("Stripe error", err && err.message);
    res.status(500).json({ error: err && err.message });
  }
});

// Simple payments store (append-only JSONL file)
const fs = require("fs");
const PAY_LOG = path.join(__dirname, "payments.log");
const CONTACT_LOG = path.join(__dirname, "contacts.log");

// Endpoint to retrieve recorded payments (admin)
app.get("/payments", (req, res) => {
  try {
    if (!fs.existsSync(PAY_LOG)) return res.json([]);
    var lines = fs
      .readFileSync(PAY_LOG, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    var items = lines.map((l) => JSON.parse(l));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear payments (admin) - deletes the log
app.delete("/payments", (req, res) => {
  try {
    if (fs.existsSync(PAY_LOG)) fs.unlinkSync(PAY_LOG);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to receive contact submissions from the client
app.post("/contacts", express.json(), (req, res) => {
  try {
    const record = req.body || {};
    record.time = Date.now();
    // minimal validation
    if (!record.message || !record.name) {
      // accept but warn
      console.warn("Contact missing name/message");
    }
    fs.appendFileSync(CONTACT_LOG, JSON.stringify(record) + "\n");
    return res.json({ ok: true });
  } catch (err) {
    console.error("Failed to write contact log", err && err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Admin: list recorded contacts
app.get("/contacts", (req, res) => {
  try {
    if (!fs.existsSync(CONTACT_LOG)) return res.json([]);
    var lines = fs
      .readFileSync(CONTACT_LOG, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    var items = lines.map((l) => JSON.parse(l));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: clear contacts log
app.delete("/contacts", (req, res) => {
  try {
    if (fs.existsSync(CONTACT_LOG)) fs.unlinkSync(CONTACT_LOG);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook endpoint for Stripe to notify of completed sessions
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  let event;
  try {
    if (endpointSecret)
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    else event = JSON.parse(req.body.toString()); // in dev when no secret, accept raw JSON
  } catch (err) {
    console.error("Webhook error", err && err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event && event.type === "checkout.session.completed") {
    const session = event.data ? event.data.object : event;
    const record = {
      id: session.id,
      amount_total: session.amount_total || null,
      currency: session.currency || null,
      customer_email:
        (session.customer_details && session.customer_details.email) || null,
      time: Date.now(),
      raw: session,
    };
    try {
      fs.appendFileSync(PAY_LOG, JSON.stringify(record) + "\n");
      console.log("Recorded payment", record.id);
    } catch (err) {
      console.error("Failed to write payment log", err && err.message);
    }
  }

  res.json({ received: true });
});

app.listen(PORT, function () {
  console.log(`PEEKSEE helper server running on http://localhost:${PORT}`);
});
