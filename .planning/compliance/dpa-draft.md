# Data Processing Agreement (DPA) — Draft

> **STATUS: DRAFT — for Fotini's lawyer review before counter-signature.**
>
> This document is a scaffold prepared by Qualia Solutions Ltd. ("the
> Processor") for the engagement with `[FIRM NAME]` ("the Controller"),
> a Cyprus-licensed law practice. It is NOT legally binding until reviewed
> by the Controller's counsel and executed in writing by both parties.
> Statutory citations marked `INSUFFICIENT EVIDENCE` MUST be verified by
> the Controller's tax counsel before counter-signature.
>
> _Version: v0.1 — 2026-05-13 — initial draft for pitch-day review._

---

## 1. Scope and Roles

This Data Processing Agreement ("DPA") supplements the master services
agreement between the parties and governs the processing of personal data
by the Processor on behalf of the Controller.

- **Controller:** `[FIRM NAME]`, with registered office at
  `[REGISTERED ADDRESS]`, represented by Fotini Kandri (sole practitioner
  / managing partner — to be confirmed at engagement).
- **Processor:** Qualia Solutions Ltd., with registered office in Nicosia,
  Cyprus.
- **Subject-matter of processing:** operation of the Lex invoicing and
  trust-accounting application (the "Service") on behalf of the Controller.
- **Duration:** for the term of the master services agreement and any
  agreed wind-down period.
- **Nature and purpose:** storage, retrieval, billing-document generation,
  PDF rendering, and transactional communication required to deliver the
  Service.

The parties acknowledge that the Controller determines the purposes and
means of processing of all personal data within the Service; the Processor
acts solely on the Controller's documented instructions, including those
contained in this DPA and the user interface of the Service.

## 2. Categories of Personal Data and Data Subjects

The Service processes the following categories of personal data:

- **Client identification data:** client legal name, contact name, postal
  address, billing email address, telephone number.
- **Client tax data:** VAT identification number, Cyprus tax identification
  number where applicable.
- **Billing data:** invoice line-item descriptions, amounts, payment
  references, receipts.
- **Operational data:** time-entry records (date, duration, description),
  trust-account ledger entries (deposits, withdrawals, allocations).
- **Authentication data:** Controller user account credentials managed
  via the underlying authentication sub-processor (Supabase Auth).

> **FLAG for Controller's review:** Invoice line-item descriptions and
> time-entry descriptions MAY incidentally contain sensitive matter context
> (e.g. nature of the legal dispute, references to opposing parties,
> references to natural persons who are not the Controller's direct
> clients). The Controller is responsible for redacting or generalising
> such narratives before saving them to the Service when the matter
> warrants heightened confidentiality (e.g. family law, criminal defence).
> The Processor will treat all line-item text as confidential and apply
> the security measures in Section 5 regardless.

**Categories of data subjects:** the Controller's clients (natural persons
and authorised representatives of corporate clients) and, indirectly,
third parties named within billing narratives.

## 3. Sub-Processors

The Processor engages the sub-processors listed in
[`sub-processors.md`](./sub-processors.md). The Controller authorises the
engagement of those sub-processors at the date of this DPA. The Processor
will notify the Controller in writing at least thirty (30) days in advance
of any intended addition or replacement of sub-processors, giving the
Controller the opportunity to object on reasonable data-protection
grounds.

Each sub-processor is bound by contractual terms that mirror the data-
protection obligations in this DPA, including the obligations under
GDPR Article 28(3)(a)–(h). Sub-processor DPAs are available for inspection
on reasonable notice.

## 4. International Transfers

Where personal data is transferred outside the European Economic Area
(EEA), the Processor relies on the following transfer mechanisms:

- **Standard Contractual Clauses (SCCs)** — Commission Implementing
  Decision (EU) 2021/914, Module 2 (controller-to-processor), executed
  between the Processor and each non-EEA sub-processor.
- **UK International Data Transfer Addendum (IDTA)** to the EU SCCs,
  where transfers fall within UK jurisdiction.
- **Transfer Impact Assessments (TIAs)** are completed for each
  non-EEA sub-processor and made available to the Controller on request.

The Processor will not transfer personal data to any third country that
does not benefit from an adequacy decision or one of the safeguards above
without prior written instruction from the Controller.

## 5. Security Measures (Article 32 GDPR)

The Processor implements appropriate technical and organisational measures
to ensure a level of security appropriate to the risk:

- **Encryption in transit:** TLS 1.2+ enforced on all application
  endpoints; HSTS enabled at the hosting layer.
- **Encryption at rest:** database storage encrypted at the
  infrastructure layer by the primary sub-processor (Supabase /
  AWS RDS-equivalent).
- **Row-Level Security (RLS):** all twelve application tables have RLS
  enabled and FORCED at the database level. Workspace isolation is
  enforced by `current_workspace_id()` predicates. See
  `supabase/migrations/20260513000002_rls.sql` lines 88–127 for the
  enable/force statements and lines 128–412 for the per-table policies.
- **Trust-ledger append-only invariant:** the `trust_ledger` table has
  SELECT + INSERT policies only (no UPDATE / DELETE), plus a trigger
  backstop (`deny_trust_mutation()`) that RAISEs on UPDATE/DELETE even
  for the service role. See
  `supabase/migrations/20260513000002_rls.sql` lines 350–397.
- **Append-only audit log:** every revenue and trust mutation writes
  to `audit_log` via a SECURITY DEFINER trigger
  (`public.audit_trigger()`). The audit row captures actor identity,
  actor kind (`user` / `ai`), action, timestamp, and full JSONB
  before/after snapshots. Workspace owners can READ their audit but
  cannot INSERT / UPDATE / DELETE rows directly. See
  `supabase/migrations/20260513000004_audit_triggers.sql` lines 43–127.
- **Authentication:** Supabase Auth with email-based identity; session
  tokens scoped to the Controller's workspace.
- **Access control:** principle of least privilege — the Processor's
  engineering team accesses production data only on documented incident-
  response grounds, with access logged.
- **Backups:** daily encrypted backups retained per the primary sub-
  processor's policy. Restoration tests on request.
- **Personnel:** all Processor personnel handling personal data are bound
  by written confidentiality obligations that survive termination.

The Processor will reasonably assist the Controller in fulfilling its
obligations under Articles 32–36 of the GDPR (security, breach
notification, DPIA, prior consultation).

## 6. Data-Subject Rights

The Processor will assist the Controller, taking into account the nature
of the processing, in fulfilling the Controller's obligations to respond
to requests for exercising data-subject rights under Chapter III of the
GDPR:

- **Right of access (Art. 15)** — the Processor provides export
  functionality that allows the Controller to retrieve all personal data
  relating to a specific client.
- **Right to rectification (Art. 16)** — Controller-side editing is
  supported through the Service UI.
- **Right to erasure (Art. 17)** — erasure requests are honoured subject
  to the retention obligation in Section 7 below. Where erasure conflicts
  with a statutory retention obligation, the conflicting data is
  restricted (Art. 18) rather than deleted, and the data subject is
  informed of the legal basis for retention.
- **Right to data portability (Art. 20)** — exports are provided in
  structured, commonly used formats (CSV / JSON) on Controller request.
- **Right to object / restriction (Arts. 18, 21)** — handled via the
  Controller's incident process; the Processor implements restrictions
  on instruction.

The Processor will forward to the Controller, without undue delay, any
data-subject request received directly by the Processor and will not
respond to such requests except on the Controller's documented
instructions.

## 7. Retention

`INSUFFICIENT EVIDENCE: confirm statute reference with Fotini's tax counsel before counter-signature.` **Records subject to Cyprus tax retention obligations (invoices, receipts, accounting records) are retained for ten (10) years from the end of the relevant tax year, in accordance with Article 8 of the Assessment and Collection of Taxes Law (N.4/1978, as amended) and Cyprus VAT Law L.95(I)/2000.**

Audit-log entries pertaining to revenue and trust mutations are retained for the same period as the underlying records to which they relate (ten years). Operational logs not bearing on tax-relevant records may be retained for a shorter period agreed in writing.

Personal data that is NOT subject to statutory retention is deleted or
returned at the Controller's written instruction, and in any event upon
termination of the master services agreement (see Section 8).

## 8. Termination and Deletion Procedure

Upon termination of the master services agreement, the Processor will,
at the Controller's written option:

1. **Return** all personal data to the Controller in a structured,
   commonly used and machine-readable format (CSV / JSON / SQL dump)
   within thirty (30) days of termination; and
2. **Delete** all personal data from the Processor's systems and
   instruct each sub-processor to do the same, within sixty (60) days
   of termination — EXCEPT records that the Controller or the Processor
   are required by law (including Section 7 above) to retain. For
   retained records, the Processor will continue to apply the security
   measures in Section 5 for the remainder of the statutory retention
   period.

The Processor will, on the Controller's request, provide written
certification of deletion.

## 9. Audit Rights

The Controller has the right, on reasonable advance notice (at least
thirty (30) days, except in cases of suspected breach) and not more than
once per calendar year (unless a competent supervisory authority requires
otherwise), to:

- Receive responses to written questions reasonably necessary to
  demonstrate compliance with this DPA and Article 28 GDPR.
- Inspect the Processor's records, policies, and the audit_log
  attestations relevant to the Controller's workspace.
- Engage an independent third-party auditor (bound by confidentiality)
  to conduct an on-site or remote audit. The Controller bears the cost
  of such audits, except where the audit reveals material non-compliance,
  in which case the Processor bears reasonable costs.

The Processor will reasonably accommodate audit requests and will provide
the Controller with the export functionality necessary to inspect their
own audit_log within the Service UI.

## 10. Governing Law and Jurisdiction

This DPA is governed by the laws of the **Republic of Cyprus**, without
regard to its conflict-of-law principles. The parties submit to the
exclusive jurisdiction of the courts of Nicosia, Cyprus, for any dispute
arising out of or in connection with this DPA, save for the Controller's
right to bring proceedings before the supervisory authority of the
Controller's habitual residence (Office of the Commissioner for Personal
Data Protection, Cyprus — `[CYPRUS DPC CONTACT EMAIL]`) under Article 77
GDPR.

---

## Signatures

| Party                                | Name                          | Title                 | Signature   | Date          |
| ------------------------------------ | ----------------------------- | --------------------- | ----------- | ------------- |
| Controller — `[FIRM NAME]`           | `[CONTROLLER REPRESENTATIVE]` | `[CONTROLLER TITLE]`  | `__________` | `__________` |
| Processor — Qualia Solutions Ltd.    | `[PROCESSOR REPRESENTATIVE]`  | `[PROCESSOR TITLE]`   | `__________` | `__________` |

---

## Change-log

- _v0.1 — 2026-05-13 — initial draft for pitch-day review (Qualia Solutions)._
