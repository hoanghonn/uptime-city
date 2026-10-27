# Fun-test spike (27 Oct, throwaway)

Run: `git checkout spike/fun-test && npm run dev:web`, open http://localhost:5173.
Type the build, Enter, then `submit`. When the celebrity tweet hits (15 s), type `cache front`.

Screenshots: `spike/1-built.png`, `spike/2-chaos.png` (API servers red at 278%), `spike/3-saved.png`.

What reads well:
- Overloaded buildings turning red and shaking is instantly clear.
- Glowing low-poly shapes + bloom look good at this camera angle; renders in software WebGL with no errors.

What to fix in the real city (Task 9):
- Orbs blow out to white under bloom; dropped (red) orbs are hard to see. Lower orb emissive, keep colour, make dropped orbs bigger and fall visibly.
- A building added mid-test (the firefight cache) must appear with a drop-in animation; the spike doesn't show it.
- Labels overlap (API 1 / API 2) and the % text is low contrast. Offset labels and use a dark pill behind them.
- The city only fills the middle 40% of the screen; zoom in and leave room for the rival's half.
- Roads are hidden under orb streams; make roads wider and lighter.

Owner verdict: pending (play it this evening).
