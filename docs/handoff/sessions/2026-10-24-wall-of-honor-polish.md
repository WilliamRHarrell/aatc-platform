# 2026-10-24 - Wall of Honor polish (PR 4)

Plan: docs/superpowers/plans/ (Wall of Honor PR 4 polish plan). PR 4 tidies
the public wall and gives the admin control over how each photo is cropped.

## Delivered (migration NOT applied)

- **Tribute clamp** on `/info/wall-of-honor`: a tribute shows 8 lines, with an
  in-place Read more / Show less.
- **Photo focus points**: each wall photo can carry a focus point, so the card
  crop keeps the right part of the photo in view.
- **Admin focus editor** in the `/admin/wall-of-honor` drawer.
- **Gold Star passes sentence** has one home, `GOLD_STAR_PASSES_SENTENCE` in
  `src/lib/event-config.ts`, rendered by both `/info/wall-of-honor` and
  `/events/vip-meet-greet`.
- **Migration 107** + verify_107 + types: `photo_focus` jsonb (keyed by photo
  path, `{x, y}` percents 0-100) with an immutable validity CHECK, the guard
  reverts it for non-admins, and the public view appends it (eleven columns).

## Ryan: apply 107 AFTER 106

107 is delivered, not applied. Apply 106 first, then 107, then run verify_107
per its header.

## Deploy before apply is safe for the live wall

The public page reads `select('*')` with a defensive reader and defaults the
focus to upper-center (`50% 25%`). Published tributes therefore keep rendering
through the window between merge and apply. Only the admin focus editor needs
107: until it is applied, its saves fail cleanly.

## verify_105 block A is superseded

verify_105's ten-column view pin (its block A) is SUPERSEDED by verify_107 once
107 applies (the view gains `photo_focus`). Expect it to fail if re-run, like
the verify_104 C1/C4 precedent.

## Donor sentence supersession

Ryan, 2026-10-23: the Cumberland County Crown Complex is now a CO-DONOR,
superseding the 2026-09-13 correction. The sentence has one home,
`GOLD_STAR_PASSES_SENTENCE`, rendered by both pages, with a keep-in-step test
(`src/lib/gold-star-sentence.test.ts`). "Around 50" stays because the number
varies with Survivor Outreach Services sign-ups.

## Focus behavior

- Unset focus defaults to upper-center (`50% 25%`).
- The admin sets it per photo in the drawer: click the part to keep, see the
  5:3 card preview, Reset to return to the default. The lightbox always shows
  the uncropped original.
- Edits work WHILE PUBLISHED (the files do not change, only the crop) and
  revalidate the wall. Unused focus entries are pruned on save.
- Keyboard users can Reset but cannot set a point. Open-items candidate.

## The clamp

8 lines. Read more appears only when the text actually overflows, and the
overflow is re-measured on resize and after fonts load (1px rounding
tolerated).

## Verification (this branch, run locally)

- `npm test`: Test Files 60 passed (60), Tests 443 passed (443)
- `npm run build`: completed, route table printed, no errors
- `npm run verify:local -- supabase/verify/verify_107.sql`: [verify-local] PASS verify_107.sql
- `npm run verify:local -- --audit`: audit: 200 fixture inserts checked, 0 missing a required column
