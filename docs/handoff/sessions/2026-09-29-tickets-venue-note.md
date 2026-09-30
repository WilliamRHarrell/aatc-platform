# Session 2026-09-29: short venue note on /tickets (branch content/tickets-venue-note)

- The /tickets "Good to Know" section gets three bullets approved by Ryan on
  2026-09-29: clear bags only, Pepsi facility, keep your wristband on. They
  are appended to `tickets.goodtoknow_body`, which is still editable at
  /admin/content. page_content has no `goodtoknow_body` row (read
  2026-09-29), so the default is the live copy.
- A "Full venue policies" link to /info/policies follows the text. It is
  rendered in code and opens in the same tab; links inside the Markdown
  component always open a new tab.
- The approved email version is in `docs/handoff/pre-show-email.md`. Ryan
  sends it through the box office or a GHL pre-show email. Ticketmaster sends
  the ticket confirmations, not this codebase.
