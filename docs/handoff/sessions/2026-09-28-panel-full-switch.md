# Session 2026-09-28: manual Full / closed for email-host panels (085)

**Delivered.** Branch `feat/panel-full-switch`. Migration **085** and
`verify_085.sql`, delivered, not applied.

**Why (Ryan, 2026-09-28):** Tooth Gem stays email host: signups go to the
presenter, who tells Ryan when she is full. The site cannot count those, so
080's caps do not apply; this is a switch Ryan flips by hand.

- `panels.signup_closed` (default false), appended last to `panels_public`;
  the rest of the view is 065's body, checked against the live column list.
- /admin/panels: "Full / closed" checkbox under Host Email (email-host panels
  only; saved false for every other type) and a red Full badge on the list.
- /events/tattoo-panels: a closed email-host panel shows "Full" and no
  "Contact host" link. `?register=<id>` now opens the site's form only for
  free-registration and AATC-invoice panels (it used to open it for email-host
  panels too, which register with their host).
- /events/schedule: the panel's label reads "Full" instead of "Contact Host".

**Order:** apply 085, run verify_085, THEN merge. Merged first, the schedule's
panel query fails (42703, seen in the build) and the schedule drops panels.

**047 (HELD):** its body would now also drop `signup_closed`, on top of
reverting 065's credit join. Carry both before it is ever run.

**Ryan:** Tooth Gem's host email is being added in admin (2026-09-28).
