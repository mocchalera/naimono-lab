# Word-specific SVG illustrations and motion

Verified 2026-09-18 against main 527b9ef47bf943a62d80fed0e877e7a06278d681.

## Changes
- Eight original procedural SVG outlines; validated, seeded, versioned recipes persist with discoveries.
- Four optional Jev Choice questions share the existing request. The already-needed boundary helper may add optional visual hints; no extra model call for art.
- Art provenance is separate from the existence verdict. Old/unclassified/manual entries remain supported and are not falsely marked AI illustrated.
- Subtle idle motion, Enter/Space/tap reaction, persistent pause/resume, reduced motion, offscreen/closed-dialog/background pause. No new sound loops or runtime dependencies.
- Original speech/input handlers, game rules, large circle/cross result, scores, classification, helper budget and deadlines retained.

## Executed checks
- npm test: 79 passed, 0 failed (includes all 1344 renderer combinations).
- npm run build: passed; standalone includes all local assets.
- scripts/browser_smoke.py: 182 passed, 0 JS errors.
- scripts/browser_visuals.py: 51 passed, 0 JS errors.
- Widths 320/390/1360px; discovery-to-gallery-to-reload identity; malformed and old recipes; classification preservation; manual provenance; tap/keyboard; pause/resume; reduced motion; observer lifecycle.

## Scope and limits
AI binding/fetch, audio recognition and Storage fixtures are explicitly mocked. No live Jev/Gemma accuracy or latency measurement, real-microphone test or iPhone-device test was performed in this change. Additional questions may add input tokens and helper output work even though request count is unchanged. Main and production were not changed during worktree verification.

## Evidence
- browser-visuals-report.json and browser-regression-report.json: executed checks.
- word-visuals-gallery.png and word-visuals-discovery-mobile.png: generated from integrated HTML, not image-generation outputs.
