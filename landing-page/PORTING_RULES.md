# LeaseOps React Port — Team Rules (set by the lead designer; non-negotiable)

Goal: the React app must be **visually and behaviourally identical** to the source static site —
every section, every breakpoint (1440 / 991 / 767 / 479), every animation/interaction — and hit
Lighthouse Performance 100 and Accessibility 100.

## Scope
This is a plain, hand-built HTML/CSS/vanilla-JS site (no Webflow, no build tooling) — TWO real
pages: `reference/original/index.html` (home) and `reference/original/demo.html` (the "watch it
answer a call" widget, linked from Home's "Try Demo"/"Book a Call" CTAs). Routes: `/` and `/demo`.
`~/Desktop/LeaseOps/leaseops-landing-page (1).html` and `~/Desktop/LeaseOps/Demo call/` are
excluded — byte-identical duplicate and an orphaned earlier draft of the demo widget respectively,
neither linked from the real pages. Don't port them.

## Sources of truth
- `reference/original/index.html`, `reference/original/demo.html` — the real pages.
- `reference/original/audio/*.mp3` — the 15 call-demo audio clips, already copied to `public/audio/`.
- `src/styles/site.css` — index.html's `<style>` block, copied verbatim (includes `:root` tokens).
- `src/styles/demo.css` — demo.html's own `<style>` block, copied verbatim (adds `.call-demo-widget`/
  `.cdw-*`/`.demo-stage`/`.eyebrow`/etc. — a few base rules like the CSS reset and `:root` vars
  duplicate site.css's with IDENTICAL values, confirmed no conflicts; harmless).

## Styling (STRICT)
1. All styling comes from the GLOBAL stylesheets imported by `src/styles/index.css`. Reuse class
   names verbatim (`className`).
2. Do NOT edit `site.css` or `demo.css`.
3. No inline `style={{}}` for design (a few `style="top:...;left:...;animation-delay:..."` attrs on
   `.cta-float`/decorative elements in the source ARE legitimate per-instance positioning, not
   design — port those as inline `style={{}}` exactly, they're meant to vary per element).
4. No CSS modules, no Tailwind, no hardcoded colors/sizes in JSX.
5. If you need a genuinely new rule, add a clearly-commented, appended-only section to
   `src/styles/globals.css`, using `:root` tokens from site.css.

## Markup (STRICT)
- Port markup 1:1: same elements, nesting, classes, ids, text, `alt` text.
- Convert `class`→`className`, `for`→`htmlFor`, kebab-case SVG attrs→camelCase (`stroke-width`→
  `strokeWidth` etc.), self-close void elements, decode HTML entities where JSX needs it.
- Repeated blocks (stat cards, feature cards, FAQ items, accordion items, process steps, checklist
  items) → small components/data arrays as long as the rendered DOM matches exactly.
- The `<svg class="visually-hidden">` icon sprite (`#ic-cal`, `#ic-home`, etc.) is already ported at
  `src/components/IconSprite.jsx`, mounted once in `Home.jsx` — don't duplicate it, just use
  `<svg><use href="#ic-x"/></svg>` in your markup exactly as the source does.
- Do NOT copy any `.reveal`/`.in-view` animation-state classes as always-on — `.reveal` stays on
  the element (it's the source's own class name and CSS keys off it), but `.in-view` is added by
  JS and is the INTERACTIONS agent's job, not yours.

## File ownership (avoid collisions — only touch your files)
| Agent | Owns |
|---|---|
| Section A | `src/components/sections/{Hero,Stats,Cold,Features}.jsx` |
| Section B | `src/components/sections/{Answered,Impact,Everyone,Process}.jsx` — Process is the pinned/scroll-jacked "Go From Call to Live" section; port its MARKUP only, the scroll-driven step-switching behaviour is the interactions agent's job |
| Section C | `src/components/sections/{Faq,Contact}.jsx` |
| Demo page | `src/pages/Demo.jsx` + any `src/components/demo/**` you need — the full self-contained call-demo widget page, including its own copy of the nav-toggle/scroll-shadow wiring if you build it standalone (check with interactions agent first — prefer sharing `src/interactions/navBehavior.js` if it's ready) |
| Interactions | `src/interactions/**` — dot-icon pattern builder, reveal-on-scroll, count-up numbers, "Built for everyone" + FAQ accordions, contact form, process-section scroll-jacking, smooth anchor scroll (same-page only — cross-page is `ScrollManager.jsx`, lead-owned), nav scroll-shadow + mobile toggle |
| Performance (phase 2) | build config, `index.html`, `scripts/lighthouse.mjs`, `vercel.json` |
| Lead | shared config, `App.jsx`, `Navbar.jsx`, `Footer.jsx`, `ScrollManager.jsx`, `IconSprite.jsx`, `main.jsx`, `index.css` |

## The source JS (read `reference/original/index.html` lines ~1677-1961 and `demo.html` lines
~507-688 for the exact, already-working vanilla JS this all needs to replicate — it's short, clean,
and fully commented; don't reverse-engineer anything, just port it to React idiomatically):
- Dot-grid icon pattern builder (`.dot-icon` → 5×5 diamond grid of `<i>`s)
- Nav: scroll-shadow (`.scrolled` past 8px) + mobile toggle
- Reveal-on-scroll: IntersectionObserver, `.reveal`→adds `.in-view` once, threshold 0.15, rootMargin `0px 0px -60px 0px`
- Count-up numbers: `data-count-to`/`data-suffix`, cubic ease-out, 1400ms, IntersectionObserver-triggered once at threshold 0.5
- Two single-open accordions ("Built for everyone" `#accList`, and FAQ `.faq-item`) — same pattern, separate instances
- Contact form: POST to `https://formsubmit.co/ajax/<email>`, fallback to `mailto:` on failure
- Process section: desktop = scroll-progress-based step 1/2/3 switching + background parallax translateY (see `setupProcessPin`'s exact math); mobile = viewport-probe nearest-step detection; both have a manual-click override with an 1800ms lockout
- Smooth anchor scroll with -80px nav offset (same-page `#hash` links only)

## Servers (already running — do NOT start/stop them, do NOT run `vite build` during phase 1)
- Original: http://localhost:5500 (`/index.html`, `/demo.html`)
- React dev: http://localhost:5173
- Parity: `REACT_BASE=http://localhost:5173 node scripts/parity.mjs home demo [--widths=1440,991,767,479]`
  → writes `parity/<page>/<width>/{original,react,diff}.png`. Heights must match, diff ~0.

## Definition of done (report back with evidence)
- Parity at all 4 widths, both pages: heights equal, diff pixels listed, remaining diffs explained.
- No console errors/warnings from your code.
- `npx oxlint src/<your files>` clean.
