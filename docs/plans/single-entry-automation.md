# SUPER-PROMPT — "Single-Entry Funeral OS: Complete Automation from Intake" (v2)

> Planning artifact for the multi-agent run. Read-only/source-first discipline.
> Governing rules: this repo's active project rules are `AGENTS.md` (project) + `~/AGENTS.md` (global).

**Mission (the goal):** Wire every *verified-reliable* data source into the GGFuneralOS dashboard so it stops being a manual ledger and becomes a live mirror of the business.

**Mission behind the mission (the goal behind the goal):** *Single-entry automation* — a deceased's and family's information is captured **once** at first contact and flows through arrangement → death-cert filing → cremation/burial → production → payment → closeout **without human re-keying**, while Missouri compliance deadlines enforce themselves and grieving families are never contacted by the wrong channel or at the wrong time.

## North Star & architecture pillars (owner directives, 2026-05-29)

**Strategy:** Operate in the *background* of the live funeral home — read their data, optimize it in our Neon, build automated workflows — so they eventually **migrate off their system onto our OS by choice**. Trust is existential: one write that touches their live OS (sheet/server/SMB mount) = immediate failure. Every action is gold-standard AND provably non-invasive to their side.

**Acceptance bar:** Our dashboard must be **at least as functional as their Google Sheet** for running funeral operations and viewing data — then enhanced. Parity first, then automation.

**Ingestion vision:** Sync *all* reliable sources and **wake our parser whenever a source changes** (event-driven ingestion), so new data is parsed + inserted automatically. Eventually their **email and their entire server** become inputs our OS auto-categorizes for future workflows.

**CRITICAL non-invasive constraint (gold-standard + read-only boundary):** We **cannot** install true push-hooks/triggers on their Google Sheet — an Apps Script trigger or Drive webhook on *their* file would modify their side and violate the boundary. So "wake on update" must be achieved by **non-invasive change detection we own**:
- A scheduled poller (Vercel Cron / scheduled function) checks the sheet's Drive `modifiedTime`/revision cheaply; only on change does it run a full parse.
- We *already* compute a per-row `content_hash` in the staging layer (`source_sheet_rows`) — so we can diff and parse only changed rows.
- Same pattern generalizes to email (poll IMAP/Gmail API read-only) and the server/SMB (read-only metadata diff). The trigger logic lives entirely on *our* side; their systems are only ever read.

## Completion dossier — verified 2026-05-29 (workflow `wf_2b8043bd-726`, 10 agents, adversarially verified)

Full output: `tasks/wr9g1wq4j.output`. Highlights:

**Verified metric definitions (use these exact predicates):**
- *2026 Golden Gate numbered records* = distinct `(source, source_case_number)` where `source_case_number LIKE '26%'` → **2,041** (1,494 `26-NNN` + 547 `26-NNNN`). Use the loose `LIKE`, not a strict 3-digit regex.
- *2026 canonical name-year cases* = distinct `case_group_key LIKE '%|2026'` with `source_case_number IS NOT NULL` → **1,650** (a strict `NN-NNN` regex wrongly yields 1,130 by dropping 4-digit sequences).
- *May 2026 activity groups* = distinct `case_group_key` with `business_date` in 2026-05 → **145** (not 146).
- *Data-quality:* 4 distinct `source_case_number` decode to impossible future years (`34-175`→2034, `32-328/373/395`→2032). Add a validation flag for prefixes > current_year+1.

**DOB/DOD source ranking (post-adversarial verification) — no reliable source exists:**
1. Operational_items Neon capture (intake) — the authoritative *path*, but 0/15,588 populated today.
2. Public obituary site (Tukios) — **REFUTED as primary**: fail-open (bad slugs → HTTP 200 + stray date), non-enumerable (no sitemap URLs), header-vs-body DOD disagreement, opt-in + lagging. Usable only as read-only cross-check of already-public cases, never overwriting Neon, fail-closed.
3. Legacy `cases` — **REFUTED**: 3 test rows ("Test Case", "are real"), 8 weeks stale.
4. SMB `source_file_items` — programs only, names no dates.
5. Connected Google Drive — **wrong account** (personal/MyProof, zero funeral docs); correct Golden Gate Workspace not connected.

→ **Manual DOD capture at intake remains the fail-closed authority for the MoEVR 5-day deadline.**

**Functional parity gaps (dashboard vs their sheet), ranked:**
- *BLOCKER:* (1) sheet write-back — the intentional read-only boundary; GATED by design. (2) No create-case/add-row path (only groups already-synced rows).
- *HIGH (viewing, safe to build):* board is hard-coded alphabetical (`page.tsx:3449`), no column sort; silent 200-row client cap + 250/area server cap, no pagination; no per-register/per-year views; no status/state filters.
- *HIGH (editing, needs product decision):* capture arbitrary per-row fields (only 6 editable today); time-of-day scheduling (date-only); editable service crew/logistics; belongings inventory.
- *MEDIUM:* structured release/chain-of-custody events, ad-hoc tasks, append-only note log, per-register counts, times on board.
- *Dashboard already at/above parity:* initials-gated audited status, DOD capture, source-row provenance, SSN masked to last-4 (deliberate).

**Plan status:** DONE = identity layer (resolver + grouping + date-bridge), verified metrics, source landscape. READY-TO-BUILD (our-side-only) = data-quality flag, identity-quality UI, viewing-parity (sort/pagination/per-register/filters), create/edit-in-Neon, obituary read-only cross-check. GATED (director review + sandbox) = all family-facing (Twilio/SMS/email/auto-publish), sheet write-back, Drive ingestion (needs correct account).

## First-call intake (create-case) — COMPLETE 2026-05-30 (verified, pushed)

The dashboard can now ORIGINATE a case (the migration beachhead), not just mirror the sheet.
- **`lib/case-identity.ts`** (`9c64482`): canonical name+death-year key shared by the sync and intake (§13).
- **`first_call_intake` table** (migration `017`): system-of-record for the intake event; `date_of_death` + `nok_name` NOT NULL (fail-closed).
- **`POST /api/dashboard/first-call`** (`de7ab9b`): validates (last name, DOD, NOK, initials), writes the intake row + a board row (`operational_items`, `source='First Call'`, `source_origin='ggfuneralos'`, DOD set → MoEVR clock starts) + NOK (`case_contact_state`) + first-call step done (`case_workflow_state`). Threads with later sheet rows by name+death-year.
- **UI** (`bf442cd`/`d3a6be4`/`dc5ca50`): red **"+ New First Call"** top button → 7-section drawer; **"Recent First Calls"** top view (cases with a `source='First Call'` item in last 72h); **Case #** column left of Deceased (GG ref, or amber "New" for un-numbered first-call cases). First-call detection keys on the explicit `source='First Call'` (durable, not the default origin).
- Verified end-to-end via Playwright (create → appears in Recent First Calls with New badge); all QA fixtures deleted. No family-facing sends; read-only on their side.

## Viewing parity — COMPLETE 2026-05-29/30 (all dashboard-only, verified, pushed)

- **Sort** (`d903029`): Name / Recently updated / Most records (was hard-coded alphabetical).
- **Reach all rows** (`d903029`+`f4f05b8`): "Show more" reveals client-loaded records, then "Load more from source" raises the per-area server window (`per_area`, capped 2000) — verified 200→749. Default load unchanged.
- **"Needs attention" filter** (`1d737ef`): shows cases with a skipped workflow step (the `gap` signal) — verified active 195→61.
- **Per-register views** (`ce26213`): a register dropdown (19 source tabs w/ counts from new `meta.registers`) fetches a chosen register whole via `?source=` (no per-area window, limit 5000) — verified Belongings→166, Death Certificate 2024→1,144. Matches their sheet-tab mental model.

Remaining viewing nit: #4 bad-prefix DQ surface — already handled on the metric side (the year clamp excludes `32-`/`34-`), and the 4 rows are findable via search; a dedicated badge is low value.

## Auto-ingestion — LIVE 2026-05-29 (commit `df82a34`)

Scheduled freshness without touching their side: a secret-gated `GET /api/cron/sync` endpoint runs `syncMasterSheet` (read-only on their sheet, writes our Neon; advisory-lock + cooldown guarded, idempotent). Gated by `Authorization: Bearer $CRON_SECRET` (Vercel auto-sends this to cron invocations; `CRON_SECRET` set in Vercel prod env). Cron routes are exempted from the session middleware (`src/middleware.ts`) since they self-authenticate. Scheduled in `dashboard/vercel.json`: `*/15 12-23 * * *` (every 15 min, 12–23 UTC ≈ 7am–7pm Central business hours).

**Verified:** endpoint returns 401 without/with wrong secret, 200 + full sync (15,039 parsed, sync_run_id) with the correct secret — exactly what Vercel cron invokes. **Pending live confirmation:** first scheduled fire is 12:00 UTC (was deployed at ~03:00 UTC, outside the window); confirm by checking `source_sheet_sync_runs` for runs at :00/:15/:30/:45 during 12–23 UTC.

**Future optimization (noted):** each run does a full 15k-row sync. A cheap change-detector (Drive `modifiedTime`/revision) would skip unchanged polls, but the service account currently holds only `spreadsheets.readonly` scope — adding Drive metadata scope is a Google Cloud change. Until then, full idempotent sync each tick is acceptable (read-only on their side, our-side write cost only).

## Governing rules

Fail-closed on every compliance deadline; never substitute a "nearby" variable for a legal date (§7/§9/§10). Auto-publishing and any family-facing send stay gated behind director approval. Read-only sources (Google sheet, SMB, Gmail, Calendar) are **never** written back to — all staff-authored truth lives in Neon override tables, preserved across re-sync via `edited_fields`. One canonical implementation for case identity and deadline math (§13).

## Completed prerequisite (do not rebuild)

Sync concurrency/rate-limit architecture already exists on `main` — DB lock (`source_sync_locks`), cooldown (`GOOGLE_SHEET_SYNC_MIN_INTERVAL_SECONDS`, default 60s), stale-lock expiry (`SOURCE_SYNC_LOCK_STALE_MINUTES`, default 10), and a `local_cache` fallback (`dashboard/src/lib/master-sheet-sync.ts`). **Phase 0 and all reads must use the local cache / Neon first; force a live Sheets sync only deliberately and sparingly**, respecting the existing lock + cooldown.

## Phase 0 — Verify the map before building (read-only, cache-first)

Connect to live Neon (no forced Sheets sync) and turn estimates into hard numbers: real row counts per area and true non-null density for `date_of_death`, `business_date`, service/cremation dates, owner/contact, location, and case number. Output a verified field-reliability table. Do not build on estimated densities.

### Phase 0 — COMPLETED 2026-05-29 (verified against live Neon `solitary-shadow-29145512`, cache-first, no forced sync)

Active rows: **8,746** (cremains 3,561 · crematory 2,672 · death-cert 1,769 · production 549 · belongings 166 · arrangement 21 · service 8).

Verified field reliability (replaces the code-only estimates):

| Field | Verified source | Real coverage | Rating |
|---|---|---|---|
| Deceased name | `name_of_deceased` / `deceased_name_last_first` / `deceased` | ~100% (key varies by area) | HIGH |
| **Case number** | `source_payload->>'case'` (death-cert only) | **1,749 / 1,769 = 98.9%** clean `NN-NNN`; ~20 month-header noise | HIGH but **UNTAPPED** — `source_case_number` column = 0 |
| `business_date` | parsed | cremains 98% · production 100% · crematory 57% · **death-cert / belongings / service = 0%** | MED |
| **Date of Death** | none in any live source | **0 / 8,746** (+2 legacy `cases` seed rows) | EMPTY |
| **Date of Birth** | none | **0 / 8,746** | EMPTY |
| Owner | `owner` column | 100% (team/area labels, not verified NOK) | MED |
| Family contact / NOK | `case_contact_state` | **0 rows** | EMPTY (built, never used) |
| Staff overrides | `edited_fields` + all state tables | **0 everywhere** | EMPTY (override architecture 0% exercised) |
| Payments / docs / obits / docusign / insurance | respective tables | **all 0** | EMPTY (confirmed stubs) |
| SMB files | `source_file_items` | 549 active program PDFs, named by deceased; no dates, no case numbers | LOW-MED |

**Decisions locked by evidence:**
- DOD/DOB are genuinely absent from master sheet (no `death`/`dod`/`birth` raw key), SMB, intake, and legacy. Manual capture as **fail-closed fallback** is correct — there is nothing upstream to wire first for dates.
- The strongest identity tier (case number) already exists for 98.9% of death-cert rows in `source_payload->>'case'`, unparsed. It exists **only** in death-cert; cremains/crematory/service have zero case numbers → tiered fallback is mandatory and, with DOD=0, those areas sit at the `unverified_identity` tier today.
- The staging tables (`source_sheet_rows` / `source_sheet_sync_runs`) do **not** exist in Neon yet — created at runtime by `ensureSourceSheetStagingTables` only when a sync runs.
- Live caseload is tiny (arrangement 21 + service 8 = 29); 8,000+ rows are historical reference logs.

## Phase 1 — Establish canonical case identity (layered, not single-key)

### Phase 1 — case-number backfill COMPLETED 2026-05-29 (deployed + verified)

Root cause of the empty `source_case_number` column: the hardened parser (commit `749b4d5`, plus staging `43302d5`) was pushed to `origin/main` but the dashboard's last Vercel prod deploy (14:02 EDT) predated it. **No code change was needed** — the parser already extracts `source_payload->>'case'`. Deployed `749b4d5` to prod (build `n1cz04bbt`, aliased to ggfuneralos-dashboard.vercel.app) and ran one deliberate `force` sync (run `ec22bad0`). Verified results:

- `source_case_number` (clean `NN-NNN`) backfilled **0 → 11,203 rows**: death-cert 7,224/7,260 (99.5%), crematory 3,975/4,010 (99.1%), cremains 4, others 0. (Crematory carrying case numbers was a bonus beyond the death-cert-only prediction.)
- Staging tables now exist and populated: `source_sheet_sync_runs` = 1, `source_sheet_rows` = 15,205.
- Behavior change: hardened code reads all 18 tabs (2018–2026) vs old 9 → active rows 8,746 → 15,587 (full historical case history now present; feed remains windowed 250/area newest-first).

**CORRECTION (verified 2026-05-29 against raw staged rows — supersedes the "strongest identity tier" claim above):** Golden Gate's `NN-NNN` is a **per-log, per-year sequence number**, NOT a global case ID. Proof from `source_sheet_rows`: `23-001` = "Nooner, Terry" in *2023 Crematory Log* but "Strickland, Daisy" in *Death Certificate 2023*; `21-049` appears twice in *Death Certificate 2021* (rows 50 & 52: "Bermudez, Jorge" and "Came, Stephenson"). Each register (death-cert / crematory / cremains / belongings / service / arrangements) numbers independently from `YY-001`, and the number is not even unique within a single log (their sheet has duplicate-number data-entry errors). The 2,715 apparent "2-area threads" were coincidental sequence collisions, not one case spanning two areas.

### CANONICAL MODEL DECISION (2026-05-29): adapt ours to Golden Gate's system

Per owner directive "use Golden Gate's system and adapt ours to theirs." Their system = independent functional registers threaded by **name**, with `NN-NNN` as a within-register reference. Therefore:

- **Canonical cross-log case identity = normalized name + year/period context** (vindicates the existing `case_match_key` approach; the legacy `cases` model is NOT canonical).
- **`NN-NNN` = a per-register reference attribute** — display it (it's their official number) and use it to disambiguate same-name people within a year — but NEVER as a join/merge key.
- **Collision guards both directions:** same-number ≠ same case (proved), same-name-different-period ≠ same case (Jr/Sr concern). Ambiguous matches → `unverified_identity` for director review, never auto-merge.

Remaining Phase 1 work (pending): implement the name-primary tiered resolver with the above guards, and surface `NN-NNN` as a display/disambiguation attribute. Name-key exists for 100% of rows; case number for ~72% (death-cert/crematory only).

### Phase 1 identity resolver — STEP 1 (data layer) COMPLETED + VERIFIED 2026-05-29

Commit `c1378eb`, deployed (`7pftxn4ru`), re-synced (run `6d14087d`), verified on live Neon. `applyCaseIdentity()` (two-phase, canonical, in `master-sheet-sync.ts`) now writes `case_group_key` (name|death-year), `case_year`, `identity_status`, `identity_basis` into `source_payload`. Live distribution: resolved 11,199 · bridged 2,959 · date-year 608 · name-only 177 · **unverified 96 (flagged, not merged)** · SMB-only 549 (untouched). Fail-closed proof: case `21-049` (two people sharing one number) split into `bermudez jorge|2021` and `came stephenson|2021` — no merge.

STEP 2 (UI, pending): point `caseKeyForItem` (page.tsx:602) at `case_group_key` (fallback to `case_match_key`), display the `NN-NNN` number, and surface an `unverified` badge for director review. Pure dashboard change — zero impact on Golden Gate's side.


Resolve the dual-model collision (`operational_items` vs legacy `cases`); document the canonical choice. Identity resolution is **tiered**, never `case_match_key` alone:

1. `source_case_number` when present (strongest);
2. else **name + DOD**;
3. else **name + source refs**, flagged **`unverified_identity`**.

Two same-name cases must **never** auto-merge; an unresolved match stays in the `unverified_identity` state for director review rather than guessing.

## Phase 2 — Find/verify reliable DOB/DOD sources first, then build the fallback

State the gap honestly: **"no reliable DOD source has been verified yet"** — *not* "DOD has no source." Order of work:

1. **Verify upstream candidates** for DOB/DOD: the master sheet (known weak), legacy `cases`, **Gmail attachments**, **SMB files** (death-cert PDFs / authorizations), **Google Calendar** entries, and **downstream obituaries** — rank each by reliability with evidence.
2. **Wire the most reliable verified source** into the dashboard.
3. **Only then** add manual DOD capture as the **fail-closed fallback** for cases where no reliable source exists. The deadline badge stays red/unknown until DOD is captured from *any* path — never green by default.

## Phase 3 — Turn intake into case creation

Wire the Twilio inbound webhook to *parse* family replies (name, NOK phone/email, DOD, disposition intent) and promote `intake_conversations` into a real case + `case_contact_state` row — director-reviewed, never auto-published. This is the heart of single-entry: the family's first message seeds the whole case.

## Phase 4 — Authoritative contact + location

Make `case_contact_state` the one true NOK record (name/relationship/phone/email, parsed from free-text titles). Add a `locations` reference table (chapels, crematoriums, cemeteries); convert `case_milestones` location fields from free-text to references with a dashboard dropdown.

## Phase 5 — Live task orchestration

Make the orchestrator actually emit phase-driven tasks on phase change and advance the next phase on completion, so the "60+ auto-tasks" claim becomes real and the board shows what's due, not what someone remembered to type.

## Phase 6 — Payment + freshness truth

Add manual payment entry (check/cash/insurance/preneed) alongside the Stripe webhook. Surface `last_synced` / `data_age` in the dashboard API with a stale-data warning (sheet sync >6h, SMB index >24h) so staff never trust silently-stale data.

## Definition of done

A new case is created from a single inbound family text; its DOD comes from the most reliable verified source (manual capture only as fail-closed fallback) and enforces the MoEVR clock; identity is resolved by the tiered key with no same-name merges; NOK and locations are structured and reused everywhere; tasks generate themselves per phase; payment and data-freshness states are truthful — and no field is ever typed twice. Each phase ships with verified runtime evidence (live query output, screenshots, sync logs), gated per §6, cache-first per the prerequisite.
