# Static image assets

Files here are referenced directly by path and are NOT admin-editable - they
are fixed assets that do not change between years.

## Awaited (batch 01)

| Path | Used by | Notes |
|---|---|---|
| `events/strongest-at-sideshow.png` | `/events/strongest-sideshow` | Light-background version. The page it sits on is `#0a0a0a` - check it reads, or supply a dark-bg variant (spec §17.3). |
| `venue/crown-complex.jpg` | `/info/directions` | Crown Complex exterior. |

Both slots are already wired and **render nothing until the file exists** - no
broken-image icon, no reserved blank space. Drop the file in at the exact path
above and it appears on the next deploy; no code change needed.
