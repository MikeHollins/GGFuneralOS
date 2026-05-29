# Master Sheet Sync Architecture

## Decision

The Google Drive connector is useful for development inspection, but it is not the production data bridge. GGFuneralOS uses the Google Sheets API with a read-only service account, stages the raw source rows in Neon, and then materializes dashboard operational items from that staged copy.

## Why

- The merged Google Sheet is a source system. The dashboard must never write back to it.
- Raw rows must be retained before parsing so parser mistakes, moved rows, and partial syncs are auditable.
- Staff edits belong in GGFuneralOS tables, not in Google Sheet cells.
- Google Sheets API reads are quota-limited, so sync work should use batched reads, staging, and replayable parsing instead of ad hoc row-by-row requests.

## Flow

```text
Google Sheet, read-only
  -> source_sheet_sync_runs
  -> source_sheet_rows
  -> tab-specific parsers
  -> operational_items
  -> staff overrides and audit tables

Google Calendar, read-only
  -> /api/dashboard/google-calendar/events
  -> Calendar dashboard view
```

## Source Coverage

The current master sheet sync resolves configured tabs by normalized title so trailing spaces and minor capitalization differences do not break ingestion. It currently covers:

- Weekly Service Schedule
- Arrangements
- Death Certificate 2026, 2025, 2024, and status tabs for 2023 through 2018
- Cremains Log and Picked UP Cremains Log
- 2026 Crematory Log, 2025 Crematory Log, 2024 Running Crematory Log, and 2023 Running Crematory Log
- Belongings

## Rules

- Use only `https://www.googleapis.com/auth/spreadsheets.readonly`.
- Use only `https://www.googleapis.com/auth/calendar.events.readonly` for Google Calendar events.
- Keep Google Sheet row values in `source_sheet_rows`.
- Generate dashboard rows in `operational_items`.
- Preserve internal staff edits through `edited_fields`.
- Archive only rows from source tabs that were successfully read in the current sync.
- Human review gates remain required for family-facing copy, publishing, and compliance-critical completion states.

## Google Calendar

Set `GGFC_GOOGLE_CALENDAR_IDS` to one or more calendar IDs shared with the service account. Use `calendar-id|Friendly Label` for readable dashboard labels, separated by commas for multiple calendars. Set `GGFC_GOOGLE_CALENDAR_URL` to the normal browser calendar URL so staff can open the source calendar directly when needed.
