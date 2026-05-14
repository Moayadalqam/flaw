# Phase 6 — Production Deploy Runbook

**Date:** 2026-05-14 (pitch day)
**Branch:** `feature/bootstrap`
**Operator (Vercel user):** `moayad-4613`
**Status: BLOCKED — operator-only provisioning required before `vercel --prod`**

Builder Task 6 attempted the production deploy and stopped at the precondition
gate before running `vercel --prod`. Two infra preconditions are unmet and
cannot be satisfied by automation:

1. No Supabase **cloud** project for Lex exists yet (only the local Podman
   stack at `http://127.0.0.1:54421`).
2. The Vercel `flaw` project's production environment has **zero** of the
   required application env vars set.

Per the task spec ("`NEXT_PUBLIC_SUPABASE_URL` is localhost in prod → BLOCKED.
Do NOT run `vercel --prod`"), this runbook documents what was attempted, the
exact blocker, and the operator-action checklist required to clear it.

---

## 1. Vercel Link Status

The plan stated the Vercel project was "ALREADY LINKED" per a pre-discovered
`.vercel/project.json`. **That was stale.** The original `projectId`
(`prj_oWeAKmoWuqzttUjSwAhauLnInXGH`) no longer existed on Vercel — `vercel env
ls production` returned:

```
Your Project was either deleted, transferred to a new Team,
or you don’t have access to it anymore.
```

Direct API confirmation:

```bash
curl -s -H "Authorization: Bearer …" \
  "https://api.vercel.com/v9/projects/prj_oWeAKmoWuqzttUjSwAhauLnInXGH?teamId=team_reZEzL1HScP9bxhRI5KIzPFW"
# → {"error":{"code":"not_found","message":"Project not found."}}
```

A `vercel projects ls --scope qualiasolutionscy` listing confirmed no project
named `flaw` existed in the team.

### Re-link performed (side-effect, documented)

To re-establish a clean link, ran:

```bash
vercel link --yes --project flaw --scope qualiasolutionscy
# → "Linked to qualiasolutionscy/flaw (created .vercel)"
```

This **created a fresh Vercel project**. The new `.vercel/project.json` is:

```json
{
  "projectId":   "prj_Ln3wocuKNRScjHuWxCCKLve8HVDa",
  "orgId":       "team_reZEzL1HScP9bxhRI5KIzPFW",
  "projectName": "flaw"
}
```

The new project has no deployments and no env vars (Vercel's empty default).
It is safe to delete + recreate if the operator wants a different name (e.g.
`lex` or `lex-demo`) before the first deploy. Recommended: keep `flaw` (the
repo + plan assume that slug).

The CLI's interactive "which git remote" prompt was skipped — Git auto-deploy
is intentionally disabled per `rules/infrastructure.md`, so the missing git
connection is not a blocker.

---

## 2. Pre-flight (local stack)

| Check                              | Command                                      | Result                                   |
|------------------------------------|----------------------------------------------|------------------------------------------|
| Branch                             | `git branch --show-current`                  | `feature/bootstrap` (NOT main — correct) |
| TypeScript clean                   | `npx tsc --noEmit \| grep -c "error TS"`     | `0` — PASS                               |
| Local smoke suite (9 checks)       | `DEMO_CACHE=true npm run test:smoke`         | `9 / 9 passed in 42555ms` — PASS         |
| Required commits already on branch | `git log --oneline` (last 5)                 | All Phase 6 W1–W3 commits present        |

Pre-flight is **GREEN** locally. The blocker is entirely on the production
infra side, not in the code.

---

## 3. Production Env Vars — THE BLOCKER

`vercel env ls production` on the freshly-linked project returned:

```
 name                                       value                       environments
 NEXT_PUBLIC_AXIOM_INGEST_ENDPOINT          https://us-east-1.…         Production
```

Just one env var. Every application-required var is **missing**:

| Variable                              | Status   | Source                                                  |
|---------------------------------------|----------|---------------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`            | MISSING  | Operator: create cloud Supabase first, then paste URL  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`| MISSING  | Supabase Studio → Project Settings → API               |
| `SUPABASE_SERVICE_ROLE_KEY`           | MISSING  | Supabase Studio → Project Settings → API (server-only) |
| `OPENROUTER_API_KEY`                  | MISSING  | Operator's existing key (already in `.env.local`)      |
| `OPENROUTER_MODEL`                    | MISSING  | `mistralai/mistral-large-latest` (default)             |
| `NEXT_PUBLIC_APP_URL`                 | MISSING  | The production Vercel URL once first deploy succeeds   |
| `DEMO_CACHE=true`                     | MISSING  | **Required** — user shipping without Resend (see §3a)  |
| `RESEND_API_KEY`                      | NOT SET  | **Intentional** — user decision (see §3a)              |
| `RESEND_FROM_EMAIL`                   | MISSING  | Optional; only matters if Resend is later enabled      |

### 3a. Resend / DEMO_CACHE decision (locked)

Per the user's explicit decision, recorded in `OPERATOR.md` §Phase 6 production
secrets: **no `RESEND_API_KEY` in production.** The reminder cards on
`/reports/aging` render via the `DEMO_CACHE=true` short-circuit only —
`src/lib/openrouter/client.ts` reads `DEMO_CACHE` and returns the cached
response from `src/lib/openrouter/demo-cache.json`. The Resend adapter
(`src/lib/email/resend.ts`) returns `{status: "no_api_key"}` when its key is
absent, which the UI handles as "preview-only mode."

Therefore `DEMO_CACHE=true` **must** be set in Vercel production env, or the
demo path will surface `no_api_key` errors when Fotini clicks "Draft reminder."

### 3b. Why no env vars were auto-added by this task

The plan said: "For any present-but-different vars, DO NOT modify — assume
prod is correctly set. Only ADD missing vars." But the missing vars here
include secrets (`SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`) and a URL
that does not yet exist (`NEXT_PUBLIC_SUPABASE_URL` — cloud Supabase not
provisioned). Auto-adding the local values would point production at the
operator's localhost — guaranteed 500s on every Vercel function invocation.
This is exactly the "STOP, do not deploy" condition in the task spec.

---

## 4. Supabase cloud project — also missing

`npx supabase projects list` returned 30+ Qualia projects. **None of them is
the Lex/flaw project.** Search grep across the listing for `lex|flaw|fotini`
returned zero matches. The local `.env.local` confirms the only Supabase the
codebase points at is the Podman stack:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421
```

Vercel functions cannot reach a localhost address. Until a cloud Supabase is
provisioned, ANY production deploy returns 500 on every request that touches
the database (which is every request after `/login`).

This step is **operator-only** per `OPERATOR.md` §2-§4:

- Region must be **Frankfurt (eu-central-1)** or **Ireland (eu-west-1)** —
  GDPR + Cyprus Bar Council data residency. NO US regions.
- Database password is stored in Qualia 1Password / Bitwarden, never git.
- After provisioning, run `npx supabase link --project-ref <ref>` and
  `npx supabase db push` to apply all 9 migrations from
  `supabase/migrations/`.
- The seed (`supabase/seed.sql`) must be re-run with Fotini's real
  `auth.users.id` (not the placeholder `00000000-…-099`) — see
  `OPERATOR.md` §4 for the `psql -v owner_id=<her-uuid>` recipe.

---

## 5. Deploy — NOT RUN

```bash
vercel --prod      # NOT EXECUTED
```

Reason: §3 + §4 above. Running `vercel --prod` without the env vars in §3 and
without a cloud Supabase in §4 would produce a deployment that 500s on every
request that requires data — every workspace-layout-rendered page, every API
route, every PDF, every AI reminder. That is worse than no deploy: it would
also be the URL Fotini clicks during pitch.

---

## 6. Pre-warm — NOT RUN

Skipped — no deployment to warm.

---

## 7. Post-Deploy 5-Check Verification — DEFERRED

| # | Check                  | Auto/Manual | Result   | Notes                                  |
|---|------------------------|-------------|----------|----------------------------------------|
| 1 | HTTP 200 on /          | auto        | DEFERRED | No deploy yet                          |
| 2 | Auth flow              | MANUAL      | DEFERRED | Requires production magic-link emailer |
| 3 | Console errors clean   | MANUAL      | DEFERRED | Requires deployed dashboard            |
| 4 | API latency < 500ms    | auto        | DEFERRED | Requires deployed PDF route            |
| 5 | UptimeRobot UP         | MANUAL      | DEFERRED | https://stats.uptimerobot.com/bKudHy1pLs |

---

## 8. Go/No-Go Decision

**Decision: NO-GO (operator-action required to clear blockers).**

This task cannot return DONE without (a) a cloud Supabase, (b) the production
env vars set, and (c) a green `vercel --prod`. None of those can be safely
automated on pitch day without operator decisions (region choice, password
storage location, key rotation, Fotini's auth.users.id).

### Operator action checklist (clear-the-blockers, in order)

The minimum work between now and pitch:

- [ ] **A. Provision cloud Supabase project** (operator, ~10 min).
  - [ ] Supabase Studio → New project, region **Frankfurt** (preferred) or
        **Ireland**.
  - [ ] Project name suggestion: `lex-demo`.
  - [ ] Store database password in Qualia 1Password.
  - [ ] Copy the project `ref` from the dashboard URL.

- [ ] **B. Push migrations + seed** (operator + CLI, ~5 min).
  - [ ] `npx supabase link --project-ref <ref>`
  - [ ] `npx supabase db push`   (applies all 9 migrations)
  - [ ] In Supabase Studio → Authentication → Users, click "Add user → Send
        magic link" to Fotini's address. After she signs in once (or after
        you click the link from Mailpit-equivalent staging), note her real
        `auth.users.id`.
  - [ ] `psql "$DATABASE_URL" -v owner_id=<her-uuid> -f supabase/seed.sql`
        (the seed accepts the owner_id override — verify the placeholder
        sub-string `000…099` is replaced before running).

- [ ] **C. Set Vercel production env vars** (operator + CLI, ~3 min). Each
       command below pulls the value from your local `.env.local` (already
       configured for cloud) — except `DEMO_CACHE`, which is a literal:

  ```bash
  # From Supabase Studio (cloud project) — Settings → API:
  echo "https://<ref>.supabase.co"     | vercel env add NEXT_PUBLIC_SUPABASE_URL production
  echo "<publishable-key>"             | vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
  echo "<service-role-key>"            | vercel env add SUPABASE_SERVICE_ROLE_KEY production

  # AI:
  echo "<your-openrouter-key>"         | vercel env add OPENROUTER_API_KEY production
  echo "mistralai/mistral-large-latest"| vercel env add OPENROUTER_MODEL production

  # Demo-mode + app URL (set NEXT_PUBLIC_APP_URL after the first deploy gives
  # you the prod hostname — or set it now to the eventual custom domain):
  echo "true"                          | vercel env add DEMO_CACHE production
  echo "https://flaw.vercel.app"       | vercel env add NEXT_PUBLIC_APP_URL production

  # Optional (skip per locked decision):
  # echo "<resend-key>"                | vercel env add RESEND_API_KEY production
  echo "lex@qualiasolutions.cy"        | vercel env add RESEND_FROM_EMAIL production
  ```

  Then verify: `vercel env ls production` should show ~8 entries.

- [ ] **D. Deploy** (~2 min).
  ```bash
  vercel --prod 2>&1 | tee /tmp/vercel-prod-deploy.log
  ```
  - Capture the URL printed at the end (`https://flaw-<hash>.vercel.app`
    initially; alias later if needed).
  - Exit code 0 is the hard gate. If non-zero: read the log, fix, redeploy.

- [ ] **E. Post-deploy 5-checks** (per `rules/deployment.md`):
  ```bash
  PROD_URL=<URL from step D>

  # Check 1: homepage 200
  curl -s -o /dev/null -w "%{http_code}\n" "$PROD_URL"

  # Check 4: API latency (after a warm-up hit)
  curl -s -o /dev/null "$PROD_URL/api/pdf/00000000-0000-0000-0000-0000000b0001"
  curl -s -o /dev/null -w "%{time_total}s\n" \
    "$PROD_URL/api/pdf/00000000-0000-0000-0000-0000000b0001"
  ```

  Manual checks:
  - [ ] Open `$PROD_URL/login` in a fresh browser session.
  - [ ] Submit Fotini's test email; confirm magic-link arrives within 30s
        and lands in inbox (not spam).
  - [ ] Click the link; confirm redirect to `/dashboard` with session.
  - [ ] DevTools console on `/dashboard`, `/reports/summary`, `/reports/aging`:
        zero errors.
  - [ ] https://stats.uptimerobot.com/bKudHy1pLs → Lex monitor UP (or note
        as a post-pitch punch-list item if no monitor is configured yet).
  - [ ] On `/reports/aging`, click "Draft reminder" on one row — confirm
        the DEMO_CACHE response body renders (no `no_api_key` error toast).

- [ ] **F. (Optional) Smoke against production.** The smoke suite was built
       for the local stack; running it against prod requires:

  ```bash
  BASE_URL=$PROD_URL SKIP_COLD_PDF=1 \
  NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service-role> \
  npm run test:smoke 2>&1 | tail -30
  ```

  Known gaps when running against prod (read `tests/smoke-helpers.mjs` for
  the full reasoning):
  - The "Mailpit-based login" helper (`loginViaMailpit`) actually uses
    service-role `admin.createUser` + `signInWithPassword` (see
    `tests/smoke-helpers.mjs:253`), NOT Mailpit. So login WILL run against
    prod IFF `SUPABASE_SERVICE_ROLE_KEY` is set to the cloud key. But it
    still spot-checks Mailpit reachability at `localhost:54424` — which
    will not be running in production context. Expect this check to fail
    fast; that's OK, fall back to the manual checks in step E.
  - Check #6 (`tests/ai-concurrent-finalize.mjs`) calls `npm run db:reset`
    in its cleanup — that wipes the seed. **Do NOT run check #6 against
    prod.** If running smoke against prod, comment out the check or set
    `SKIP_CONCURRENCY=1` (not currently supported — see deviation below).

  Acceptable outcome: smoke partial-runs, manual checks fill the gaps.

---

## 9. Deviations

- **9.1 Stale `.vercel/project.json`.** The plan stated the project was
  pre-linked. The link was broken (project deleted from Vercel). Side-effect:
  re-linking via `vercel link --yes --project flaw --scope qualiasolutionscy`
  created a fresh empty project with a new `projectId`. The updated
  `.vercel/project.json` is gitignored (`.gitignore` line: `.vercel`) so it
  stays local to the operator's machine — this is intentional and standard.
  No actual deploy occurred.

- **9.2 No `phase-{4,5,6}-*.md` artifacts staged.** The plan suggested
  bundling them in a final chore commit. They have been included in the same
  Task 6 commit alongside `phase-6-deploy.md`, `OPERATOR.md`, and
  `.env.local.example` — single atomic commit for the audit trail.

- **9.3 Smoke-against-prod gap.** The smoke suite assumes local Mailpit at
  `localhost:54424` (see `tests/smoke-helpers.mjs:170-184`). Running against
  production will fail at the Mailpit reachability spot-check even though
  the underlying password-auth path would work. Future hardening: add a
  `SKIP_MAILPIT_PROBE=1` env override. Out-of-scope for Task 6.

- **9.4 No automated deploy possible.** Task 6 was specified as a deploy
  operation, but the precondition gates (no cloud Supabase, no prod env
  vars) require operator decisions that cannot be automated on pitch day
  without risking a broken deploy URL. The deliverable shifts to: a
  validated runbook + operator checklist that the human follows in ~20 min.

---

## 10. Files changed by Task 6

| File                                | Change                                      |
|-------------------------------------|---------------------------------------------|
| `.planning/phase-6-deploy.md`       | NEW — this runbook                          |
| `OPERATOR.md`                       | MODIFIED — added §12 production secrets     |
| `.env.local.example`                | MODIFIED — clarified RESEND_API_KEY is opt. |
| `.vercel/project.json`              | UPDATED (gitignored — local-only)           |
| `.planning/phase-4-*.md`            | NEW — Phase 4 planning artifacts            |
| `.planning/phase-5-*.md`            | NEW — Phase 5 planning artifacts            |
| `.planning/phase-6-plan.md`         | NEW — Phase 6 planning artifact             |

---

## 11. Summary for the orchestrator

**Outcome: BLOCKED.** No `vercel --prod` was attempted. The blockers are
operator-only:

1. Cloud Supabase project for Lex does not exist.
2. Vercel production env vars are not set (only the AXIOM telemetry endpoint
   exists from the project template).

Both are well-documented in `OPERATOR.md` §2-§7 and in §8 of this runbook
("Operator action checklist"). Estimated operator-time to clear: ~20 minutes
of focused work, then a 2-minute `vercel --prod` + 5-check verification.

The code is shipped-ready (TypeScript clean, smoke 9/9 PASS locally). The
infra is not.

GO/NO-GO: **NO-GO until operator completes steps A-D in §8 above. After
that, the deploy is a single command and 5-check sweep.**
