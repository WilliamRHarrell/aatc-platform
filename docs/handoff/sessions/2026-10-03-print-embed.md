# Session 2026-10-03: /admin/print broken by 087 (branch fix/print-embed)

Migration 087 (booth holds, #60, merged 2026-09-30) added
`booths.held_for_application_id`, a second foreign key from booths to
applications. PostgREST then refuses an unqualified embed between the two
tables with PGRST201 "more than one relationship". **/admin/print (booth
packets) embedded `application:applications(...)` from booths and has failed
since #60 merged.** Reproduced against production on 2026-10-03.

- **Fix:** the embed names the key,
  `applications!booths_application_id_fkey(...)`. Run against production
  read-only: no error.
- **Other embeds checked:** /admin/invoices embeds applications from
  invoices (one key, fine); useExhibitors embeds booths from exhibitors (one
  key, fine).
- **New `src/lib/embeds.test.ts`:** fails on any unqualified booths <->
  applications embed in src/. It fails on the unfixed print page.

Lesson for future migrations: adding a second foreign key between two tables
breaks every unqualified embed between them. Grep for embeds when adding one.

Checks: build passes; `npm test` 245/245.
