# Sponsor Submission Emails Implementation Plan (PR 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sponsor who submits the form gets a receipt, CONTACT_EMAIL gets a notice for every sponsor application and every pinup registration, and the sponsor submission moves behind a server route so those sends cannot be triggered from the browser.

**Architecture:** `POST /api/sponsor-apply` (service role, bot trap, server-side validation, amount from SPONSOR_TIERS, guardedWrite insert, two receipts that never fail the request) replaces the browser insert on /apply/sponsor. The email wrapper moves to `src/lib/email-templates.ts` (one home) with the three new templates; `src/lib/transactional-email.ts` is the one Resend call for intake routes. The pinup route gains the internal notice. Approved by Ryan 2026-09-25 ("PR 1: go"), with the anon insert policy on sponsorships to be dropped in 076 once the route is the only writer.

**Tests:** `sponsor-submission.test.ts` (amount from the tier table, primary tier, validation, unknown tiers refused, client amount ignored, logo URL must be the public bucket). Not testable here: the sends (Resend) and the browser form.

**Decisions:** the honeypot is still named `website` (bot-trap contract), so the real website field posts as `websiteUrl`. The logo upload stays client-side and the route only accepts a URL inside the public exhibitor-media bucket.
