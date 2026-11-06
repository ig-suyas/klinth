# Handoff

## Phase status

| Phase                          | Status                                |
| ------------------------------ | ------------------------------------- |
| 0 Scaffold and architecture    | done                                  |
| 1 Core engine                  | done (reviewed, hardened)             |
| 2 Blocks and templates         | done                                  |
| 3 Editor UI                    | done                                  |
| 4 Media, embeds, custom code   | done                                  |
| 5 AI Worker, key vault, AI     | done (owner to review the skill text) |
| 5.5 Blank start, multi-page    | done                                  |
| 6 GitHub connect, export       | done (live push needs owner's app)    |
| 7 Hardening                    | done                                  |
| 8 Deploy, launch, push         | done (push waits for owner's go)      |
| 6A Blank, pages, styles, code  | done (all 4 parts)                    |
| 6B Header polish               | done                                  |
| 6C Editor fits the window      | done                                  |
| 6D Header links, no header     | done                                  |
| 6E Animations                  | done                                  |
| Fix: blank site on first visit | done (owner must fix Pages build)     |
| 6F Free canvas, Part 1 of 2    | done (model, render, export; no UI)   |
| 6F Free canvas, Part 2 of 2    | done (drag to free, warning, editing) |
| Fix: free resize and sizing    | done (schema v6)                      |
| Fix: footer, header pop-up     | done (schema v7, not pushed)          |
| 6G Video options, Blank canvas | done (schema v8, not pushed)          |
| 6H Extras (7 new components)   | done (schema v9, not pushed)          |
| 6I Animation presets (more)    | done (schema v10, not pushed)         |

## 1. Current state

**6I: more animation presets on top of 6E (schema version 10).** `MIGRATIONS[9]` changes nothing
(new enum values and one new optional part). 6E already had scroll fade/slide up/zoom/blur-in,
word/letter/typewriter (accessible split), hover lift/tilt/glow, picture parallax, mask wipe and
marquee; this phase reuses all of it unchanged and adds only the gaps. **New part `background`**
(every block that has `section`: all but spacer and footer, incl. Blank canvas and free sections;
`freeSectionProblem`/`flowToFree` now keep `section` and `background`) with presets
`gradient` ("Moving gradient": `::before` layer of three accent/text radial gradients at low mix,
`inset:-20%`, `z-index:-1` inside `isolation:isolate;overflow:clip`; `k-drift` keyframes move only
transform; speed = loop length 30/18/10 s as `--k-background-dur`; still with reduced motion and at
<= 37.5em) and `parallax` ("Parallax background": `anim.js` sets `--k-by` on the section and
`k-bpx`, which moves the `::before` layer and a canvas `.canvas-fill` picture; off on small phones
and with reduced motion). No extra markup: decorative, never read out. **New section transitions**
(whole section only, entrances with speed/delay/repeat): `rise`, `slideLeft`, `slideRight`, `swing`
(`k-rise-in`, `k-from-right`, `k-from-left`, `k-swing`; sideways/swing sections get
`overflow-x:clip`). **Fix:** whole-section animations now also move folded sections (selector
`>:is(.wrap,.xp)`; before, a folded section's `.wrap` sat inside `.xp` and never moved). Editor:
"Background" in "What moves", plain labels/help (`presetLabel`/`presetHelp` name background
parallax separately), live samples in `index.css` for each new preset, free sections offer Whole
section + Background. `ANIM_CSS` budget raised 16 000 -> 18 000 chars on purpose (now ~16.5 k).
Tests (unit tests written first and seen failing: 9/10 core, 3/5 editor; the e2e was written after
the code): core `animation-presets.test.ts` (enums/parts, free sections, markup and timing, phone
and reduced-motion CSS, sideways clip, fold selector, **every block x part x preset on a second
page made from Blank** plus the same section twice, accessible split on every block with a heading,
v10 migration); editor `inspector/AnimationPresets.test.tsx` (labels and a sample for every preset,
gradient speed without wait, transitions with repeat, canvas parts, background parallax script and
its reduced-motion path in jsdom); e2e `animation-presets.spec.ts` (Blank -> second page -> moving
gradient on Big intro, Rise into place on Text and picture, Letter by letter on About -> export ->
exported site: CLS < 0.02 and no sideways scroll at 375, gradient still on the phone and drifting at
1280, everything shown with JS off and with reduced motion). New `npm run lighthouse:anim -w
@klinth/editor` (portfolio with a new preset on every section, assigned by block type): mobile
100 / 100 / 100 / 100, LCP 1.1 s, CLS 0, TBT 50 ms. Totals: 1019 unit (core 619, templates 47,
editor 297, api 56), 47 e2e (`--workers=1`, all pass); lint, format, types pass. Changed on purpose: version pins
9 -> 10 (core and 5 e2e specs), migration key lists, the panel's "What moves" list in
`AnimationPanel.test.tsx`. Committed locally, **not pushed, not deployed**.

**6H: extras inspired by a reference portfolio (schema version 9).** `MIGRATIONS[8]` changes
nothing (new block types, all new props optional). Nothing is tied to a page, template or sample
content: every part works on any page, any number of times, in any template (theme variables only).
**New blocks** (`blocks.ts`, renderers in `render-blocks.ts`, CSS/JS in new `extras.ts`):
`rotator` "Rotating headline" (`heading` = text before, `words` 1-8 x 40 chars, `after`, `effect`
fade|slide|typewriter, `interval` int 1000-10000 ms, `align`): `<hN class="rot-title"
aria-label="before w1, w2, w3 after">`, visible pieces `aria-hidden`; all words in one grid cell
(widest sets the width, no shift); first word painted at once (LCP), later words animate in;
pauses on hover, off screen and in hidden tabs, stops on the first word after 4 rounds.
`cardStack` "Picture stack" (`images` <= 6, `auto`, `interval` 2000-10000, `tilt` 0-15,
`ratio` portrait|square|landscape): already a stack without JS (`--d` depth, `--sg` side), JS
adds Prev/Next, ArrowLeft/Right/Home/End on the region (`.stk-cards` has `tabindex=0`), click on
the front card, pointer swipe > 40 px (`touch-action:pan-y`), live "n / N", `inert` on hidden
cards, optional shuffle with a Pause/Play button (paused on hover/focus, never with reduced
motion); nav row keeps its space before JS (`[hidden]` = `visibility:hidden`), hover fan-out
only with `(hover:hover)` + no-preference. `steps` "Numbered steps" (`<ol role=list>`, items <= 8,
glass by default). `marquee` "Moving quotes" (items <= 12, `speed`, `direction`): scroll-snap row
without JS or with reduced motion; JS adds `aria-hidden` + `inert` copies (counted, never measured:
k = ceil(5/n) groups, doubled), `is-moving`, Pause/Play; paused on hover/focus of the row;
`**phrase**` -> `<mark class="hl">` (`highlightPhrases`: escape first, then markers). Blur is
dropped while it moves (paint cost). `giantText` "Giant text" (`fill` accent|ink|custom +
`color`/`colorTo` as `--g1/--g2` numbers, `angle`, `size` large|huge|max, `align`, `crop` =
`gt-crop` on the section, `reveal` = IO in `extras.js`, never the first section or reduced motion).
**Props on existing blocks:** `cardStyle` plain|glass (about, projects, testimonials, links,
steps, marquee; `cs-glass` on the section; blur, soft shadow, hover lift); `shapes` (every block but
the footer; <= 4 per section, <= 12 per page in `pageSchema`; `kind` starburst|blob|rings|grid,
`color` accent|text|muted|surface, `motion` none|spin|float|pulse, `speed`, `size` 32-640, `x`/`y`
0-100, `opacity` 10-100; fixed SVG drawings in a `shp-layer` `aria-hidden` behind the content,
`isolation:isolate`); `fold`/`foldTitle`/`foldOpen` (every block but footer and spacer):
`wrapFold` puts any section content in `.xp` with `<button class="xp-btn" aria-expanded
aria-controls>` and `role=region aria-labelledby` panel (ids from the section anchor, unique),
grid-rows height animation, closed panels `inert`, Escape inside closes and refocuses, a hash link
into a closed panel opens it; pages with a fold get a fixed `<noscript><style>` so nothing stays
folded without JS. **Files:** `css/extras.css` / `js/extras.js` only on pages that use them
(`pageExtrasCss`/`pageExtrasJs`; steps, glass and shapes need no JS); sites without extras are
byte-identical (template snapshots unchanged). All motion inside `prefers-reduced-motion:
no-preference` (a test strips those blocks and finds no animation or transition left).
**Editor:** inspector fields for all of it (`fields.ts`: shapes list, fold switches, card style);
"Add a section" now lists Rotating headline, Giant text, Numbered steps, Moving quotes, Picture
stack, Expandable section and Decorative shapes (the last two are `sectionPresets` in
`@klinth/templates`: a text section with `fold`, an Empty space with two shapes; `addSection` takes
starting props). Preview inlines both files. Free sections keep shapes/fold but their panel does
not show those fields. New blocks are not free-able. Animation panel: whole section (plus heading
for stack, steps, marquee).
Tests (unit tests written first and seen failing: 20/21 core, 13/13 script): core `extras.test.ts`
(validation incl. NaN/Infinity/strings/markup, caps, export markup per component, escaping,
per-page files, reduced-motion CSS, every component and effect on a second page made from Blank,
v9 migration); editor `preview/extras-script.test.ts` (jsdom: fold button/aria-expanded/inert/Escape,
stack keys/arrows/click/swipe/auto/pause/reduced motion, rotator ticks and reduced motion, marquee
copies/pause/reduced motion, giant reveal), `state/extras.test.ts` (each new menu entry twice on a
second Blank page, fields on every block); templates preset test; e2e `extras.spec.ts` (written
after the code: Blank -> second page -> menu descriptions -> rotating headline + shape, expandable,
marquee on glass -> export -> exported page: Enter/Space on the fold button, word changes, marquee
pauses, CLS < 0.02 on load, no overflow at 1280/375; reduced motion: first word stays, scroll-snap,
fold works). Changed on purpose: version pins 8 -> 9 (core and 4 e2e), migration key lists.
Lighthouse 13.6 (`npm run lighthouse:extras -w @klinth/editor`: portfolio + every extra, mobile,
fails < 95): 96-98 / 100 / 100 / 100 over 5 runs, CLS 0, LCP 1.7-1.8 s, TBT 100-160 ms (the video
check gives 99 / LCP 1.2 s on this laptop today; the gap is one more render-blocking stylesheet and
`site.js`'s existing reveal reflow, 206 ms). Totals: 1004 unit (core 609, templates 47, editor 292,
api 56), 46 e2e (`--workers=1`; the first full run failed 6 because the marquee's description said
"Kind words", which the older specs' `/Kind words/` menu lookup then matched twice; the description
was reworded and those specs pass). Committed locally, **not pushed, not deployed**. Not done: the rotating headline has no
pause button (it stops by itself after 4 rounds); find-in-page does not open closed folds
(`hidden=until-found` not used); the AI helper's output for the new blocks was not tried live.

**6G: video options, several videos per section, Blank canvas, bigger Empty space (schema
version 8).** `MIGRATIONS[7]` changes nothing (all new fields optional, new block type). Rules kept:
no raw iframe HTML (links only, ids re-parsed, players rebuilt from the id), youtube-nocookie /
player.vimeo.com only (also checked again in `video.js`), click-to-load facade, lazy loading, and
only checked whole numbers in CSS (custom properties) or classes from closed lists.
**Video** (`blocks.ts`, renderer in `render-blocks.ts` `styledVideo`, CSS/JS in new `video.ts`):
optional `ratio` landscape|vertical|square|portrait (16:9, 9:16, 1:1, 4:5), `size`
small|medium|large|full (px per shape in `VIDEO_WIDTHS`; unset = full for landscape, medium for the
rest), `maxWidth` (int 160-1600, wins), `radius` (0-48), `border` (0-8), `shadow` none|soft|strong,
`frame` plain|card|glass, `poster` (image asset: facade thumbnail, or `poster=` on uploads; counts
in `assetUsage`, `poster` added to `ASSET_KEYS`), `play` circle|square|minimal, `titleBar` (one
line), `autoplay` (uploads: `muted loop data-autoplay`, never the `autoplay` attribute; `video.js`
plays it only on screen and never with reduced motion, then it gets controls), `controls` (can only
be off on a silent loop), `layout` single|grid|carousel|deck and `videos` (up to 11 more:
`{title, video|embedUrl, poster}`; total `MAX_VIDEOS` = 12). **No setting set = byte-identical old
markup and no new files.** Otherwise the section links `css/video.css`; `js/video.js` is linked for
styled sections **and for any page with two or more videos** (so "one at a time" also covers old
pages; templates have no videos, snapshots unchanged). Layouts: grid = `<ul>` auto-fit; carousel =
native scroll-snap row (`[data-carousel]`, works and swipes without JS), JS adds arrows, dots,
ArrowLeft/Right/Home/End, mouse/pen swipe > 40 px (touch stays native scroll), `inert` on hidden
slides, a live "Video n of N"; neighbours show beside the active slide, scaled (vertical/small
sizes); deck (`[data-deck]`) = plain column without JS, JS stacks cards (`--d` depth, peeking
above), prev/next arrows and keys cycle. Slide change pauses `<video>` and closes loaded players
(the facade is put back). `video.js` loads facades itself (capture phase, before `site.js`), so a new
player closes the others; a `<video>` play pauses other non-loop videos and closes players. Phones
(<= 37.49rem): carousel slides 100% (one at a time), grid one column. Motion only inside
`prefers-reduced-motion: no-preference`; reduced motion = instant scroll, no transitions, no loops.
Free layout markers stay on single/grid players only (`videos.N.embedUrl` too).
**Blank canvas** (new block `canvas`, `canvas.ts`): always `layout:'free'` (schema refuses it in
flow; `FREE_BLOCKS` has it; no SEO warning since it never converts; no "Return to optimized
layout"). Props: `height` quarter|half|threeQuarter|full|custom (25/50/75/100 vh), `heightUnit`
vh|px, `heightVh` 10-200, `heightPx` 80-3000, `minHeight` 0-1200 px, `fill`
none|color|gradient|image, `color`/`colorTo` (`#rrggbb`, rendered only as `--c1r/g/b` numbers),
`angle` 0-360, `image` (decorative `<img alt="">` behind), `dim` 0-90. Section is
`block-canvas canvas-vh|px [canvas-dark]` with the fill, then `.wrap.canvas-wrap` (`--ch`, `--cmin`,
`min-height:max(min px, ch svh)`, vh fallback) around the normal free board. Maths: artboard aspect =
content width / height on a reference screen (`CANVAS_REF` 1120 x 900), so there it fills the section;
elsewhere the section keeps its height and the board sits centred (same scaling as every free
layout). A height change (`resizeCanvas`, editor `state/canvas.ts setCanvasProps`) keeps items at the
same px from the top and never cuts off the lowest item. White text (`canvas-dark`) when the fill is
dark. `CANVAS_CSS` is appended to `css/free.css` only when the site has a canvas. Editor: canvas
settings above the free panel; new **"Add to the canvas"** in every free panel (Heading, Smaller
heading, Text, Button, Picture from the media library, Video link) via `addFreeItem` (one undo step,
selects the new item, grows the board for tall text). Empty boards get a dashed outline in the preview.
**Empty space**: `height` (int 8-480 px, wins over the old `size`; presets 24/48/96/160/240/320,
new default 96); descriptions in "Add a section" updated (Blank canvas listed after Contact).
Inspector: new field kinds `toggle`, `color`, `presets`, optional `when(props)` on any field, and
`image` without `altKey` (decorative). Preview inlines `video.css`/`video.js`, fills
`data-k-poster`. Tests (written first, seen failing): core `video.test.ts` (validation incl.
NaN/Infinity/strings/odd ids/embed code, 12 cap, byte-identical default, each shape's export, widths,
style classes and numbers, poster/loop/controls, asset usage, grid/carousel/deck markup, no-JS
state, js for two plain videos, reduced-motion CSS, player hosts), `canvas.test.ts` (height maths,
aspect, resize, validation, always free, export numbers, fill, dark text, free.css, spacer, v8
migration); editor `preview/video-script.test.ts` (jsdom: keys, arrows, dots, swipe/cancel/vertical,
smooth vs instant scroll, pause on slide change, deck cycling, one at a time, other host refused,
loops kept, on-screen play, reduced motion, no IO), `state/canvas.test.ts`,
`inspector/BlankCanvas.test.tsx`; e2e `video-canvas.spec.ts` (list descriptions, carousel in the
preview with keys/arrows/dots and neighbours, canvas 3/4 height, add items, drag with no warning,
export checks, then the exported site: mouse swipe, no iframe, no overflow at 1280 and 375, one
slide per view on phones). Changed on purpose: version pins 7 -> 8, migration key lists, spacer
`size` hidden in the inspector (`UNUSED_PROPS`), e2e version pins in `animations`, `header-links`,
`site-style` specs. Exported markers are `data-carousel` / `data-deck` (no `data-k-*` in exports).
Lighthouse 13.6 (`npm run lighthouse:video -w @klinth/editor`: portfolio + vertical carousel + deck +
square grid + canvas, mobile, all four categories, fails < 95): 100 / 100 / 100 / 100, LCP 1.1 s,
CLS 0, TBT 0. Totals: 966 unit (core 588, templates 46, editor 276, api 56), 46 e2e
(`--workers=1`; `animations.spec` failed once in the full run, then passed 5/5 alone: the known
lost-click timing flake). Lint, format, types and build pass. Committed locally, **not pushed, not
deployed**. Not done: right-to-left pages do not mirror the carousel keys; carousel/deck players
carry no free-layout markers (dragging them out of a carousel converts only the heading and text).

**Fix: footer position, header pop-up, "Back to top" (schema version 7).** `MIGRATIONS[6]`
changes nothing (all new fields optional; absent = the old footer, "Back to top" shown).
**Footer** (`blocks.ts`): `textAlign` / `linksAlign` / `topAlign` (`FOOTER_ALIGNS` left|center|
right), `offset` (finite, -20..20, % of the content width), `padding` (finite, 0..8 rem; default
2.25). `renderFooter` keeps the exact old markup when none is set; otherwise
`.wrap.foot.foot-set` with `style="--fpad;--fl;--fr"` (validated numbers, 3 decimals, clamped
again) around `.foot-in` (`.foot-col` + `al-*` classes per group once any alignment is set;
unset groups: text/links left, top right). The offset becomes a left or right margin of
`.foot-in`, so the footer never leaves the content width (no sideways scroll). `FOOTER_CSS` is
appended to `site.css` only when a footer uses these fields (template snapshots unchanged). The
footer is not eligible for free layout (6F excludes footer/spacer/code by design), so the
controls are in the footer section's settings: three choice groups and two sliders (new
`number` field kind in `inspector/fields.ts` / `Fields.tsx`, with Reset).
**Back to top**: `meta.backToTop` (false = off site-wide) and `page.hideBackToTop`;
`backToTopShown` (`nav.ts`); a footer with nothing left renders no `<footer>`. Site style >
Footer (`inspector/FooterPanel.tsx`, `state/footer.ts`): "Show “Back to top”" switch and "Hide
“Back to top” on this page". **"Close"**: the renderer has no Close control (no "Close" text in
any export, CSS or JS); the closest things are the phone header's "Menu" button (a `<details>`
toggle needed to reach the links on phones; kept, not hideable) and the editor-only "×" header
toolbar (never exported). Nothing added for it.
**Header pop-up** (`preview/bridge.ts`): a click only selects the header (`header` message, no
toolbar). Double-click (not on a link or the Menu button) shows the "×" toolbar; any other click,
Esc (focus returns to the header), an editor `select`, or the frame losing focus hides it.
Keyboard: the header gets `tabindex=0` in the preview; Enter/Space on it opens the toolbar and
focuses "Remove header". The "Show header" switch in Site style is unchanged.
Tests: core `footer.test.ts` (ranges, NaN/Infinity/strings refused, byte-identical default,
export markup and CSS, negative offset, defaults, back-to-top site/page/empty footer, migration
6 -> 7, round trip); editor `preview/header-bridge.test.ts` (single click, double-click, outside
click, Esc, editor select, blur, keyboard), `state/footer.test.ts`, ThemePanel footer switch;
e2e `footer.spec.ts` (controls, real offset/padding measured, no overflow, switch, ZIP) and
`header-links.spec.ts` now double-clicks. Changed on purpose: version pins 6 -> 7, migration
key lists, Site style section order (Footer after Header). Totals: 894 unit (core 545,
templates 46, editor 247, api 56), 44 e2e (`--workers=1`, all pass); lint, format, types and build pass. Committed locally, **not pushed, not deployed**.

**Fix: free-layout resize and sizing (schema version 6).** Symptoms (studio "Big intro"): corner
drag changed the box but not the text, the heading wrapped to 5-6 lines and overflowed / overlapped
/ was cut off, widening did not reflow (hard line breaks), the selection box did not match the
text, the "Keep a backup" banner made the preview jump, four identical tablet warnings.
Causes: text items had a fixed height (`--h`), the board had a fixed `aspect-ratio` with
absolutely placed items (could not grow), the free title used line-height 1.08 instead of the
source heading's (0.86 on the poster), measured widths were exactly the text width (rounding
wrapped them), the studio heading had `\n`s, the frame was drawn from the stored numbers, and
the banner sat in the preview's flex column. Now: **render** (`render-free.ts`): `.free-board`
is a one-cell grid; items share `grid-area:1/1`, placed with `margin-left:x%`,
`margin-top:calc(y/ar*1%)` (percent margins use the board width), `position:relative`; so the
board is at least its aspect ratio tall and grows with its lowest item in exports too. Text has
`height:auto`, titles `text-wrap:balance`, body `pretty`; typed line breaks render as spaces
(body keeps blank-line paragraphs). New optional text field `leading` (0.5-3, measured at
conversion from the computed line height, rendered as `--lh`). **Migration 5 -> 6**: newlines
in every `props.heading` and in free text become spaces (body paragraphs kept; only strings that
contain `\n`; odd shapes left for validation). Studio heading is one line now (snapshot updated;
the poster heading is one `.line` that wraps). **Editor**: corners scale text and buttons
proportionally, font size too (`scaleBox`, 1-20 cqw, a size below 1 may stay), text may grow
down (board grows), pictures/videos keep their ratio; side handles change only the width of text
(`widthBox`, min = the text's `min-content` width, measured with a hidden clone); text has no
n/s handles; Height field shows "Height (automatic)" (read-only). The bridge sends the measured
text height with resizes and `freeMeasure {id, items:[{item,h}]}` whenever a text's real height
differs from its stored `h` by > 0.05% (ResizeObserver on text items and boards, `fonts.ready`,
`loadingdone`, window resize; skipped while dragging/typing). The editor applies it with the new
`store.amend` (validated, **no undo step**) and `growBoard` (lower `aspect`, every `y`/`h` scaled,
nothing moves on screen; never shrinks by itself). The selection frame is now positioned in px
from the item's real rect (divided by the board's transform scale) and follows typing. Drags use
the board's nominal height (width / `--ar`). Conversion gives text 2% extra width (never past
the edge). **Banners**: `SafetyBanners` float over the top of the preview (`Editor.tsx` overlay,
`pointer-events` only on the cards), so the preview never resizes. **Panel**: one grouped line
"N items may be too small on tablets" (rounded to 0.1 px, threshold 12 px on a 706.56 px board)
with one Show button (`useFreeUi.showItems` -> `freeHint` -> dashed outline for 2.6 s), plus a
gentle "texts overlap other items" hint (`overlapWarnings`, > 0.5% each way). Picture-description
warnings stay one per picture. Tests: core `free-wrap.test.ts` (no `<br>`, paragraphs, CSS
growth/auto height/cqw only, leading kept and bounded, migration, import, odd shapes); editor
`state/free-resize.test.ts` (scale/width geometry, min width, growth keeps px, measured heights,
size clamp, grouped and overlap checks, `amend` adds no undo step, slack), new bridge cases
(corner sends `size`, side width only and min width, `freeMeasure`, `freeHint`),
`inspector/FreePanel.test.tsx`; e2e `free-resize.spec.ts` (corner keeps lines and scales font,
side reflows and widens back, min width, frame within 2 px after every action incl. typing,
section grows + overlap hint, banner on/off changes no item box, editor vs export at 1366/1024/768
normalised by board width within 0.4%, same line counts, grouped warning once). Changed on purpose:
version pins 5 -> 6, migration key lists, placed items' `position` is `relative` (was absolute),
a few exact widths in older tests (+2% text room), free-layout e2e compares the dropped corner,
not the centre. Totals: 867 unit (core 531, templates 46, editor 234, api 56), 43 e2e
(`--workers=1`, all pass); lint, format, types and build pass. Pushed and deployed (`npm run deploy:editor`, deployment
a7727cbb; `klinth.pages.dev` serves the new bundle).

**6F Part 2 (hidden free canvas: editor interaction).** Schema unchanged (v5); Part 1's
`free.ts` / `render-free.ts` untouched. No menu item: free layout appears only when the owner
**double-clicks** an element of a flow section in the preview (a second press within 500 ms and
10 px of the first) and then **drags it more than 8 px**. Plain clicks, a press-and-drag (text
selection), two slow clicks, small wobbles, resize handles and the section list never ask (all
tested). The double-click still starts typing in place as before (so a quick "click to select,
click to type" keeps working); it also arms move mode (dashed outline), and only a drag after it
asks. Preview markers: `render-blocks.ts` now adds `data-k-from="<prop path>"` (editable
preview only; exports byte-identical, the core test strips it like the other markers) to every
element `flowToFree` can take: head fields, status, buttons.N, image, facts.N.label/value,
button, images.N.image/caption, embedUrl (the `.video-frame`), video (uploaded file: lands in
`skipped`), items.N.{image,title,description,link,quote,name,role}, links items.N, email, phone.
Flow: the bridge measures every marked element relative to the section's `.wrap` content box
(paragraphs of one field = one box; stacking = page order) **before** anything moves, sends
`freeIntent {id, from, dx, dy, measure}`, and the element follows the pointer through the CSS
`translate` property (`--k-drag`; never `transform`, so reveal/animation transforms cannot fight
it). The editor shows the warning (`ui/FreeLayoutDialog.tsx` on `ui/ConfirmDialog.tsx`: portal
to `<body>`, `aria-modal`, labelled + described, focus starts on "No", Tab/Shift+Tab trapped, Esc =
No, focus returns): "Free positioning can hurt your SEO, accessibility and how the page looks on
phones. Continue?", "Yes, use free layout" / "No, keep the optimized layout", "Don't ask again for
this section" (localStorage `klinth.freeAsk`, `projectId:sectionId` -> yes|no, max 200; a
remembered No shows "Free positioning is off for this section. Ask me again" in the section
settings). **No**: `freeDecision false`, the element slides back, project, history and save
status untouched. **Yes**: `convertToFree` (editor `state/free.ts`) = Part 1 `flowToFree` with the
measurement, then the dragged item moves by the final drag (px -> % of the board), clamped; one
`change()` = one undo step; the dragged item is selected; notice with Undo (and how many parts
were skipped). While the button is still held the whole dialog is `pointer-events:none`, so the
drag goes on in the preview under it (the dialog can appear right under the pointer); the bridge
also reports `freeDrag` positions and the editor treats its own `pointerup` as the drop, and Yes
pressed while still holding waits for the drop (`state/free-intent.ts`).
Inside a free section (bridge, `preview/free-bridge.ts`, inserted into `BRIDGE_JS`): click selects
an item (frame with 8 handles, `freeSelect`), drag moves it with snapping to other items' edges and
centres, the board's edges and middle (6 px) and a 2.5% grid (only on an axis that moved; Alt =
off; pink guide lines, faint grid while dragging), handles resize (pictures and videos keep their
ratio, Shift locks any item), arrow keys nudge 0.5% (Shift 5%), everything clamped inside the
artboard, double-click or Enter edits text in place (Esc cancels, Enter saves titles, `freeText`),
Ctrl/Cmd+Z/Y inside the preview go to the editor (`history`), "Free layout" badge on the section
(and in the sections list). The geometry (`preview/free-geometry.ts`: `clampBox`, `moveBox`,
`snapBox`, `resizeBox`) is unit-tested and copied into the frame with `fn.toString()` (each
function is self-contained on purpose). Moves are applied in the frame at once and sent on
release as `freeChange`; the editor validates (Zod: finite, bounded numbers, id regex, path
regex), clamps again, saves, and **skips the redraw for that one change** (`live` ref in
`Preview.tsx`; never when another redraw is pending), so drags and nudges keep focus. Nudges
within 1 s are one undo step; every drag, resize and panel change is its own. Refused changes
redraw. Settings panel (`inspector/FreePanel.tsx`) replaces the block fields for a free section:
explanation, "See it on a phone", things to check (pictures without a description from
`freeWarnings`, text under 12 px on a 768 px tablet from `readableSizeWarnings`), items in
reading order, the selected item's text/size/align, picture description/fit, button text/link,
video title, position and size in %, Bring forward / Send back, and "Return to optimized layout"
(confirm dialog; `freeToFlow`; notice with Undo, says how many canvas-only items were dropped).
Decisions: the AI helper is hidden on free sections (it writes block props, which the canvas does
not show); a free section's Animation panel offers only "Whole section" (positions use left/top,
the section animation moves the whole `.wrap`, so they never conflict); the sections list title
uses the canvas title. Phones: the live phone preview shows the stacked reading order; editing a
custom phone arrangement is wired in the bridge (`--px...` vars, `phone: true`) but there is **no
UI to create phone boxes yet** (optional item 5, not done).
Checked: Lighthouse 13.6 on the portfolio export with the intro and about sections converted from
a real Chrome measurement (`npm run lighthouse:free -w @klinth/editor`, mobile and desktop):
Accessibility 100 / SEO 100 on both. Tests: core `free-marks.test.ts`; editor
`preview/free-geometry.test.ts`, `state/free.test.ts` (conversion keeps the drag, clamping, z-order,
text, readable size, return, undo/redo across conversion and every move),
`state/free-intent.test.ts` (asks first, No changes nothing, Yes keeps the drag, Yes while held,
release over the editor, don't ask again), `preview/free-bridge.test.ts` (fresh jsdom per test:
the threshold, never on clicks/selection/wobbles, No puts it back, select/move/resize without a
question, nudge and clamp, undo keys), `ui/FreeLayoutDialog.test.tsx` (focus, trap, Esc); e2e
`free-layout.spec.ts` (double-click, drag, warning, Esc = No, Yes, badge, width from the panel,
move, nudges to the edge, undo x4 back to flow and redo, export ZIP; don't ask again, inline text
edit, resize, z-order, phone stacking, return with confirm; reordering the list never asks).
`App.test.tsx` load budgets raised to 15 s (the lazy screens took 5 s+ only when all 28 files run
in parallel; 0.4 s alone). Totals: 838 unit (core 522, templates 46, editor 214, api 56), 37 e2e
(`--workers=1`, all pass). Pushed and deployed (see Remote below).

**6F Part 1 (hidden free canvas: data model, renderer, exporter): schema version 5.** No editor
UI yet. Concept: free placement is not a menu option; in Part 2 it appears only when the owner
tries to drag an element freely, after a warning. Flow (the block's own responsive layout) stays
the default. `MIGRATIONS[4]` changes nothing (older files are all flow); existing projects
import, render and export byte-identical (no `css/free.css`, no new markup).
Model (`packages/core/src/free.ts`): every section may carry `layout: 'flow'|'free'` (absent =
flow) and `canvas`, present exactly when free; only content blocks (not footer, spacer,
customCode); a free section may only animate as a whole (`animation.section`). Canvas (strict):
`aspect` (width/height, 0.05-20), optional `phoneAspect`, `items` (max `MAX_FREE_ITEMS` = 100),
optional `readingOrder` (ids read first; the rest top-then-left). Item: `id`, `x y w h` in % of
the artboard (start -2..102, size 0.25..104, and x+w / y+h <= 102: `FREE_TOLERANCE` = 2), `z`
(int 0-9999), optional `phone` box (`hidden?: true`), optional `from` (prop path like
`heading`, `buttons.0`, `items.2.image`; regex-limited, no `constructor`/`prototype`). Types:
`text` (`style` title|subtitle|body, `text` <= 4000, `size` in cqw 0.25-25, `align`), `image`
(asset id, `imageAlt`, `fit`), `video` (YouTube/Vimeo `embedUrl` via the existing schema,
`title`), `button` (`label`, `href` through the existing allow-list, `size`, `variant`). Unique
ids, reading-order ids must exist, `phoneAspect` requires a phone box on every item. New import
limit: `MAX_FREE_SECTIONS` = 20 free sections per page (5 MB, depth 16 unchanged; a canvas nests 9
deep). `freeWarnings(section)` lists pictures with no description (warn, not block).
Render/export (`render-free.ts`): a free section is `block block-<type> block-free` (keeps the
block's padding) with `.wrap > .free-board` (`aspect-ratio`, `container-type:inline-size`).
Items are real elements in DOM = reading order: first title = the section level (the page's one
h1, else h2), later titles h2, subtitles level+1, body = `<div><p>...`, `<img>` (lazy unless
first section), `<a class="button">` (unsafe/empty link = `<span>`), video = the existing
click-to-load facade. `style` holds only `--x/--y/--w/--h/--z/--fs` (+ `--px/--py/--pw/--ph`,
board `--ar/--par`) from validated numbers (3 decimals, no exponent). Text size is cqw, so the
board looks identical at every width >= 37.5rem. `<= 37.49rem`: `.free-stack` turns the board
into a column in reading order with normal site text sizes; with `phoneAspect`, `.free-phone`
uses the phone boxes instead. `css/free.css` is written and linked only for pages with a free
section; the editor preview inlines it like `anim.css`. `data-free="<id>"` on items in exports;
`data-k-item` only in the editable preview.
Conversions (pure, no DOM): `flowToFree(section, {width, height, elements:[{from, x, y, width,
height, fontSize?}]})` (px relative to the section's `.wrap`, stacking order = list order) places
each element at its measured spot (rounding < 0.02 px), pulls slight overflow back inside the
tolerance, lists unusable elements in `skipped`, keeps only a whole-section animation.
`freeToFlow(section)` ("return to optimized layout") drops layout, canvas and positions and
writes each item's content back to its `from` prop; items added on the canvas, or whose content
the block cannot hold (checked with the block schema), come back in `dropped`. Unedited flow ->
free -> flow returns the same section. Media: free pictures count in `assetUsage` /
`sectionAssetIds` (so export keeps their files); `removeAsset` drops free image items.
Checked in Chromium on an exported site: items at the exact stored % at 1440/1024/768, stacked in
reading order at 375, no horizontal overflow. Tests: core `free.test.ts` (33: bounds, 100-item
cap, malicious values, unsafe links/embeds, bind paths, conversions within 0.5 px, reverse
conversion, valid markup and heading levels, reading order, phone fallback, escaping, assets,
migration, round trips, key/token guard). Version-pinned tests (core and 3 e2e) updated to 5 on
purpose. Totals: 801 unit (core 519, templates 46, editor 180, api 56). Not deployed.
Part 2 (above) added the editor interaction; still open from this list: manual reading-order
editing and phone-box editing UI.

**Fix: live site blank for new visitors (2026-11-05).** Symptom: blank white page, empty
templates, stuck "add section", no touch, for everyone except the owner's own Chrome.
**Root cause: Cloudflare Pages deployment, not app code.** The `klinth` Pages project was
connected to GitHub (Git Provider: Yes). Every push to `main` since 37c23a3 made a Git build with
no build command and the repository root as output: those deployments (cbd46fa9, 0cb3161b,
45fb6c53, 2ff42ba5) serve `README.md`, `handoff.md`, `package.json` and answer **404 (empty
body) for `/`, `/preview.html`, `/terms.html` and every asset**. The newest one became production,
so `klinth.pages.dev` only worked where Cloudflare's edge or the browser still held files from the
last good direct upload (79dd6488): the owner's Chrome had `/`, the JS and the cached 308
`/preview.html` -> `/preview`; a fresh profile got a 404 blank page, or the old editor with a 404
preview frame. Evidence: `curl` of each deployment URL (good ones send our CSP and
`max-age=0, must-revalidate`; broken ones 404 everything), Playwright fresh contexts on the live
URL (Chromium and WebKit: `404 /preview.html`, empty preview, uncaught SecurityError).
Checked and ruled out: `_headers` (no CSP/COOP/COEP blocks on a fresh load; the only violation was
Zod's `new Function` probe, now off), SPA routing (no client routes; Pages serves `index.html`
for unknown paths), service worker (none ever), Cloudflare zone optimisations (`*.pages.dev` has
no Rocket Loader / Auto Minify), first-run data (empty IndexedDB, no settings, no tour flag all
fine), schema/Zod on fresh projects (fine), render loops (none; adds take < 1 s at 4x CPU).
**App bugs the broken deploy exposed, fixed:** (1) `Preview.tsx` `siteWindow()` read
`frame.contentWindow.frames[0]`, which **throws** SecurityError in Chrome/Safari when the shell
page failed to load (no inner frame); it ran inside a zustand subscriber, so selecting or adding a
section threw mid-click and the "Add a section" menu stayed open = "stuck". Now try/catch, plus a
notice "The preview could not load..." if the shell is not ready after 10 s. (2) **Touch on
iPad/iPhone:** Safari only turns a tap into a click when an element under the finger has its own
click listener; the bridge listened on `document` only, so taps in the preview did nothing. The
bridge now adds an empty click listener on `<body>` (verified in WebKit: pointerdown, touch,
mousedown, click). Section drag already used pointer events with `touch-none`. (3) IndexedDB
blocked (private window, storage off, broken profile): the template picker failed to open
anything. `lib/storage.ts` now falls back to an in-memory store (`storageInMemory()`,
`onStorageModeChange`; only when the database cannot be opened at all: `unavailable`/`unknown`;
quota, conflict, blocked, version still report as before) and the editor shows "Klinth cannot
save in this browser..." with "Download project file". (4) Safety net: the whole app is inside
`ErrorBoundary` (`main.tsx`), which now also has "Reset local data" (confirm step; deletes the
`klinth` IndexedDB and `klinth*` local/session storage keys via `resetLocalData()`).
Console on load is now empty: `lib/zod-config.ts` (`z.config({jitless:true})`, imported first)
and `<link rel="icon" href="data:,">`. `_headers` adds `Cache-Control: no-cache` for `/`,
`/index.html`, `/preview.html`, `/preview` (assets stay immutable). New root `wrangler.toml`
(`pages_build_output_dir = "apps/editor/dist"`): a Git build that did not build now fails instead
of replacing production with the repo root.
Tests: e2e `fresh-start.spec.ts` (fresh context each: all templates listed, each opens with real
preview content, add section twice without freezing, no console/page errors or 4xx, IndexedDB
blocked, localStorage blocked, preview page 404, touch taps). Runs in Chromium and WebKit locally;
CI also installs Firefox (`E2E_BROWSERS`, CI default `firefox,webkit` for this spec). Firefox
cannot launch on this laptop (exe permission denied), so it is unverified locally. Tracing is off
in this spec: Playwright's trace snapshotter logs "Blocked script execution" from the
script-free thumbnails. Unit: `storage.fallback.test.ts`, ErrorBoundary test, `_headers` cache
test; two storage tests changed on purpose (blocked storage now means memory, not an error).
**Owner, in the Cloudflare dashboard (Workers & Pages > klinth > Settings > Build):** Build command
`npm run build:deploy -w @klinth/editor`, Build output directory `apps/editor/dist`, Root
directory empty, env var `NODE_VERSION` = `24` (Production and Preview). Or turn off automatic Git
deployments and keep using `npm run deploy:editor`. Then delete the broken deployments listed
above (they publish the repo files, e.g. `<id>.klinth.pages.dev/handoff.md`; nothing secret in
them). No zone settings apply to `*.pages.dev`; if a custom domain is added later, keep Rocket
Loader and Auto Minify off for it.

**6E (animations): schema version 4.** `MIGRATIONS[3]` changes nothing (older files have no
animations; the bump stops older editors from dropping them). New optional `section.animation`
(`packages/core/src/animation.ts`): strict object of parts `section heading media buttons cards
video`, each `{preset, speed?: slow|normal|fast, delay?: whole ms 0-2000, repeat?: once|always}`.
Presets: fade, slideUp, zoom, blurIn; words, letters, typewriter (heading); maskWipe; parallax
(hero/about/textImage pictures only); marquee (gallery pictures or heading); lift, tilt, glow
(hover: pictures, buttons, cards). `animationTargets(type)` / `animationPresets(type, part)` decide
what fits; the page schema refuses a part the block lacks or a preset that does not fit, and more
than `MAX_ANIMATED_SECTIONS` = 40 animated sections per page (new import limit; 5 MB and depth 16
unchanged, animations nest 7 deep). Video: only the thumbnail (`.video-facade`) moves, never on
hover; click-to-play unchanged; the player frame is never animated.
Export: pages with an animation link `css/anim.css` (right after `site.css`) and
`js/anim.js` (defer); projects without animations are byte-identical (no files, no tags). The
`<section>` gets `k-anim`, `data-anim-<part>="<preset>"`, `data-k-enter` (parts that play on
scroll), `data-k-again` (every time) and `style` vars (`--k-<part>-dur/-delay/-step`, all from
fixed tables or clamped integers). The first section also gets `k-in-<part>`, so it plays on load
with CSS only. `anim.js` hides later sections' parts (`k-wait-<part>`) and swaps to `k-in-<part>`
via IntersectionObserver; does nothing with reduced motion or without IO. Text split happens at
export (`splitText`/`splitLines`): heading gets `data-k-split aria-label="full text"`, each word
piece is `aria-hidden`, words stay in the HTML; letters use `Intl.Segmenter` (emoji stay whole).
Word reveal reuses the poster headline's `line-up` keyframes and mask idea; poster headings split
inside each `.line`. The site's own scroll reveal steps aside where a chosen animation moves the
same thing. All motion is inside `prefers-reduced-motion: no-preference`; only transform and
opacity move, except blur-in (also `filter`), which is a plain fade at <= 37.5em. Parallax is off
at <= 37.5em. Marquee: static row (scrollable without JS, scrollbar hidden), JS adds aria-hidden
copies, a Pause/Play button (absolute, no layout shift), pauses on hover/focus.
Editor: section settings end with an "Animation" panel (`inspector/AnimationPanel.tsx`): "What
moves", preset cards with a small live sample (`.anim-demo` in `index.css`), Speed, "Wait before it
starts" (0-2 s), "Play it" Once / Every time, "Preview animations". Pure edit
`state/animation.ts` (`setSectionAnimation`, plain labels). Store `animationReplay` /
`replayAnimations()`: the next preview redraw is not calm, so animations play (also after every
pick). Calm redraws stop them (`CALM_CSS`). The bridge flattens a split heading (and drops marquee
copies) before in-place editing so the text is saved once.
Checked: Lighthouse 13 mobile with an animation on every section: landing 98/100/100/100,
portfolio 98/100/100/100, studio 100/100/100/100, CLS 0.000 on all; with JS off and on at
320/375/1280 nothing stays hidden and no horizontal overflow; marquee page: same height with JS
on/off, copies aria-hidden, moves, Pause works, no overflow (a wrapper `min-width:0` fix was
needed). Tests: core `animation.test.ts` (schema enums/ranges, fit per block, cap, migration,
splitting, export files/markup, video, reduced-motion CSS), editor `state/animation.test.ts`,
`inspector/AnimationPanel.test.tsx`, `preview/anim-script.test.ts` (jsdom: reduced motion, no IO,
wait/in/again), e2e `animations.spec.ts` (3 animations, in-place edit of a split heading, replay,
export; reduced-motion context). Version-pinned tests updated to 4 on purpose. Totals: 758 unit
(core 486, templates 46, editor 170, api 56), 25 e2e (`--workers=1`). Not deployed.

**6D (header links, removable header): schema version 3.** `MIGRATIONS[2]` sets
`meta.headerEnabled: true` on old projects (absent also means on; `false` = no header). New:
`page.hideHeader` (optional, per page), `section.anchor` (optional, `^[a-z][a-z0-9-]*$`, max 60,
not `top main content header footer nav menu skip`; per page every rendered id, anchor or else the
section id, is unique ignoring case) and `meta.navLinks` (optional, max `MAX_NAV_LINKS` = 20; each
`{label<=40, target: {kind:'page', page:slug} | {kind:'section', page:slug, section:id}}`, closed
union, no free-form href at all). Core `nav.ts`: `uniqueAnchor`, `ensureAnchor` (stores an anchor
from the section title the first time a link targets it, rewrites `#oldId` / `page.html#oldId`
links incl. the header CTA), `navLinkHref`, `navLinkProblems` / `removeBrokenNavLinks` (links to a
deleted page or section stay in the project, are flagged in the panel with a "Remove" button and are
left out of the export), `automaticNavLinks`, `headerShown`. `renamePage` updates link targets.
Without `navLinks` the header shows the old automatic links. Export: header shown on all pages =
same files as before (HTML and CSS byte-identical, snapshots: only `site.js` changed); shown on no
page = no `<header>`, `site.css` is `SITE_CSS_BASE` (no header rules, no `scroll-padding-top`),
`site.js` is `SITE_JS_BASE` (no menu/overlay/offset code), no header files; shown on some pages =
those pages also link `css/header.css` (`HEADER_CSS` + header vars) and `js/header.js` (`HEADER_JS`).
`site.js` now handles same-page `#` links: smooth (instant for reduced motion), offset =
`scroll-padding-top` (set by `header.js` to the real sticky header height, 0 when not sticky or no
header), `history.pushState` hash, focus moves to the section. Import limits: 20 links per header
(file size 5 MB and depth 16 unchanged; nav links nest 5 deep). Editor: Site style > Header starts
with a "Show header" switch (off: settings hidden, "Add header back" button, multi-page note
"Without a header, visitors can't move between your pages unless you add links."), "Hide header on
this page", and "Header links" (`inspector/NavLinksPanel.tsx`: "Choose links myself" turns the
automatic links into a list; label, target dropdown grouped by page, move, remove, "Add a link
to"). Preview: header has `data-k-header`; a click selects it (selection value `#header`, never a
valid section id) and shows a floating toolbar with "×" (`Remove header`, built with DOM calls in
the bridge); header links never navigate: `#x` scrolls the preview, another page sends `navigate`
(slug and anchor checked by Zod) and the editor switches page and scrolls there. Removing is one undo
step with notice "Header removed." + Undo (plus the multi-page note). Deleting a linked section or
page says its header link is hidden. Duplicated sections drop the anchor. Pure edits in
`state/header.ts`, actions in `state/useHeaderActions.ts`. Tests: core `nav.test.ts`, editor
`state/header.test.ts`, ThemePanel "show or remove the header", e2e `header-links.spec.ts` (picks
links, tries them in the preview, serves the exported ZIP through `page.route` and clicks every
header link, removes the header from the toolbar, Undo, removes again, exports: no header markup,
CSS or JS). Totals: 725 unit (core 467, templates 46, editor 156, api 56), 23 e2e
(`--workers=1`). Not deployed (`npm run deploy:editor`).

**6C (no page scrollbar in the editor):** cause was the visually hidden radio inputs (`sr-only`,
`position:absolute`) in the Site style panel: no positioned ancestor inside the scrolling panel, so
they were placed against the page and stretched the document (1226 px at 768 high) although the
panel clipped them. Fix: the three scroll areas (`Inspector` panel, `SectionsPanel` list,
`PagesPanel` list) are `relative`; the shell is `.editor-shell` (`height:100vh; height:100dvh`,
`overflow-hidden`) in `index.css`; `html, body, #root` get `overflow:hidden`; the start screen's
`<main>` is now `h-full` (it scrolls inside itself, as before visually). Exported sites unchanged
(no core change). Checked by DOM measurement: 1366x600/650/700/768, 1280x600, 1024x768, 125% and
150% zoom (as 1093x614, 911x512, 1280x720 CSS px) and tablets 1024x1366 / 768x1024: no page
scroll, top bar and "Add a section" in view, right panel and section list reach their last item,
preview scrolls its own page. Known, unchanged: below about 900 px wide the fixed side panels leave
the preview a narrow column (144 px at 768) showing the page scaled to fit. Test:
`e2e/layout.spec.ts` (1366x768, 1280x600, 1024x768). Totals: 685 unit, 22 e2e (`--workers=1`).

**6B (header polish):** optional `meta.header` (`packages/core/src/header.ts`, still schema v2; without
it the header HTML is byte-identical to before). Fields: `layout` full|floating (pill always floats),
`background` solid|transparent|glass, `color` background|surface|accent|text|custom + `customColor`
(`#rrggbb` only, written to `site.css` via `headerToCss`), `sticky`, `cta {label<=40, href}` (href
through `safeUrl`, page links must exist, follows page rename/delete), `logo {image, imageAlt}`
(must be an image asset; counts in `assetUsage`; `removeAsset` falls back to text). Rendering adds
`hdr hdr-<layout> hdr-<background> hdr-sticky|static` (+ `hdr-on-<first section bg>` and `is-top` for
transparent). Transparent overlays the first section (negative margin + matching transparent
border-top on the first block) and takes that section's colors; when sticky, `site.js` drops
`is-top` on scroll so it turns solid. Without JS a transparent sticky header stays see-through.
Glass = 80% color + blur, solid fallback via `@supports not`. Transitions only inside
`prefers-reduced-motion: no-preference`. Text color is picked for readability (custom: best of
text/background/accentText); `headerContrastIssues` warns in the panel (glass checks worst case
content behind; glass + accent usually warns, Lighthouse agreed: 4.2-4.5:1). CTA uses accent, or the
header's own pair inverted when accent would blend in. Phones: with a CTA the links go into the Menu
and the CTA sits at the bottom of the menu panel; with no links the CTA stays in the bar.
Editor: `inspector/HeaderPanel.tsx`; Site style sections are now collapsible `<details>` (Header and
Details open by default, open state remembered per device in localStorage `klinth.siteStyle.open`).
Checked: Lighthouse 13 mobile 100/100/100/100 on all 3 templates, default and with a floating
transparent header + CTA; 72 style x layout x background x template exports at 320/375/768/1440:
no overflow, nothing past the edge, first heading not under the header, menu panel on screen.
Tests: core `header.test.ts` (schema, unsafe CTA links, contrast, export per background), editor
ThemePanel header tests, e2e `header.spec.ts`. Existing e2e updated to open folded sections; App and
editor e2e waits made robust (cold lazy load, preview frame replaced on redraw). Totals: 685 unit
(core 443, templates 46, editor 140, api 56), 19 e2e (`--workers=1`). Not pushed, not deployed.

**Mini-phase 6A (blank start, multi-page, styles, site-wide code):**
Part 1 (blank start and multi-page) was already complete from Phase 5.5; re-checked against the 6A
brief: "Start blank" card, Pages panel (add, rename, reorder, delete, cap 50, home always
`index.html`, last page kept), safe unique slugs (reserved names, device names, case-insensitive),
links follow renames, optional shared page menu, and ZIP / GitHub / project file with the same
limits. Tests already cover slug safety and collisions, the 50-page cap, deleting the last page,
renames keeping links, and multi-page export where every referenced file exists. No code change.

Part 2 (header styles, theme presets): **schema version 2** (`MIGRATIONS[1]` sets
`meta.headerStyle: 'bar'` on old projects). `meta.headerStyle` = `bar | pill | centered | minimal`
(optional, renders as `header-<style>` on the same `<header>`/`<nav>`/`<details>` markup, so
keyboard and screen reader use is unchanged; menu panel is absolute, so no layout jump; pill keeps a
fixed bar height; centered and minimal are not sticky). `theme.preset` is an optional closed enum
(informational: last preset applied; the editor drops it on a manual color/font edit). Presets in
`packages/core/src/presets.ts` (`THEME_PRESETS`, `applyPreset`): 8 looks (gallery, midnight, meadow,
terracotta, newsprint, harbor, velvet, sunbeam), colors + system font stacks only (no font files in
the export), roundness and spacing kept. Editor: "Ready-made looks" grid (`aria-pressed`) and a
"Header style" radio group at the top of Site style (`inspector/ThemePanel.tsx`). Tests: new
`core/src/styles.test.ts` (styles, presets, contrast, migration, round trip),
`editor/src/inspector/ThemePanel.test.tsx`, and every template x style x preset in templates tests.

Part 3 (third template, /frontend; owner picked: bold typographic, headline line reveal, bone +
ink + cobalt): `packages/templates/src/studio.ts`, "Creative studio" ("Field & Form", a two-person
Lisbon studio; placeholder copy, no reviews or invented numbers). Theme `#f2f0eb/#e4e1d9/#0c0c0d/
#57544c/#1f3fe0`, system `grotesk` + `system-sans` (no font files), radius 0, spacing 10, minimal
header. New hero layout **`poster`** (core `blocks.ts` enum, `render-blocks.ts` `posterHero`,
editor option "Poster"): each heading line in a `.line` mask (spaces between keep words apart for
screen readers), accent rule, lede + actions row. Motion: lines rise with a stagger (transform only)
and the rule draws in, both inside `prefers-reduced-motion: no-preference`. Start screen grid is now
2 columns (3 templates + blank). Checked: Lighthouse 13 mobile on all 3 exports = 100 / 100 / 100 /
100 (LCP 1.0-1.5 s, CLS <= 0.001); no horizontal overflow at 320/375/768/1440 for every template x
header style (DOM measurements); pill header tightened on phones (68 px from 375 px; at 320 px the
links wrap, same as the top bar). axe e2e now includes the studio template.
**e2e note:** the full suite with default workers had 4 timing failures on this laptop (lost clicks
under load); all pass with `npx playwright test --workers=1`.

Part 4 (site-wide custom code): optional `project.siteCode {css?, js?}` (strict; each at most
200,000 UTF-8 bytes via `utf8Length`, `MAX_SITE_CODE_BYTES`; still schema version 2, no file had
it before). Export writes `css/custom.css` (linked right after `css/site.css`) and `js/custom.js`
(`<script>` at the end of `<body>`) on every page, only when non-blank; never inline; README
mentions them. Preview (`preview/document.ts`): interactive frame only, CSS inline with every `<`
turned into the CSS escape `\3c `, JS carried as a JSON string and run as a script element (so
`</style>` / `</script>` cannot break out); thumbnails get none. It runs in the shell's inner
frame (`sandbox="allow-scripts"`, no same-origin; tested from source and in e2e: `window.top.document`
is blocked). Editor: "Custom code for every page" at the bottom of Site style
(`inspector/SiteCodePanel.tsx`) with the trust notice, byte counter, refusal over 200 KB.
Key/token guard (`project-file.ts`) now also refuses Stripe `sk_live_`/`rk_live_`, Anthropic,
OpenAI, AWS `AKIA`/`ASIA`, Slack `xox?-` and PEM private keys (blocks save, project file and
import). Import limit unchanged (5 MB fits 2 x 200 KB; tested). Tests: core `site-code.test.ts`,
editor `preview/site-code.test.ts`, ThemePanel tests, and the 6A Playwright test
`e2e/site-style.spec.ts` (blank -> section -> second page -> pill header -> Midnight -> site-wide
CSS/JS -> export: code files exist and are linked from both pages, `.klinth/project.json` v2).
Totals: 635 unit (core 399, templates 46, editor 134, api 56), 18 e2e (all pass with
`--workers=1`). Nothing pushed; the deployed editor is not updated (run `npm run deploy:editor`).

**Phase 8 (deploy):** Live, free plan. Editor: **https://klinth.pages.dev** (classic Cloudflare Pages
project `klinth`, prod branch `main`). Worker: **https://klinth-api.klinth-api.workers.dev**
(`klinth-api`; account workers.dev subdomain `klinth-api`, auto-picked by Wrangler). KV `SKILL` id
`a35fe0087d1d4de39f4550479ef5fa33`, key `design-skill` = the Phase 5 skill (owner may replace:
`npm run skill:remote -w @klinth/api`). Vars: `ALLOWED_ORIGINS=https://klinth.pages.dev`,
`GITHUB_CLIENT_ID=Ov23liHbdVjZ2EXOgKJ0` (OAuth app "Klinth", callback
`https://klinth.pages.dev/github-callback.html`, expiring user tokens on; refresh token is dropped by
the Worker's Zod parse). Secret `GITHUB_CLIENT_SECRET` set (only secret). Local dev origin now comes
from `workers/api/.dev.vars` (copy the example). Live build: `vite build --mode deploy` reads
`apps/editor/.env.deploy` (public Worker URL, committed); e2e keeps default mode (localhost mocks).
Deploy: `npm run deploy:api`, `npm run deploy:editor`. Smoke tests passed live: health 200, CORS only
for the Pages origin (other origin 403), fake Gemini key → plain 401 "bad_key", fake OAuth code →
GitHub checks real id+secret and refuses only the code, editor + preview load with no console/CSP
errors, all security headers present. **Owner verified in production:** ZIP download and Publish to
GitHub (new repo + Pages) both work. Fix found only live: Pages 308-redirects `/x.html` → `/x`, so
`/preview` got the editor CSP (`frame-ancestors 'none'`) and the preview was blocked; `_headers` now
covers `/preview.html` and `/preview` (test added). Secrets scan of all git history: only fake test
values. `npm audit --omit=dev`: 0; 12 moderate in eslint's minimatch (dev only).

**Phase 7 (hardening):** Report in `security-report.md` (0 open high/critical). Editor CSP and
headers from `apps/editor/src/security/headers.ts` → `dist/_headers` on build and sent by
`vite preview`; Playwright now runs on the production build (port 4173) under that policy.
Preview redesign forced by CSP: `srcdoc` inherits the parent's CSP, so the preview frame loads
`public/preview.html` once (own looser CSP, `frame-ancestors 'self'`) and the editor posts each
redraw; the shell shows it in a fresh inner `srcdoc` frame (title "Your site"), so redraws need
no network (works offline). Bridge talks to `window.top`; editor accepts `host` only from the
shell, the rest only from the inner frame. Worker bodies read with a streaming cap
(`readCappedText`). Bundle: Editor and StartScreen lazy (`React.lazy`), editor prefetched from the
start screen; first visit ~180 kB gzip JS (was 212), main 126 kB (react-dom + zod + core + fflate).
Error boundary also around the start screen, plain "could not finish loading" for chunk errors,
logs only error name/message. Data loss: `lib/safety.ts` (`navigator.storage.persist()`,
backup timestamp per project set by project-file/ZIP download and GitHub publish, reminder after
15 edits with no backup or one older than 7 days, 28 when storage is kept), "You are offline"
banner, `beforeunload` also on a failed save (`ui/SafetyBanners.tsx`). Legal: `public/terms.html`,
`privacy.html`, `legal.css`, linked from the start screen footer and the AI helper window
(drafts, lawyer review needed). Accessibility: axe (`@axe-core/playwright`) on start screen, both
templates in the editor and legal pages: 0 serious/critical (WCAG 2.1 AA tags). Tests: 566 unit
(core 360, templates 27, editor 123, api 56) and 16 e2e (new `security`, `a11y`, `offline`).

**Phase 6 (GitHub, export polish):** Export menu has "Publish to GitHub". Dialog: repo name
(suggested from the title, remembered per project in localStorage, name only), New / "One I
published before", "Turn on GitHub Pages" (on by default, off for private), "Make private".
Scope is `public_repo`, or `repo` only when Pages or private is chosen (Pages API needs `repo`).
Sign-in: OAuth + PKCE S256 + random state in a popup opened inside the click; callback page
`public/github-callback.html` (+ `.js`, no inline script) sends `{code,state}` over a same-origin
`BroadcastChannel('klinth-github')` (works even if GitHub's COOP cuts `window.opener`). Worker
`GET /github/config` (public client id or null) and `POST /github/oauth` (Origin check, burst guard,
Zod, redirect must be `<allowed origin>/github-callback.html`, fixed upstream, 15 s timeout, logs
`{route,outcome}` only). Token: zustand memory only; gone on reload; "Disconnect" button.
Push (`github/api.ts`): create repo with `auto_init` (Git Data API can't write to an empty repo) or
update one that already has `.klinth/project.json` (refuses other repos); local Git blob SHA-1 per
file; unchanged files reuse the existing sha, text goes inline in the tree, binaries/empty files
via `/git/blobs` one at a time (returned sha must match); tree without `base_tree` (stale files
removed); commit; ref PATCH `force:false`; then reads the tree back and requires every path+sha to
equal the local set (proves push == ZIP); Pages POST (409 = already on). Plain errors: signed out
(401, clears session), name taken (offers "Update that repository instead"), not found, not Klinth,
slow down (403 rate limit / 429 / retry-after), offline, mismatch, Stop (AbortSignal, branch only
moves at the end). ZIP polish: unused uploads are left out of the files _and_ the exported
project.json (`exportedProject`); README adds "Change your site later" and a folder guide.
Re-import: "Open a project file or site ZIP" (ZIP detected by `PK` bytes, not name). `readSiteZip`
reads only `.klinth/project.json` + `assets/*` (also inside one top folder, e.g. GitHub's
"Download ZIP"), size caps checked before unpacking, media saved before the project; a project
file alone shows "n pictures or videos were not included. Upload again…". Tests: 550 unit (core
360, templates 27, editor 109, api 54) and 9 e2e (new `e2e/github.spec.ts`: popup sign-in → push →
Pages → pushed files == ZIP bytes → token absent from localStorage/sessionStorage/IndexedDB and the
project → gone after reload; ZIP re-import round-trip is byte-identical).
**Not yet done:** a live push to real GitHub (needs the owner's OAuth app, see section 6).

**Phase 5.5 (blank start, pages):** "Start blank" card next to the two templates (`blankProject()`
in core: one empty home page, default theme). New "Pages" panel above Sections: switch, add (asks
for a name), rename, move up/down, delete (with Undo notice), "n of 50", and a "Show a menu of all
pages at the top" checkbox (`meta.pageMenu`, optional, off = header lists named sections only).
Core `pages.ts`: `slugify` (NFKD, ASCII, max 60, fallback `page`), `uniqueSlug` (case-insensitive,
skips reserved `index assets css js fonts readme` and Windows device names, `-2`, `-3`...),
`addPage` (cap `MAX_PAGES` = 50), `renamePage` (address follows the name; every `href` to the old
page is rewritten, anchors kept; home stays `index.html`), `deletePage` (never the home page or the
last page; links to it become empty, so they render as text), `movePage` (home always first).
Schema: max 50 pages, home must be first, and any page link (`about.html`, `index.html#x`) must
point to an existing page. `safeUrl` now allows page links (still no paths, `..` or other files).
Link fields suggest page files. Export/ZIP/project file need no change: same 5 MB file limit, safe
path check and case-insensitive duplicate check; a 50-page ZIP round-trip is tested. Tests: 498 unit
(core 351, templates 27, editor 77, api 43) and 7 e2e (new `e2e/pages.spec.ts`). Phase 1 tests
updated on purpose: `page.html` is now an allowed link, page limit test uses 51.

Phase 5 done. Key vault (PBKDF2-SHA-256 600k → AES-GCM, only ciphertext/salt/IV in localStorage,
key in memory only, optional 30 min auto-lock, Forget, Test my key, honest note). "Remember" can be
unticked to keep the key for the tab only. AI helper: sparkle button on every section row and
"Ask AI" in the inspector open an inline panel ("What do you want?", idea chips, Stop, Undo
notice). AI-written custom code needs "I have read this code and I trust it". Quota banner over
the preview. "AI helper" window in the top bar. Worker `/ai/generate` and `/ai/test` with Origin
check, 64 KB cap, Zod, burst guard + Durable Object bucket (30/h per IP, `Retry-After`),
extraction refusal, skill from KV, Gemini Interactions API, Zod on output, skill-echo guard, file-id
filter. `npm run check` and `npm run build` green: 453 unit tests (core 308, templates 27, editor
75, api 43). `npm run e2e`: 6 Playwright tests green (new `e2e/ai.spec.ts`, Worker mocked). Also
checked by hand: editor in the browser → local `wrangler dev` Worker (real DO, rate limit binding,
local KV) → live Gemini with a made-up key → plain "key not accepted" message; logs show only
`{route, outcome}`.

**Design pass (after owner feedback, /frontend):** bundled open-license fonts (OFL, latin subset,
self-hosted, no font host): portfolio Fraunces + Instrument Sans, business Bricolage Grotesque +
Figtree, editor UI Fraunces + Instrument Sans. Exports add `fonts/*.woff2` (~60-70 KB per site),
`fonts/LICENSE.txt` and a heading-font preload. The preview gets fonts as cached `data:` URLs (no
flash on reload, works in the script-free thumbnails). Template header blur removed; scroll reveal
is now a mask reveal for media plus a short fade for text. AI panel is an "ink" surface
(`.surface-ink` swaps tokens) with a designed writing state, a result state listing what changed
("Changed: Heading.") and inline Undo; how-it-works steps in the AI helper window. Measured: AI
panel text contrast at least 8.4:1, fields 14:1. Tests now 460 unit (core 313, templates 27,
editor 77, api 43) and 6 e2e (ZIP holds real WOFF2 files; preview frame has Fraunces loaded).

**Skill:** rewritten to the /frontend standard (about 1,030 words, ~1,400 tokens) at
`workers/api/skill/skill.md` (git-ignored): request reading, voice, lengths, truth rules, a playbook
per block, rhythm, custom code rules. Examples are kept under 8 words so the echo guard never blocks
them. **Owner should review it.** Local KV: `npm run skill:local -w @klinth/api`.

**Remote:** `origin` = `github.com/ig-suyas/klinth`. `main` is pushed (through 6F Part 2,
62f962a). Editor deployed 2026-11-05 with `npm run deploy:editor` (deployment 0f91ead0, production
`klinth.pages.dev`; smoke-checked: 200, preview keeps its own policy, new code served).

## 2. Goal

All phases done; only the push to `github.com/ig-suyas/klinth` (public) waits for the owner. Overall: free, no-login site builder exporting plain HTML
repos at ₹0.

## 3. Files

- `packages/core/src/animation.ts` : new `TRANSITION_PRESETS`, `BACKGROUND_PRESETS`, `background`
  part; tests in `animation-presets.test.ts`; editor `inspector/AnimationPresets.test.tsx`,
  `e2e/animation-presets.spec.ts`, `scripts/lighthouse-anim.ts`

- `packages/core/src/extras.ts` (+ `extras.test.ts`) : `EXTRAS_CSS`, `EXTRAS_JS`, shapes, folding,
  page detection, `highlightPhrases`, `rotatorPhrase`; renderers in `render-blocks.ts`
- `packages/templates/src/blocks.ts` : new block definitions and `sectionPresets`
- `apps/editor/src/preview/extras-script.test.ts`, `state/extras.test.ts`, `e2e/extras.spec.ts`,
  `scripts/lighthouse-extras.ts`

- `packages/core/src/video.ts` (+ `video.test.ts`) : video widths, `videoStyled`, `pageVideoCss/Js`,
  `VIDEO_CSS`, `VIDEO_JS`; styled markup in `render-blocks.ts` (`styledVideo`)
- `packages/core/src/canvas.ts` (+ `canvas.test.ts`) : blank canvas height maths, `resizeCanvas`,
  fill rendering, `CANVAS_CSS`
- `apps/editor/src/state/canvas.ts` (+ test) : `setCanvasProps`, `newFreeItem`, `addFreeItem`
- `apps/editor/src/inspector/BlankCanvas.test.tsx`, `preview/video-script.test.ts`
- `apps/editor/e2e/video-canvas.spec.ts`, `scripts/lighthouse-video.ts`

- `packages/core/src/footer.test.ts` : footer position, back to top, migration 6 -> 7; footer
  rendering in `render-blocks.ts` (`renderFooter`, `footerPositioned`), `FOOTER_CSS` in `site-assets.ts`
- `apps/editor/src/inspector/FooterPanel.tsx`, `state/footer.ts` : Site style > Footer switches
- `apps/editor/src/preview/header-bridge.test.ts` : header toolbar on double-click only
- `apps/editor/e2e/footer.spec.ts` : footer controls and export

- `apps/editor/src/preview/free-bridge.ts` : free layout gestures inside the preview frame;
  `free-geometry.ts` : box maths (also copied into the frame); `free-messages.ts` : editor side
- `apps/editor/src/state/free.ts` : `convertToFree`, `setItemBox`, `nudgeItem`, `restackItem`,
  `updateFreeItem`, `returnToFlow`, warnings; `state/free-intent.ts` : warning flow, choices
- `apps/editor/src/ui/FreeLayoutDialog.tsx`, `ui/ConfirmDialog.tsx`, `inspector/FreePanel.tsx`
- `apps/editor/scripts/lighthouse-free.ts` : Lighthouse on an export with free sections
- `apps/editor/e2e/free-layout.spec.ts` : the whole flow in Chrome; `e2e/free-resize.spec.ts` : resize,
  frame, growth, banner, export parity
- `packages/core/src/free-wrap.test.ts` : natural wrapping, growth CSS, `leading`, migration 5 -> 6
- `packages/core/src/free.ts` (+ `free.test.ts`) : free canvas schema, reading order, warnings,
  `flowToFree` / `freeToFlow`; `render-free.ts` : `FREE_CSS`, `renderFreeBoard`, `pageHasFree`

- `wrangler.toml` (root) : Pages output dir for Git builds; `e2e/fresh-start.spec.ts` : first visit
- `apps/editor/src/lib/storage.ts` : in-memory fallback, `resetLocalData`; `lib/zod-config.ts`

- `packages/core/src/animation.ts` (+ test) : animation schema, split text, `ANIM_CSS`, `ANIM_JS`
- `apps/editor/src/inspector/AnimationPanel.tsx`, `state/animation.ts` : animation picker; `e2e/animations.spec.ts`
- `packages/core/src/nav.ts` (+ `nav.test.ts`) : header links, section anchors, `headerShown`
- `packages/core/src/site-assets.ts` : `SITE_CSS_BASE`/`HEADER_CSS`, `SITE_JS_BASE`/`HEADER_JS`
- `apps/editor/src/state/header.ts` (+ test), `state/useHeaderActions.ts` : header edits, remove/add
- `apps/editor/src/inspector/NavLinksPanel.tsx` : header link picker; `e2e/header-links.spec.ts`

- `workers/api/src/github.ts` (+ test) : `/github/config`, `/github/oauth` code→token exchange
- `workers/api/.dev.vars.example` : local GitHub app id/secret names
- `apps/editor/src/github/oauth.ts` (+ test) : PKCE, popup, BroadcastChannel, memory-only session
- `apps/editor/src/github/api.ts` (+ test with a fake GitHub keeping real blob ids) : push, Pages
- `apps/editor/src/github/GitHubDialog.tsx` : publish dialog (form, progress, done)
- `apps/editor/public/github-callback.html`, `.js` : OAuth callback page
- `apps/editor/src/lib/files.ts` : `exportFiles` (one list for ZIP and push), `importAnyFile`
- `packages/core/src/site-zip.ts` (+ test) : `readSiteZip`; `export.ts` : `exportedProject`,
  `siteFileBytes`, README text
- `apps/editor/e2e/github.spec.ts` : push and ZIP re-import end to end
- `packages/core/src/ai.ts` : shared AI contract (request/response/error schemas, limits, header)
- `packages/core/src/media.ts` : `keepAssetRefs` (drops file ids the AI invented)
- `workers/api/src/ai.ts` : `/ai/generate`, `/ai/test` handlers, rate-limit wiring, outcome logs
- `workers/api/src/gemini.ts` : Interactions API call, retries, error mapping, Zod→Gemini schema
- `workers/api/src/prompt.ts` : public fixed rules + private skill + section input
- `workers/api/src/guard.ts` : extraction refusal, 8-word skill-echo guard
- `workers/api/src/rate-limit.ts` : pure token bucket + `RateLimiter` Durable Object
- `workers/api/src/http.ts` : CORS, JSON helpers, plain messages and statuses per error code
- `workers/api/wrangler.jsonc` : vars (model, thinking), KV (placeholder id), DO + migration, BURST
- `apps/editor/src/ai/vault.ts`, `store.ts`, `api.ts` : vault, in-memory key state, Worker client
- `apps/editor/src/ai/KeyForms.tsx`, `AiSettings.tsx`, `AiPanel.tsx`, `QuotaBanner.tsx` : UI
- `apps/editor/e2e/ai.spec.ts` : key → ask → unlock after reload → quota banner → forget
- `packages/core/src/fonts.ts`, `font-license.ts`, `test-fonts.ts` : bundled font list, @font-face,
  OFL licence text, stand-in bytes for tests. `buildExport` now takes font bytes (3rd argument)
- `apps/editor/src/lib/fonts.ts` : font URLs (fontsource packages), bytes for export, `data:` URLs
  for the preview, `installEditorFonts` (FontFace API, no inline CSS)
- `apps/editor/src/ai/changes.ts` : plain names of changed settings for the AI result
- `packages/core/src/pages.ts`, `links.ts`, `pages.test.ts` : page add/rename/move/delete, slugs,
  link walking (`collectHrefs`, `mapHrefs`), blank project
- `apps/editor/src/panels/PagesPanel.tsx` : page list UI; `e2e/pages.spec.ts`
- `apps/editor/.env.deploy` : live Worker URL for `--mode deploy` builds (public)
- `package.json` / workspace `deploy`, `build:deploy`, `skill:remote` scripts; README "Deploy"
- `.claude/launch.json` (untracked) : now also `api` (wrangler dev on 8787)

- `apps/editor/src/security/headers.ts` (+ test) : CSP/headers, `_headers` text; `vite.config.ts` plugin
- `apps/editor/public/preview.html` : preview shell (own CSP, inner srcdoc frame)
- `apps/editor/src/lib/safety.ts` (+ test), `src/ui/SafetyBanners.tsx` : backup reminder, offline
- `apps/editor/public/terms.html`, `privacy.html`, `legal.css` : legal pages
- `apps/editor/e2e/security.spec.ts`, `a11y.spec.ts`, `offline.spec.ts`; `security-report.md`

## 4. What worked

- `wrangler pages project create klinth --production-branch main --force` makes a classic Pages
  project (without `--force`, Wrangler 4.157 now delegates to Workers). After that, plain
  `wrangler pages deploy dist --project-name klinth --branch main` works.
- `wrangler secret put NAME --name klinth-api` works from any folder; running it for the owner in a
  Terminal tab avoided typos in the name.

- Cloudflare Pages `_headers`: rules matching one path combine; `! Header` detaches an earlier one.
- `frames[0]` and `location`/`postMessage` work across opaque origins, so the editor can reach the
  inner preview window without same-origin.
- Verified 2026-11-04 (docs.github.com, GitHub changelog 2025-07-14): OAuth apps support PKCE,
  S256 only, not required. `POST /repos/{o}/{r}/pages` needs the `repo` scope for OAuth tokens.
  API version header `2022-11-28` (2026-03-10 also exists; ours is still supported). GitHub asks
  apps not to send content-creating requests in parallel, so blobs go one by one.
- Push uploads few blobs: text files go inline in the tree, and re-publishing reuses unchanged
  files by local Git sha (an unchanged republish makes zero blob calls and no commit).
- Verified 2026-11-04 (official docs, now under aistudio.google.com): stable free models
  `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`; Pro models are paid-only
  since 2026-04-01; `gemini-2.5-flash` routes to 3.5-flash-lite from 2026-12-01. Free RPM/RPD are
  only shown per project in AI Studio (not published). RPD resets at midnight Pacific.
- Google recommends the Interactions API (`POST /v1beta/interactions`, `Api-Revision: 2026-05-20`,
  `x-goog-api-key`, `system_instruction`, `response_format{mime_type,schema}`,
  `generation_config{max_output_tokens,thinking_level}`, `store:false`). Output text is in
  `steps[type=model_output].content[type=text].text`; `status` `incomplete` = cut off.
- Gemini 3.6+ ignores `temperature` and will reject it later, so it is not sent (prompt said "low
  temperature"; this is the replacement). `minimal` thinking works on 3.6 Flash and 3.5 Flash-Lite,
  not on 3.8 Flash (change `GEMINI_THINKING_LEVEL` with the model).
- Live check: a bad key returns **400 INVALID_ARGUMENT, reason API_KEY_INVALID** (old Google error
  format, sometimes wrapped in an array), not the documented 401. Mapping matches both formats;
  429 with `PerDay`/`quota_exceeded` → quota banner, `PerMinute`/`rate_limit_exceeded` → "busy".
- Cloudflare free (verified 2026-11-04): Workers 100k req/day, 10 ms CPU, 50 subrequests, no wall
  limit on fetch; DO 100k req/day, SQLite only (`new_sqlite_classes`), 5 GB; KV 100k reads/day,
  1k writes/day, 25 MiB values, `cacheTtl` min 30 s; rate limit binding period 10 or 60 s
  (approximate, per location), needs wrangler ≥ 4.36.
- Classic fetch-style Durable Object (no `cloudflare:workers` import) keeps plain Vitest working;
  tests drive the real `RateLimiter` class with in-memory storage.
- `wrangler deploy --dry-run` bundles fine: 816 KiB / 134 KiB gzip.
- Workers invocation logs are turned off in `wrangler.jsonc`: they would record request headers
  (the key). Our own logs are `{route, outcome}` only; tests spy on every console method.

## 5. What didn't work

- Free layout sizing: Playwright clicks at an item's centre can land on a later item stacked over
  it once text is tall (auto height); click near the top-left. A grown board redraws the preview
  ~120 ms after the drop, so a grab right after can hit the old frame; tests wait 500 ms. Tall
  display glyphs ink past a tight line height (scrollHeight > clientHeight with height:auto), so
  only sideways overflow counts for text.
- Free layout warning: the dialog opened under the pointer mid-drag, so moves and the release went
  to the editor, not the preview (the drop was lost and "Yes" waited forever). Fixed with
  `pointer-events:none` on the whole dialog while the button is held, `freeDrag` updates and the
  editor's own `pointerup` as a fallback.
- `spawnSync` for Lighthouse blocked the script's own static server: Lighthouse reported
  `TARGET_CRASHED`. Async `spawn` works. `--chrome-flags=--headless=new` also crashed here; plain
  `--headless` works.
- After the preview script sets a CSS variable, Chrome serialises the style as `--x: 1` (with a
  space); tests that read the attribute must allow it.
- A flow heading is measured at its block width (nearly the whole text column), so right after
  conversion it can only move down; the owner makes it narrower first (handle or Width field).
- `git worktree add` for a baseline run: the worktree cannot resolve the workspace packages; not
  useful here.

- `_headers`: a second block for a path that already has one (`/preview` + `Cache-Control`)
  replaced the first on Pages, so `/preview` got the editor CSP (`frame-ancestors 'none'`) and the
  live preview was blocked after deploy e3ab8fd3. One block per path now (unit test checks it).
  `vite preview` sends headers per path, so e2e cannot catch `_headers` mistakes.

- `wrangler pages project create` without `--force` ran Workers "autoconfig": added
  `@cloudflare/vite-plugin` + `wrangler.jsonc` to the editor, rewrote `preview`/`deploy` scripts and
  deployed a stray Worker `klinth`. All reverted, stray Worker deleted, and the leftover
  `apps/editor/.wrangler/deploy/config.json` removed (it broke `pages deploy`).
- The owner twice ran `secret put <client id>` (wrong name); deleted the wrong secret afterwards.
- `e2e/pages.spec.ts` failed once in the full run (Sections had 13 items, expected 1, test took
  22 s), then passed 3/3 alone. Likely the known lost-click timing flake; watch it.
- A brand-new workers.dev address needs a few minutes before TLS works (curl exit 35 at first).

- Detecting a ZIP by file name failed for Playwright downloads (no extension); now by `PK` bytes.
- Python `open(...,'w')` on Windows wrote CRLF; use `newline=''` or run Prettier after.
- The Interactions docs say 401 for a bad key; the live API said 400. Trust live checks.
- `getByLabel('Your Gemini key')` matched the form too (same aria-label); forms now use other
  names. `getByLabel('Heading')` also matches "Text under the heading"; use `exact: true`.
- jsdom has no `crypto.subtle`; vault tests run with `// @vitest-environment node`.

- A `srcdoc` (and blob:/data:) frame inherits the embedder's CSP, even when sandboxed; that is
  why the preview needed its own served page.
- Reloading `preview.html` per redraw (location.replace) broke offline (HTML is not cached);
  `document.write` reuse would leak blob URLs and globals. A persistent shell + inner srcdoc works.
- Playwright `page.evaluate(new Function)` is not blocked by CSP; test with an injected `<script>`.
- axe flagged contrast on the start screen mid-entrance animation; test with reduced motion.
- A click within ~300 ms of reloading the editor can be lost (AI e2e now waits for the preview).
  Not reproduced by hand; watch for it.

## 6. What is still left to do

1. **Owner:** fix the Pages build settings (see "Fix: live site blank" in section 1); until then
   every push to `main` makes a failing Git build and `npm run deploy:editor` is the way to deploy.
2. **Owner:** review the live skill text (`workers/api/skill/skill.md`, then `skill:remote`); review
   Terms/Privacy with a lawyer; turn on 2FA for GitHub and Cloudflare; delete `klinth-test-site`.
3. Optional: custom domain (README "Deploy" section lists the follow-up config changes); rename the
   workers.dev subdomain in the dashboard (then update `.env.deploy` and redeploy the editor).
4. Low: Lighthouse re-run on live exported sites; Turnstile only if abuse appears; zod/mini to trim
   the main chunk; eslint minimatch moderate advisories (dev only) clear with an eslint update;
   `stash@{0}` can be dropped. Item-level inline editing is inspector-only (flow sections).
5. Free layout, optional: UI to arrange items for phones (phone boxes; the bridge already edits
   them), manual reading-order editing, snapping while resizing. Touch: pointer events and
   `touch-action:none` are in place but the double-tap-and-drag gesture was not tried on a real
   iPad/iPhone.
6. Re-check yearly or when Google announces changes: `GEMINI_MODEL` (`gemini-3.6-flash`) still free.
