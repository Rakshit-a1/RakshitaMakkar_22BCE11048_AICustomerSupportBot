AI Customer Support Bot

Features
- REST API: sessions, chat, summarize, escalate, FAQs admin/search
- Contextual memory per session (SQLite)
- FAQ retrieval with FTS5 and escalation suggestion
- Pluggable LLM (Gemini via GEMINI_API_KEY) with mock fallback
- Simple frontend at /

Setup
1. Node 18+. Install deps:
   npm install
2. Configure env in .env (optional):
   - PORT=3000
   - GEMINI_API_KEY=your-gemini-key
   - GEMINI_MODEL=gemini-1.5-flash

Run
- Dev: npm run dev
- Build: npm run build
- Prod: npm start

API
- POST /api/sessions -> { id }
- GET /api/sessions/:id/messages -> { messages }
- POST /api/chat { sessionId, message } -> { reply, suggestedEscalation, faqs }
- GET /api/sessions/:id/summary -> { summary }
- POST /api/sessions/:id/escalate { note? } -> { ok }
- POST /api/faqs/bulk { faqs: [{question, answer}] } -> { inserted }
- GET /api/faqs/search?q=term -> { results }

FAQ Seed Example
[
  { "question": "How do I reset my password?", "answer": "Use the Reset Password link on the sign-in page." },
  { "question": "What is the refund policy?", "answer": "Refunds within 30 days for eligible purchases." }
]


