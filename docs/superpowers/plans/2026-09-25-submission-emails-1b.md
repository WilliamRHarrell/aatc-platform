# Booth and Panel Submission Emails Implementation Plan (PR 1b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Booth applicants (artist and vendor) and seminar registrants get a receipt on submission, and CONTACT_EMAIL gets a notice for each, under the same rules as PR 1 (mail failures logged, never fail the submission).

**Architecture:** Booth forms insert from the browser as the signed-in applicant, so the receipt is sent by `POST /api/application-submitted`, called by the form after its insert. The route verifies ownership through the cookie client, then does a compare-and-set on `applications.submission_receipt_sent_at` (migration 077, clamped for owners) with the service role so it sends once and fails closed. Panel registrations already go through a service-role route, so the sends are inline there for both the free and the invoice branches. Templates and the sender are the PR 1 modules; `applicationReceiptFacts()` is the one description both booth emails read. Stacked on PR 1 (`feat/sponsor-submission-emails`).

**Migration 077 (delivered, not applied):** the column plus both clamp bodies (072 + one line each). Apply with or before deploying this branch; until then the route answers 503 and no booth receipt is sent (fail closed), while panel receipts work immediately.

**Tests:** `application-receipt.test.ts` (kind, booths, artist count, veteran flag, dollars). Not testable here: the sends and the forms.
