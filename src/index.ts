import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { createDatabase } from "./db/init";
import chatRouter from "./routes/chat";

dotenv.config();

const app = express();
// CORS: allow configurable origins via ALLOWED_ORIGINS env (comma-separated). Default to same-origin (dev-friendly).
const allowed = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : undefined;
app.use(cors({ origin: allowed ?? true }));
app.use(express.json({ limit: "1mb" }));

// Initialize DB and ensure tables exist
const db = createDatabase(path.resolve(process.cwd(), "data", "support.db"));

// Health
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Static demo UI
app.use(express.static(path.resolve(process.cwd(), "public")));

// Serve index.html for root route
app.get("/", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "public", "index.html"));
});

// API routes
app.use("/api", chatRouter(db));

// Centralized error handler
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err?.stack ?? err);
    res
      .status(err?.status || 500)
      .json({ error: String(err?.message ?? "Internal Server Error") });
  }
);

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`AI Support Bot listening on http://localhost:${port}`);
});
