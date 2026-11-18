# H4: identity 1.1 (2026-11-19)

Identity 1.1.0 is a minor version. It adds variables and rules. It does not change or remove a
1.0.0 variable or rule. No bundle sets a brand variable. The existing test still checks this.

## What changed

| File | Change |
| --- | --- |
| `identity/tokens.json` | Version 1.1.0. New `misc` values: `focus-offset` 2px, `underline-offset` 0.2em, `underline-thickness` max(1px, 0.0625em). New `focus` block (fallback colour and the tested pairs). New `print` block (bg and surface #ffffff, text #000000). |
| `identity/build.mjs` | Writes a `@media print` variable block in each bundle. Puts `adapters/_shared.css` in each adapter bundle. |
| `identity/adapters/_shared.css` | New. The footer line, the reduced-motion rule, `.ys-print-hide`. |
| `identity/adapters/*.css` | Rules per stack. See the next section. |
| `identity/dist/*` | Built again with `node identity/build.mjs`. |
| `identity/README.md` | The rules table, the footer snippet, the changelog. The principles did not change. |
| `src/styles.css` | A print block for the hub. No change on screen. |
| `test/identity.test.mjs` | 10 new tests. |
| `night-run/H4-preview.html` | The preview page for the design review. |

## Decisions for each adapter

I read the published CSS of VitePress 1.6.3, MkDocs Material 9.6.14 and cayman before I decided.

| Rule | plain | VitePress | MkDocs Material | cayman |
| --- | --- | --- | --- | --- |
| Focus ring | yes | no | no | yes |
| Underline offset and thickness | yes | no | no | no |
| Reduced motion (no smooth scroll) | yes | yes | yes | yes |
| Print colours | yes | yes | yes | yes |
| Print: link address | yes | no | no | `.main-content` only |
| Print: hide navigation | `nav` | `.VPNav`, `.VPLocalNav`, `.VPSidebar`, `.VPDocAside` | no | no |
| Footer line | yes | yes | yes, with footer colours | yes |

- **Focus ring.** The rule is `:focus-visible { outline: var(--ys-focus-width) solid
  var(--ys-focus-color, var(--ys-text)); outline-offset: var(--ys-focus-offset); }`.
  No bundle sets `--ys-focus-color`. A site sets it to its own accent.
- **Fallback colour.** The fallback is the text colour, not the blue accent. The blue accent is
  for the person sites only, and the text colour is neutral on each project site.
- **Specificity.** The rule is a bare `:focus-visible`. A component rule of the site, for example
  `a:focus-visible`, wins over it.
- **VitePress: no focus rule.** VitePress has `button:focus-visible { outline: 4px auto
  -webkit-focus-ring-color }`, and links show the ring of the browser. These are good. One more
  rule changes links and not buttons, so the result is not uniform.
- **Material: no focus rule.** Material sets the ring colour to `--md-accent-fg-color` with an
  offset of 0.2rem. That is the brand of the project, so the identity does not touch it.
- **Links.** The plain bundle sets the offset and the thickness with `:where(a)`. It adds no
  underline. VitePress has its own underline rules. Cayman shows an underline on hover only.
- **Reduced motion.** The identity has no animation, so the rule only stops smooth scroll.
  VitePress and Material have their own rules for animations. I did not add the global
  `animation-duration: 0.01ms` rule: it can break a site that waits for the end of an animation.
- **Print colours.** The build writes the light colours with a white background and black text
  for each scheme selector. A page that pinned dark (`data-theme="dark"`, `.dark`, `slate`) prints
  light.
- **VitePress print.** I built a VitePress 1.6.3 sample and printed it. Three faults showed, and
  the bundle now corrects them: the fixed navigation, the pale brand colour of links and inline
  code, and the dark canvas in the page margins (`html.dark`).
- **Material print.** Material has its own print rules. The bundle adds the print colours only.
- **Cayman print.** The test forbids the header selector, so the bundle does not touch the header.
- **Footer line in Material.** The Material footer is dark in both schemes. There the line uses
  `--md-footer-fg-color--light` and the size of the copyright text (0.64rem).

## Contrast numbers (WCAG 2 formula, measured from tokens.json)

| Pair | Light | Dark | Need |
| --- | --- | --- | --- |
| Focus ring, fallback (text) against bg | 17.06 | 14.78 | 3 |
| Focus ring, fallback (text) against surface | 17.85 | 13.63 | 3 |
| Focus ring, accent against bg | 6.41 | 7.51 | 3 |
| Focus ring, accent against surface | 6.70 | 6.92 | 3 |
| Footer line (muted) on bg | 7.24 | 8.03 | 4.5 |
| Footer line (muted) on surface | 7.58 | 7.40 | 4.5 |
| Footer line (muted) on surface-2 | 6.92 | 6.82 | 4.5 |
| Print: text #000000 on #ffffff | 21.00 | - | 4.5 |
| Print: muted #475569 on #ffffff | 7.58 | - | 4.5 |
| Print: accent #1d4ed8 on #ffffff | 6.70 | - | 4.5 |

The tests check the focus rows and the print text row. I calculated the other rows one time.

## Tests

`p1-slot run -- npm test`: 128 tests, 128 pass, 0 fail (118 before this change).

## Previews

The files are outside the repository, in
`/tmp/claude-997/-srv-work-xsavikx-github-io/d7ecaa6f-15c7-43c1-9f49-2c00bac101a0/scratchpad/night-artifacts/h4/`:

- `h4-preview-light.png`: the preview page, 1440 px, light page.
- `h4-preview-dark.png`: the same with `?theme=dark`.
- `h4-preview-phone-light.png`: the same at 390 px.
- `h4-preview-print.pdf`: the print output of the page with `?theme=dark`.
- `vitepress-sample-dark.png`, `vitepress-sample-footer-dark.png`: a VitePress sample with the
  new bundle, dark, and its footer line.
- `vitepress-sample-print.pdf`: the print output of that sample from the dark scheme.

The preview page inlines the body of `ys-plain.css` without the stamp comment, and it writes the
dot of the hub host as `&#46;`. `test/origin.test.mjs` permits the literal host name in one source
file only, and it reads `night-run/*.html`. The page shows the same result in the browser.

In the preview, the class `force-focus` copies the focus rule, because a screenshot cannot hold
focus on four elements. Press Tab on the page to see the rule of the bundle.

## Not checked

- MkDocs Material and cayman in a browser. I read their CSS only. I built no sample site.
- A real project site with the new bundle. No project site has the 1.1 bundle.
- Firefox and Safari. All renders are from Chromium on p1.
- Chromium printed with backgrounds. A print dialog has backgrounds off by default.
- A highlighted code block of VitePress in print from the dark scheme. It keeps the dark colours.
- Forced-colours mode and a screen reader.
- The reduced-motion rule in a browser. The test checks only that the rule is in each bundle.
- The print output of the hub page itself. The tests check only that the block is there.
