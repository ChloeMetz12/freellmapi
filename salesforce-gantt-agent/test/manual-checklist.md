# Manual test checklist

There's no Salesforce sandbox, so this checklist — run by hand against
production — is the real verification mechanism for this tool. The
automated `test/unit/` suite only covers pure logic (schema validation,
dry-run wrapping, outcome/notifier logic) with a mocked Playwright page; it
cannot verify anything against a real org.

Do these in order. Do not skip ahead to a live run before dry-run checks 1–2 pass cleanly.

## 1. Login and session

- [ ] `npm run login` opens a browser you can actually see (via a real
      display or VNC into the Xvfb display) and completes login + MFA.
- [ ] `auth/storageState.json` is created.
- [ ] A subsequent run (e.g. step 2 below) reuses the session without
      prompting for login again.
- [ ] Manually invalidate the session (e.g. log out in Salesforce, or wait
      for it to time out) and confirm the tool fails with a clear
      "session expired, run npm run login again" error — not a confusing
      selector-not-found crash.

## 2. Dry run against a real project

- [ ] `npm run cli -- add-project --project "<a real project/customer name>" --dry-run`
      completes without throwing.
- [ ] `runs/<id>/manifest.json` shows every step as `skipped-dry-run`, not `ok`.
- [ ] Open Salesforce afterward and confirm **nothing changed** — no new
      Work Order, no new Service Appointment, no status change.
- [ ] Screenshots in `runs/<id>/` show the form filled in with the fields
      you'd expect (owner/dispatcher/type/territory/date/description),
      even though nothing was saved.

## 3. First live run, on a disposable/low-risk record

Use a real but low-stakes customer record for this (per the note in
README.md — if you already have a specific test customer in mind, use it
here).

- [ ] `npm run cli -- add-project --project "<test customer>" --live`
- [ ] Confirm the Install Work Order was created correctly (type "Install",
      not "Service" — check the pipeline/report view too, since the
      training transcript specifically calls out this mis-tagging risk).
- [ ] Confirm Work Order fields (Owner, Dispatcher, Type, Territory, Date,
      Description) match what you expected.
- [ ] If Get Candidates succeeds: confirm the CLI's interactive prompt
      shows the correct proposed technician and service date before you
      approve.
- [ ] After approving, confirm the appointment shows status **Dispatched**
      in Salesforce, and that the assigned technician's Field Service
      mobile app actually received the job.

## 4. Get Candidates failure path

- [ ] Force or find a case where Get Candidates returns nothing (e.g. a
      territory/date with no available technicians).
- [ ] Confirm the tool stops and returns `NeedsManualAssignment` — it must
      NOT attempt any drag-and-drop placement on its own.
- [ ] Confirm the escalation email actually arrives at the address in
      `ESCALATION_EMAIL_TO`, with the right project/Work Order/Service
      Appointment links.

## 5. Things this tool must NOT touch

- [ ] The pre-existing separate calendar (mentioned in the training as
      still being maintained in parallel) is untouched after any run.
- [ ] Customer-facing notes, if exercised via `AccountNotesPage`, land on
      the **Account**'s related list — never on the Work Order.

## 6. Confirmation gate

- [ ] Run a live add-project through to the point of a proposed technician,
      then **decline** the confirmation prompt (`n`). Confirm the
      appointment is NOT dispatched, and the outcome returned is `Cancelled`.
