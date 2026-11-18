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

## Adopt it in a project site

1. Copy one bundle into the repository, byte for byte, for example as
   `docs/.vitepress/theme/ys-vitepress.css`. Do not edit the copy.
2. Load it after the site's own theme CSS.
3. Map any site-specific neutral variable to a `--ys-*` variable. Keep the
   brand variables as they are.
4. Add a footer line that links to the hub: "Part of Yurii Serhiichuk's
   open-source projects".
5. Check contrast for any brand colour that sits on the new neutrals.

To update, copy the new bundle again. The first line of each bundle names the
version and a hash:

```
/*! ys-tokens 1.0.0 ys-vitepress.css sha256:…
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
