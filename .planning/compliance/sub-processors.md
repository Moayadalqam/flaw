# Sub-Processor Register

> **STATUS: DRAFT — Fotini's lawyer reviews and counter-signs at engagement.**
>
> Maintained by Qualia Solutions Ltd. (data processor). This register lists
> every third party that may process personal data on behalf of the controller
> (`[FIRM NAME]`, Fotini Kandri's law firm). It is published under GDPR
> Article 28(2) (controller's right to be informed of sub-processors) and
> forms an appendix to the Data Processing Agreement (`dpa-draft.md`).
>
> Reviewed quarterly. Material changes notified to the controller in writing
> with thirty (30) days' advance notice.

## Register

| Vendor       | Role                              | Data accessed                                                                                                                                          | Location                                                                              | Transfer mechanism                                                                              | EU residency                                                                                                                              |
| ------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase     | Primary database, auth, storage   | All workspace rows: clients, matters, invoices, line-item descriptions, receipts, quotations, retainers, time_entries, trust_ledger, audit_log         | EU — Frankfurt (`eu-central-1`)                                                       | Intra-EEA; no third-country transfer for primary data plane                                     | Confirmed EU-only project region pending controller's onboarding sign-off. `INSUFFICIENT EVIDENCE: confirm at first onboarding session.`  |
| Vercel       | Hosting (page renders, functions) | HTTP request envelopes (IP, user-agent), rendered HTML, server-action payloads in transit                                                              | Edge: global PoPs (incl. US). Functions: pinned to EU region (`fra1`) per project cfg | EU SCC Module 2 (controller → processor) + UK IDTA addendum                                     | Edge cache layer is global by design (CDN). Function compute pinned EU. No persistent storage of personal data on Vercel infrastructure.  |
| OpenRouter   | AI model routing                  | Prompts (line-item descriptions for narrative cleanup, time-entry summaries for reminder drafting) + completions. **No** auth credentials, **no** PII identifiers beyond what the lawyer includes in the source text. | US (routing service). Downstream models: Mistral routed to EU endpoints; Anthropic routed to US. | EU SCC Module 2 (controller → processor) + UK IDTA addendum. Downstream model providers contractually bound by OpenRouter's processor terms. | **FLAG for Fotini's review:** Anthropic downstream is US-resident. `INSUFFICIENT EVIDENCE: confirm whether sensitive matter narratives may transit US-resident models or must be restricted to EU-routed Mistral only.` |
| Resend       | Transactional email delivery      | Email envelope (recipient address, sender address, subject), email body (invoice number, due date, payment link)                                       | US                                                                                    | EU SCC Module 2 (controller → processor) + UK IDTA addendum                                     | No EU residency. Used for outbound transactional mail only; not for marketing.                                                            |
| UptimeRobot  | Uptime monitoring                 | Public-endpoint HTTP probes only. No authenticated requests. **No user data.**                                                                         | US                                                                                    | Not applicable — no personal data processed (only public health-check responses)                | No EU residency. Out-of-scope for GDPR processor obligations because no personal data is accessed.                                        |

## Contractual basis — GDPR Article 28(3)(a–h)

Each sub-processor above is contractually bound to the processor (Qualia
Solutions Ltd.) under written terms that, in accordance with GDPR Article
28(3), set out:

- **(a)** the subject-matter, duration, nature and purpose of the processing;
- **(b)** the type of personal data and the categories of data subjects;
- **(c)** the obligations and rights of the controller;
- **(d)** processes only on documented instructions from the controller
  (including with regard to third-country transfers);
- **(e)** ensures persons authorised to process personal data are bound by
  confidentiality;
- **(f)** takes all measures required pursuant to Article 32 (security);
- **(g)** respects the conditions in Articles 28(2) and 28(4) for engaging
  another processor;
- **(h)** assists the controller in fulfilling its obligations to respond to
  data-subject requests, and provides the information necessary to demonstrate
  compliance with Article 28 (including audit / inspection rights).

Each sub-processor's own DPA / processor-terms URL is available on request
and will be appended to this register at first counter-signature.

## Change-log

- _v0.1 — 2026-05-13 — initial draft for pitch-day review (Qualia Solutions)._
