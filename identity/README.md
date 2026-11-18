# Shared identity

One small design layer for all of Yurii Serhiichuk's web properties:
serhiichuk.dev, the CV, this hub, and every project site under it.

`tokens.json` is the source of truth. `build.mjs` writes the CSS bundles in
`dist/`. The hub build publishes both under `/identity/` on the hub origin.

## Principles

1. **One family, many projects.** All sites share the neutral colours, the
   fonts, the spacing and the corner radii. A project keeps its own brand: its
   accent, header, logo, buttons and illustrations. Do not replace them.
2. **The person sites use the person's accent.** serhiichuk.dev, the CV and the
   hub use the blue accent and the "YS" mark. A project site does not.
3. **System fonts only.** Headings and body use the system sans stack; code uses
   the system mono stack. No web font, no serif headings.
4. **Contrast is tested, not reviewed.** Text pairs meet 4.5:1 and control
   edges 3:1 in light and dark. `test/identity.test.mjs` fails the build
   otherwise.
5. **Theme the framework, do not replace it.** VitePress, MkDocs Material and
   Jekyll keep their components. An adapter maps the tokens onto their
   variables.
6. **No run-time link between sites.** Each site keeps its own copy of one
   bundle, so a site works offline and does not break when the hub changes.

Decisions behind these rules (2026-11-18): the blue accent of serhiichuk.dev
for the person sites, the slate neutrals of serhiichuk.dev for all sites, no
serif headings, and project sites keep their own brand colours.

## Bundles

| File | For | Dark mode follows |
| --- | --- | --- |
| `ys-tokens.css` | Variables only | `prefers-color-scheme`, or `data-theme` on `<html>` |
| `ys-plain.css` | A hand-written site | the same |
| `ys-vitepress.css` | VitePress 1 default theme | the `.dark` class |
| `ys-mkdocs-material.css` | MkDocs Material 9 | `data-md-color-scheme="slate"` |
| `ys-jekyll-cayman.css` | Jekyll cayman | light only (cayman has no dark mode) |

The adapters change only neutrals and fonts. A test checks that no bundle sets
a brand variable (`--vp-c-brand-*`, `--md-primary-*`, `--md-accent-*`, or the
cayman header).

## Rules in the bundles (since 1.1.0)

`ys-tokens.css` has variables only. Each other bundle also has rules. A rule is
in a bundle only where it is safe for that stack.

| Rule | plain | VitePress | MkDocs Material | Jekyll cayman |
| --- | --- | --- | --- | --- |
| Focus ring | yes | no, the framework has one | no, the framework has one | yes |
| Link underline offset and thickness | yes | no | no | no |
| Reduced motion: no smooth scroll | yes | yes | yes | yes |
| Print colours: white paper, black text | yes | yes | yes | yes |
| Print: address after a body-text link | yes | no | no | yes, in `.main-content` |
| Print: hide navigation | `nav` | `.VPNav`, `.VPLocalNav`, `.VPSidebar`, `.VPDocAside` | no, the framework does it | no |
| Print: body-text links and inline code in the text colour | no | yes | no | no |
| Print: hide decorative art | `img[alt=""]`, `svg[aria-hidden="true"]` | no | no | no |
| Footer line `.ys-footer-line` | yes | yes | yes | yes |

### Focus ring

```css
:focus-visible {
  outline: var(--ys-focus-width) solid var(--ys-focus-color, var(--ys-text));
  outline-offset: var(--ys-focus-offset);
}
```

- No bundle sets `--ys-focus-color`. A site sets it to its own accent, for
  example `:root { --ys-focus-color: var(--ys-accent); }` on a person site.
- Without it, the ring has the text colour. The text colour is neutral, so a
  project site does not get the blue accent of the person sites.
- The text colour and the accent meet 3:1 against `bg` and `surface` in light
  and dark. A test checks this. If a site sets its own colour, the site must
  check that colour.
- A more specific rule of the site, for example `a:focus-visible`, wins.
- VitePress and MkDocs Material keep their own focus styles. VitePress shows
  the ring of the browser. Material draws its ring in the accent of the project.
  A site on these stacks can use `--ys-focus-width` and `--ys-focus-offset` in
  its own rule.

### Links

The plain bundle sets `text-underline-offset` and `text-decoration-thickness`
on links. It does not add or remove an underline.

### Reduced motion

The identity adds no animation and no transition. When the reader asks for
reduced motion, each bundle stops smooth scroll. Each site stays responsible
for its own animations.

### Print

In print, each bundle sets the light colours with a white background and black
text, also when the page pinned dark. Add the class `ys-print-hide` to an
element that must not print.

The VitePress bundle hides the navigation chrome, because the fixed bar prints
on each sheet. It prints body-text links and inline code in the text colour,
because the dark brand colour is too light on white paper. It does not change
the colours of a highlighted code block.

### Footer line

Each project site links to the hub with one line. Copy this snippet into the
footer of the site:

```html
<p class="ys-footer-line">Part of <a href="https://xsavikx.github.io/">Yurii Serhiichuk's open-source projects</a></p>
```

The class makes the line small and muted. The link has the colour of the line
and an underline. The class works on other elements also. Use a `<span>` where
the framework puts the text in its own `<p>`, for example in the
`footer.message` of VitePress or the `copyright` of MkDocs Material.

## Adopt it in a project site

1. Copy one bundle into the repository, byte for byte, for example as
   `docs/.vitepress/theme/ys-vitepress.css`. Do not edit the copy.
2. Load it after the site's own theme CSS.
3. Map any site-specific neutral variable to a `--ys-*` variable. Keep the
   brand variables as they are.
4. Add the footer line that links to the hub: "Part of Yurii Serhiichuk's
   open-source projects". Use the snippet in "Footer line" above.
5. Check contrast for any brand colour that sits on the new neutrals.

To update, copy the new bundle again. The first line of each bundle names the
version and a hash:

```
/*! ys-tokens 1.1.0 ys-vitepress.css sha256:…
```

A site can compare that line with the published copy at
`<hub origin>/identity/<file>` to see if its copy is old.

## Change the tokens

1. Edit `tokens.json`. Raise `version` (minor for a new token, major for a
   changed or removed one).
2. Run `node identity/build.mjs`.
3. Run `npm test`. The identity tests check contrast, that `dist/` is up to
   date, and that `src/styles.css` of the hub uses the same values.
4. Commit `tokens.json` and `dist/` together.

## Instruction for agents

Put this in the `CLAUDE.md` or `AGENTS.md` of a project site that uses a bundle:

```markdown
## Design identity

This site uses the shared identity from xSAVIKx/xSAVIKx.github.io/identity.
- Do not edit the vendored `ys-*.css` file. To update it, copy the new file from the hub.
- Keep this project's own brand colours, logo and illustrations.
- Use system fonts only. Do not add a web font or serif headings.
- New text colours must meet 4.5:1 contrast in light and dark.
```

## Changelog

### 1.1.0 (2026-11-19)

A minor version. It adds variables and rules. It does not change or remove a
1.0.0 variable or rule.

- New variables: `--ys-focus-offset`, `--ys-underline-offset`,
  `--ys-underline-thickness`.
- New site variable: `--ys-focus-color` (a site sets it, no bundle does).
- Focus ring in the plain and cayman bundles.
- Underline offset and thickness for links in the plain bundle.
- Reduced-motion rule, print colours and the `.ys-footer-line` and
  `.ys-print-hide` classes in each adapter bundle.
- Print rules for navigation, decorative art and link addresses, per stack.

A site that updates from 1.0.0 changes only in these places: the focus ring
(plain, cayman), the position of link underlines (plain), print, and smooth
scroll with reduced motion.

### 1.0.0 (2026-11-18)

The first version: colours, fonts, spacing, radii and the four adapters.
