import {clinicCors,trustedBrowserOrigin} from './appOrigin.js';
import { jobsRouter } from "./routes/jobs.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { authRouter } from "./routes/auth.js";
import { accountRouter } from "./routes/account.js";
import { clinicRouter } from "./routes/clinic.js";
import { geo as geoRouter, check as checkRouter, checkEmail } from "./geo.js";
import { query } from "./db.js";
import { warmClinicSchemas } from "./warmup.js";

dotenv.config({quiet:true});

const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxy (Vercel, Cloudflare, Nginx) so req.ip and secure cookies work correctly
app.set("trust proxy", 1);

app.use(trustedBrowserOrigin);
app.use(cors(clinicCors));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health Check
app.get("/api/health", async (req, res) => {
  let dbStatus = "disconnected";
  try {
    const result = await query("SELECT NOW() as now");
    if (result.rows?.[0]?.now) dbStatus = "connected";
    if (req.query.warm && dbStatus === "connected") await warmClinicSchemas().catch(() => {});
  } catch (err) {
    dbStatus = "error: " + err.message;
  }
  res.json({
    status: "ok",
    db: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// Direct browser verify-email link handler
app.get("/verify-email", (req, res) => {
  const token = req.query.token;
  if (token) return res.redirect(`/?verify=${encodeURIComponent(token)}`);
  res.redirect("/");
});

// Check Email (public domain + MX check + database uniqueness)
app.post("/api/check/email", async (req, res) => {
  const r = await checkEmail(req.body?.email);
  if (r.ok) {
    try {
      const u = await query("SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)", [r.email]);
      if (u.rows && u.rows.length > 0) {
        return res.json({ ok: false, domain: r.domain, error: "This email is already registered." });
      }
      const o = await query("SELECT 1 FROM owners WHERE LOWER(email) = LOWER($1)", [r.email]);
      if (o.rows && o.rows.length > 0) {
        return res.json({ ok: false, domain: r.domain, error: "This email is already registered." });
      }
    } catch (err) {
      console.warn("DB check email warning:", err.message);
    }
  }
  res.json(r);
});

app.use("/api/jobs", jobsRouter);

// Mount Routes
app.use("/api/geo", geoRouter);
app.use("/api/check", checkRouter);
app.use("/api/auth", authRouter);
app.use("/api/auth", accountRouter);
app.use("/api", authRouter);
app.use("/api", clinicRouter);

// Fallback 404 for unknown API endpoints
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`PawCare Neon DB Server listening on http://localhost:${PORT}`);
});
