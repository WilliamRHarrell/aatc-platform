# Applications Public View (075) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nobody reads applicant PII through the directory policy any more: anon and authenticated non-owners read a column-limited view, the table's public policy is gone, the two staff roles that reached applicant rows through that policy keep exactly the rows they had, and every PUBLIC-scoped write policy names its roles.

**Architecture:** Migration 075 creates `applications_public` (security_invoker = false, the 038 pattern) over the same predicate as the old policy with the 20 directory columns and `artists[].id_url` stripped; grants SELECT to anon and authenticated; drops "applications: public read deposit-paid"; removes anon's 074 column grant and table SELECT; adds "applications: staff read directory rows" for content_editor and sponsorship_manager (the /admin/print and /admin/invoices embeds); re-creates the 13 PUBLIC-scoped write policies with explicit roles and verbatim bodies. The three directory pages read the view. A test pins the view's column list to the union of what those pages select.

**Tech Stack:** Supabase RLS + views, Next.js 16, vitest.

**Spec:** the 075 items recorded in HANDOFF after the 2026-09-24 audit, approved by Ryan ("proceed with 075 as I described").

## Global Constraints
- Migration **075** and `verify_075.sql` delivered, never applied. Policies enumerated in the header.
- Bodies of re-created policies are verbatim; only the TO clause changes.
- One home: the view's column list is the directory's column list (test).
- No em/en dashes in `src/`.

## Review Focus
1. **Owner reads after the public policy goes.** /portal and RosterCompletionPanel read the owner's own row through "applications: own read" (001, PUBLIC-scoped, auth.uid() = user_id); untouched. verify_075 block D reads as the harness owner and expects its own row.
2. **content_editor on /admin/print and sponsorship_manager on /admin/invoices** saw approved, roster-complete, deposit-paid applications through the public policy. The staff policy reproduces exactly that predicate for exactly those two roles, so nothing they see changes. verify_075 block C.
3. **Directory filters on the view.** `status` and `exhibitor_type` stay in the view so `.eq('status','approved')` and `.eq('exhibitor_type','artist')` keep working; `.single()` by id keeps working.
4. **`artists` JSON carried per-artist ID document paths.** The view strips `id_url` from every element. verify_075 block E asserts no element in any row has the key.
5. **A `for all` policy with only USING** gets WITH CHECK = USING; re-creating with `to authenticated` keeps that. verify_075 block F asserts no write policy in public is PUBLIC-scoped and prints SELECT policies that still are (REVIEW).

## Decisions
- **D1.** Staff policy for content_editor + sponsorship_manager rather than removing /admin/print from content_editor: it preserves today's behaviour exactly and is the smallest change. Ryan can drop the policy later; roles.ts's "no applications" line for content_editor already had this exception through the print page.
- **D2.** The view exposes `phone` and `artists` (minus id_url) because the directory already renders them; that is existing behaviour, not new exposure.
- **D3.** PUBLIC-scoped SELECT policies (events, contests, applications own read, etc.) are left as they are and listed by verify_075 for review; this PR is about writes, per the audit item.

## Tasks
1. Tests first: `src/lib/applications-public.test.ts` (directory pages read the view; view column list covers the directory selects and none of the withheld columns; no public-side file reads the table). Replace the 074 test that pinned the table selects.
2. Migration 075 + verify_075 + `applications_public` in `database.ts` Views.
3. Directory pages read the view.
4. HANDOFF, whole-branch verification, security review, PR.
