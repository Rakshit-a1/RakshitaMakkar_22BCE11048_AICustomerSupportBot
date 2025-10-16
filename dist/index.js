"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const init_1 = require("./db/init");
const chat_1 = __importDefault(require("./routes/chat"));
dotenv_1.default.config();
const app = (0, express_1.default)();
// CORS: allow configurable origins via ALLOWED_ORIGINS env (comma-separated). Default to same-origin (dev-friendly).
const allowed = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : undefined;
app.use((0, cors_1.default)({ origin: allowed ?? true }));
app.use(express_1.default.json({ limit: "1mb" }));
// Initialize DB and ensure tables exist
const db = (0, init_1.createDatabase)(path_1.default.resolve(process.cwd(), "data", "support.db"));
// Health
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
// Static demo UI
app.use("/", express_1.default.static(path_1.default.resolve(process.cwd(), "public")));
// API routes
app.use("/api", (0, chat_1.default)(db));
// Centralized error handler
app.use((err, _req, res, _next) => {
    console.error("Unhandled error:", err?.stack ?? err);
    res
        .status(err?.status || 500)
        .json({ error: String(err?.message ?? "Internal Server Error") });
});
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
    console.log(`AI Support Bot listening on http://localhost:${port}`);
});
//# sourceMappingURL=index.js.map