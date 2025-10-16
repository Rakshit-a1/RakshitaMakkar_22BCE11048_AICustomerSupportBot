"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = chatRouter;
const express_1 = require("express");
const llm_1 = require("../services/llm");
const node_crypto_1 = __importDefault(require("node:crypto"));
function now() {
    return Date.now();
}
// small helper to wrap async route handlers and forward errors to Express error handler
function asyncHandler(fn) {
    return (req, res, next) => fn(req, res, next).catch(next);
}
function chatRouter(db) {
    const router = (0, express_1.Router)();
    const llm = (0, llm_1.createLLM)();
    // Create a session
    router.post("/sessions", (req, res) => {
        // no body required for creating a session, but allow optional client-provided id for testing
        const id = req.body?.id ? String(req.body.id) : node_crypto_1.default.randomUUID();
        db.prepare("INSERT INTO sessions (id, created_at, updated_at, status) VALUES (?, ?, ?, ?)").run(id, now(), now(), "open");
        res.json({ id });
    });
    // Add or get messages
    router.get("/sessions/:id/messages", (req, res) => {
        const { id } = req.params;
        const messages = db
            .prepare("SELECT role, content, created_at FROM messages WHERE session_id = ? ORDER BY id ASC")
            .all(id);
        res.json({ messages });
    });
    // Upsert FAQs in bulk (admin)
    router.post("/faqs/bulk", (req, res) => {
        const faqs = Array.isArray(req.body?.faqs) ? req.body.faqs : [];
        const insert = db.prepare("INSERT INTO faqs (question, answer) VALUES (?, ?)");
        const tx = db.transaction((rows) => {
            for (const row of rows) {
                if (!row ||
                    typeof row.question !== "string" ||
                    typeof row.answer !== "string")
                    continue;
                insert.run(row.question, row.answer);
            }
        });
        tx(faqs);
        res.json({ inserted: faqs.length });
    });
    // Search FAQs
    router.get("/faqs/search", (req, res) => {
        const rawQ = req.query && typeof req.query.q === "string" ? req.query.q : "";
        const q = rawQ.trim();
        if (!q)
            return res.json({ results: [] });
        // normalize whitespace and basic sanitize
        const normalized = q
            .replace(/\s+/g, " ")
            .replace(/[^\w\s\-']/g, " ")
            .trim();
        if (!normalized)
            return res.json({ results: [] });
        // FTS5 MATCH does not accept parameter placeholders in some builds — safely escape single quotes
        const escaped = normalized.replace(/'/g, "''");
        const sql = `
      SELECT f.id, f.question, f.answer
      FROM faqs_fts fts
      JOIN faqs f ON fts.rowid = f.id
      WHERE faqs_fts MATCH '${escaped}'
      LIMIT 5
    `;
        const rows = db.prepare(sql).all();
        res.json({ results: rows });
    });
    // Chat with memory + FAQ retrieval + escalation
    router.post("/chat", asyncHandler(async (req, res) => {
        const { sessionId, message } = req.body;
        if (!sessionId ||
            typeof sessionId !== "string" ||
            !message ||
            typeof message !== "string") {
            return res.status(400).json({
                error: "sessionId and message are required and must be strings",
            });
        }
        // Ensure session exists
        const session = db
            .prepare("SELECT id, status FROM sessions WHERE id = ?")
            .get(sessionId);
        if (!session)
            return res.status(404).json({ error: "session not found" });
        // Persist user message
        db.prepare("INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)").run(sessionId, "user", message, now());
        db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(now(), sessionId);
        // Retrieve context
        const historyRows = db
            .prepare("SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC LIMIT 30")
            .all(sessionId);
        const history = historyRows.map((r) => ({
            role: r.role,
            content: r.content,
        }));
        // Retrieve FAQs (sanitize and embed into FTS query)
        const rawFaq = String(message || "")
            .replace(/\s+/g, " ")
            .replace(/[^\w\s\-']/g, " ")
            .trim();
        let faqCandidates = [];
        if (rawFaq) {
            const esc = rawFaq.replace(/'/g, "''");
            const sqlFaq = `SELECT f.id, f.question, f.answer FROM faqs_fts fts JOIN faqs f ON fts.rowid = f.id WHERE faqs_fts MATCH '${esc}' LIMIT 3`;
            try {
                faqCandidates = db.prepare(sqlFaq).all();
            }
            catch (e) {
                console.warn("FTS query failed", e);
                faqCandidates = [];
            }
        }
        const systemPrompt = {
            role: "system",
            content: `You are a helpful support agent. Prefer using the provided FAQs when relevant. If unsure after a brief attempt, suggest escalation. Keep responses under 120 words.`,
        };
        const faqContext = faqCandidates
            .map((f, i) => `FAQ ${i + 1}: Q: ${f.question}\nA: ${f.answer}`)
            .join("\n\n");
        const assistantContext = {
            role: "system",
            content: faqContext
                ? `Relevant FAQs:\n\n${faqContext}`
                : "No relevant FAQs found.",
        };
        let completion;
        let usedFallback = false;
        try {
            completion = await llm.generate([
                systemPrompt,
                assistantContext,
                ...history,
                { role: "user", content: message },
            ]);
        }
        catch (err) {
            console.error("LLM generate error:", err);
            usedFallback = true;
            completion =
                "Sorry, I had trouble responding just now. Could you please rephrase or try again?";
        }
        // Simple heuristic for escalation suggestion
        // if we used LLM fallback, avoid aggressive escalation suggestion
        const escalateHeuristic = /cannot|unsure|not able|escalate|human/i;
        const shouldEscalate = (!usedFallback && escalateHeuristic.test(completion)) ||
            faqCandidates.length === 0;
        // Persist assistant reply
        db.prepare("INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)").run(sessionId, "assistant", completion, now());
        res.json({
            reply: completion,
            suggestedEscalation: shouldEscalate,
            faqs: faqCandidates,
        });
    }));
    // Summarize conversation
    router.get("/sessions/:id/summary", async (req, res) => {
        const { id } = req.params;
        const rows = db
            .prepare("SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC LIMIT 50")
            .all(id);
        const msgs = rows.map((r) => ({
            role: r.role,
            content: r.content,
        }));
        const summary = await llm.summarize(msgs);
        res.json({ summary });
    });
    // Explicit escalation simulation endpoint
    router.post("/sessions/:id/escalate", (req, res) => {
        const { id } = req.params;
        const note = String(req.body?.note || "Escalated to human support.");
        db.prepare("INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)").run(id, "escalation", note, now());
        db.prepare("UPDATE sessions SET status = ? , updated_at = ? WHERE id = ?").run("escalated", now(), id);
        res.json({ ok: true });
    });
    return router;
}
//# sourceMappingURL=chat.js.map