# Session 2026-09-28: tattoo contest schedule (rolling format, times from the schedule)

**Delivered.** Branch `fix/contest-schedule`. No migration. One data seed:
`supabase/seeds/best_in_show_2026_09_28.sql` (delivered, not applied).

**How contests run (Ryan, 2026-09-28):** sign-up opens 1 PM; the first
category is called at 4 PM; each is judged as it is called and its winner
announced before the next; a break around 6 PM (Tattoo Dating Game); judging
resumes at the "Tattoo Contest Continues" row (Fri 8 PM, Sat 7 PM). The
existing contest rows are all correct and stay.

- /events/tattoo-contests "Daily Contest Schedule": copy in the registry
  (new page `tattooContests`), every time from schedule_items via
  `src/lib/contest-schedule.ts` (title match, like lib/tattoo-battle.ts):
  per day registration / contests begin / judging resumes; then Tattoo of the
  Day (every day), Best in Show (Sunday), Battle start and champion crowned,
  linking to /tattoo-battle. A missing row drops its line.
- How-to-enter steps: no typed times; "several run at once" removed.
- Homepage "Best of Show" card -> "Best in Show", day and time read from the
  schedule row (empty if the row is missing).
- "Best in Show" everywhere: seed file, spec doc; the live row via the new
  seed (or rename in /admin/schedule). The code matches both titles, so deploy
  order does not matter.
- Comments fixed: homepage-content ("judging begins 4:00 PM"), kids-contest
  registry note and help text ("categories run concurrently").

**Still typed on the homepage (by design, per homepage-content.ts header):**
Battle "Sunday at 6:00 PM", Pin-Up "Saturday at 2:00 PM", Dating Game
"Friday ... at 6:00 PM", Strongest "Saturday at 1:00 PM". Not changed here.

**Ryan (2026-09-28):** adding a Saturday 6:00 PM Tattoo Dating Game row in
/admin/schedule; verify_085 passed; Tooth Gem to email host with host email.
