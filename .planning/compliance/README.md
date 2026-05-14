# Compliance Scaffolds — `[FIRM NAME]` engagement

These documents are **scaffolds** prepared by Qualia Solutions Ltd. for
the prospective engagement with `[FIRM NAME]` (Fotini Kandri's Cyprus
law practice). They are working drafts to be reviewed by the
Controller's counsel before counter-signature or publication. They are
**NOT legally binding** in their present form and are **NOT legal
advice**. Statutory references flagged `INSUFFICIENT EVIDENCE` must be
verified by counsel before any of these documents go live.

---

## Index

| Filename                | Purpose                                                                                                                                          | Status | Reviewer                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------------------- |
| `sub-processors.md`     | GDPR Art. 28(2) sub-processor register. Lists every third party (Supabase, Vercel, OpenRouter, Resend, UptimeRobot) that may process data on the Controller's behalf, with location, transfer mechanism, and EU-residency status. Reviewed quarterly. | DRAFT  | Fotini's lawyer         |
| `dpa-draft.md`          | Data Processing Agreement (Controller / Processor). Ten sections covering scope, data categories, sub-processors, transfers (SCCs + UK IDTA), security measures (TLS / RLS / audit triggers), data-subject rights, retention (10-year VAT clause), termination, audit rights, and Cyprus governing law. Filed in the counter-signature file at engagement. | DRAFT  | Fotini                  |
| `privacy-notice.md`     | Client-facing privacy notice for Fotini to attach to engagement letters or publish on her firm's website footer. Plain language, seven sections, with a Greek section header reserved for the post-engagement translation pass.                                  | DRAFT  | Qualia legal            |
| `README.md` (this file) | Index of the compliance scaffolds in this directory and where each document is intended to live post-engagement.                                  | DRAFT  | public                  |

---

## Where each document lives post-engagement

- `dpa-draft.md` — finalised and counter-signed by both parties; stored
  in the engagement counter-signature file and referenced from the
  master services agreement.
- `sub-processors.md` — maintained as a living document by Qualia
  Solutions Ltd. Reviewed quarterly; material changes notified to the
  Controller with thirty (30) days' advance notice.
- `privacy-notice.md` — published on the firm's website footer and
  attached to client engagement letters; reviewed annually and on any
  material change to processing.

---

## Open items requiring confirmation

- `INSUFFICIENT EVIDENCE: confirm Supabase EU-only project region at
  first onboarding session` (see `sub-processors.md`).
- `INSUFFICIENT EVIDENCE: confirm whether sensitive matter narratives
  may transit US-resident downstream models via OpenRouter, or must be
  restricted to EU-routed Mistral only` (see `sub-processors.md`).
- `INSUFFICIENT EVIDENCE: confirm Cyprus tax-retention statute citations
  (Article 8 of N.4/1978 and Cyprus VAT Law L.95(I)/2000) with Fotini's
  tax counsel before counter-signature` (see `dpa-draft.md` Section 7
  and `privacy-notice.md` Section (e)).
- Greek translation of `privacy-notice.md` — reserved for the Greek
  translation pass post-engagement.

---

## Change-log

- _v0.1 — 2026-05-13 — initial draft for pitch-day review (Qualia Solutions)._
