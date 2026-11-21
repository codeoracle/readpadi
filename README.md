# Study Carrel

Read course materials with an AI professor, sit CBT-style practice exams set from the material, and track grades by topic.

**Stack:** Next.js 15 (App Router, TypeScript) · Supabase (Auth, Postgres, Storage) · Netlify (hosting + Edge Function for AI) · Claude API · Paystack.

## How it fits together

| Piece | Where |
|---|---|
| Sign-in (Google, email magic link) | Supabase Auth, `app/login`, `app/auth/callback` |
| Shared library, uploads awaiting approval | `courses` table + private `materials` storage bucket |
| Reader + professor | `components/course/Reader.tsx` (pdf.js streams pages from a signed URL) |
| Practice exams + marking | `components/course/TestTab.tsx` |
| Personal data (results, notes, progress, exam dates) | `attempts`, `notes`, `progress`, `exams`, all owner-only via RLS |
| AI calls with daily limits | `netlify/edge-functions/ai.ts` → `consume_ai_credit()` → Claude API (streamed) |
| Pro pass payments | `app/api/paystack/*` → `grant_pro()` (idempotent per reference) |
| Admin (review uploads, roles, limits, price) | `app/(app)/admin` |

The full schema, policies and functions are in `supabase/migrations/`.

## Environment variables (Netlify → Project configuration → Environment variables)

| Variable | Secret | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | no | already set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no | publishable key, already set |
| `NEXT_PUBLIC_SITE_URL` | no | `https://study-carrel.netlify.app`, already set (change when you add a custom domain) |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Supabase → Project Settings → API keys → `service_role` / secret key |
| `ANTHROPIC_API_KEY` | **yes** | console.anthropic.com |
| `PAYSTACK_SECRET_KEY` | **yes** | Paystack → Settings → API Keys (use `sk_test_…` first, then `sk_live_…`) |
| `CLAUDE_MODEL` | no | optional, defaults to `claude-sonnet-5-5`; `claude-haiku-5-5` is cheaper |

## One-time dashboard setup

1. **Supabase → Authentication → URL Configuration:** Site URL `https://study-carrel.netlify.app`; add redirect URL `https://study-carrel.netlify.app/auth/callback` (and `http://localhost:3000/auth/callback` for local dev).
2. **Supabase → Authentication → Sign In / Providers → Google:** paste a Google OAuth client ID and secret (Google Cloud Console → APIs & Services → Credentials → OAuth client, type Web; authorised redirect URI is the callback URL Supabase shows you).
3. **Supabase → Authentication → Emails → SMTP:** the built-in mailer only sends a few emails per hour. Before rollout, connect a real SMTP provider (Resend, Brevo, Zoho, etc.).
4. **Paystack → Settings → API Keys & Webhooks:** webhook URL `https://study-carrel.netlify.app/api/paystack/webhook`.
5. Sign up with `yunusmustapha2@gmail.com`; that account becomes admin automatically.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the secrets
npx netlify-cli dev          # runs Next.js and the /api/ai edge function together on :8888
```
`npm run dev` alone works for everything except the professor, which needs the edge function.

## Costs to watch
- Every professor answer, exam batch (≤10 questions), study guide or marking pass is one AI action and one Claude API call.
- Free users are capped daily (Admin → Settings). Pro, moderators and admins are uncapped.
- Supabase free tier: 500 MB database, 1 GB file storage, 50k monthly active users. Course PDFs are the main storage cost; upgrade Supabase when storage nears 1 GB.
