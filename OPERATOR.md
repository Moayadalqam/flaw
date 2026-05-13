# Lex — Operator Runbook

Steps a human operator runs that the build automation cannot. Live for the demo on 2026-05-13.

## 0. Prerequisites on the operator's laptop

- Docker daemon running (required for `npx supabase start`).
- `npx` available (Node 20+).
- `vercel` CLI: `npm i -g vercel`.
- `gh` CLI authenticated against `github.com/Moayadalqam`.
- `psql` available locally for verification scripts.

## 1. Bring up the local stack

```bash
npx supabase start
npx supabase status                  # prints API URL, anon key, service role key, DB URL
cp .env.local.example .env.local     # then paste local values from `supabase status -o env`
```

## 2. Create the Supabase cloud project (EU region)

GDPR + Cyprus Bar Council data-residency: Frankfurt (`eu-central-1`) or Ireland (`eu-west-1`) only. NO US regions.

1. Supabase Studio → New project → region **Frankfurt** (preferred) or **Ireland**.
2. Project name: `lex-demo` (or per client convention).
3. Database password: store in Qualia 1Password / Bitwarden — **NOT** in git.
4. Copy the project's `ref` from the URL: `https://supabase.com/dashboard/project/<ref>`.

## 3. Link local stack to cloud

```bash
npx supabase link --project-ref <ref>
npx supabase db push                 # applies all migrations from supabase/migrations/
```

Verify in Supabase Studio → Database → Tables that all 12 tables exist with RLS enabled.

## 4. Seed the cloud workspace

The local `supabase/seed.sql` uses a placeholder `auth.users` UUID. For the cloud project:

1. Get Fotini to sign in once via magic-link to `https://lex-demo.vercel.app/login` (after Vercel deploy).
2. Look up her real `auth.users.id` in Supabase Studio → Authentication → Users.
3. Substitute that UUID in a one-shot seed: `psql $DATABASE_URL -v owner_id=<her-uuid> -f supabase/seed.sql` (the seed script supports `-v owner_id` overrides — confirm in the script before running).

## 5. Vercel project setup

```bash
vercel link                          # link to the right Vercel team — there are 3 Qualia teams
vercel env pull .env.local           # sync env vars from Vercel → local
```

Disable Vercel's GitHub auto-deploy (Qualia rule — see `~/.claude/rules/infrastructure.md`):
- Vercel Dashboard → Project Settings → Git → toggle off "Automatic Deployments".

## 6. Configure custom SMTP / sending domain (Resend)

- Resend → add `qualiasolutions.cy` as a sending domain.
- Verify SPF + DKIM + DMARC DNS records via the Resend onboarding panel.
- Send a test magic-link to Fotini's address before the meeting — confirm inbox delivery (not spam) within 30 seconds.

## 7. AI model routing (OpenRouter)

- Verify the configured model (`mistralai/mistral-large-latest` recommended for EU routing) responds to a structured-output test.
- If using a US-routed model (Claude, GPT), update the DPA disclosure document at `.planning/compliance/sub-processors.md` (created in Phase 6).

## 8. Deploy to production

```bash
vercel --prod
```

## 9. Post-deploy verification (5 checks — `rules/deployment.md`)

- [ ] HTTP 200 on the homepage: `curl -s -o /dev/null -w "%{http_code}" https://<prod-url>` → `200`
- [ ] Auth flow: request a magic-link, click it, land on `/dashboard`
- [ ] No console errors on first paint
- [ ] API latency < 500ms for key endpoints
- [ ] UptimeRobot monitor shows UP: https://stats.uptimerobot.com/bKudHy1pLs

## 10. Demo-day checklist (1 hour before meeting)

- [ ] Pre-warm production: hit `/dashboard`, `/clients`, `/invoices`, `/trust-ledger`, `/api/pdf/<seed-invoice-id>`, ⌘K AI query.
- [ ] Confirm Fotini has received the magic-link email at least once and it landed in inbox.
- [ ] Verify the trust ledger view renders sage-olive surface and the banner string.
- [ ] Send one test invoice to a Qualia address via the AI assistant flow; confirm Greek PDF renders without `□` characters.
- [ ] Run `bash supabase/tests/run.sh` against the cloud DB connection → `ALL PASS`.
- [ ] If any check fails, have a verbal workaround prepared. Do not demo a broken path.

## 11. Research-flagged questions to ask Fotini live

These four items are flagged INSUFFICIENT EVIDENCE in `.planning/research/SUMMARY.md` — confirm with her in the meeting, do not infer:

1. **Cyprus Bar Council** — which specific rule numbers govern client-account separation, audit cadence, and the disbarment criteria for commingling? We've built to defensible defaults; she tells us where to cite.
2. **Söhne typeface** — Greek glyph coverage on Qualia's license tier (fallback: Noto Sans Greek, already bundled).
3. **OpenRouter EU routing** — does she require all AI inference inside the EU? If yes, pin to Mistral (EU-only). If she's OK with US providers under DPA, we keep model flexibility.
4. **Supabase EU region vs Cyprus Bar data residency** — does Frankfurt/Ireland satisfy her Bar's privileged-communication rules, or does the Bar require Cyprus-only storage? (If the latter, this changes the entire infra plan — surface it as a blocker, not a config tweak.)
