# Server-Computed Booth Price and One Active Application (079) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The database prices a booth application from its quantities, corners, add-ons and veteran flag and refuses a client total that differs; a user can hold one active application per event.

**Architecture:** Migration 079 adds `application_list_price()` (immutable, mirror of `calculatePricing()`), extends the insert clamp (077 body) to refuse a non-admin, non-service insert whose `total_amount` differs, and adds a partial unique index on (user_id, event_id) for pending/approved/waitlisted. One home stays `src/lib/pricing.ts`: `pricing-matrix.test.ts` generates `verify_079_matrix.sql` from `calculatePricing()` and fails when the committed file is stale, and it checks the SQL constants against the TS ones by source; verify_079 runs the matrix live and checks the live rows. Forms pre-check for an active application and translate a 23505 into the same message; the admin drawer lists other applications by the same account or email. Approved by Ryan 2026-09-25 (constraint with the warning as its display).

**Decisions:** D1 refuse, not overwrite, so drift is loud. D2 admins and the service role keep their totals (admin add form, returning import at prior-year prices). D3 rejected/expired/canceled rows do not count toward the one-active rule. D4 verify_072 and verify_077 fixtures updated to the list price and to one active harness application at a time.
