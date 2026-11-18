# H7: release feed and Atom

## What the branch adds

- `fetchReleases` and `addReleases` (scripts/lib/discover.mjs): the 5 newest published releases of
  each project, without drafts and pre-releases. One API call for each project.
- Each card shows "Release <tag>" for the newest release. Projects without a release show no line.
- `projects.json`: `latestRelease` (tag, url, published date).
- `/releases.xml`: an Atom feed, 30 newest entries, at most 5 for each project. The feed date is the
  newest release date, so a rebuild with no new release writes the same file.
- The page head has `<link rel="alternate" type="application/atom+xml">`; the footer and llms.txt
  link the feed. The quality gate checks the feed (60 checks now).

## Results

- `npm test`: 131 pass, 0 fail.
- Real build (2026-11-18): 25 entries, 26 KB, valid XML (Python minidom). Card tags: v1.0.509.1,
  v1.11.0, python-v0.14.0, skills/okf-viz/v0.10.0, v0.1. geo-coordinates and sre-agent have no release.

## Design choices

- No separate "recent releases" section on the page: agent-signals (78 releases) and okf-skills
  (93) would fill it. The card line and the feed show releases without that problem.
- The card tag is text, not a link. Two projects can share a tag such as v1.0, and the page has a
  test that no two links share an accessible name.

## What I did not check

- The feed in a feed reader or the W3C feed validator (no network for the validator here).
- Checked later: the long tag `skills/okf-viz/v0.10.0` fits in the card at 390 px, and the page does not scroll sideways.
- JSON-LD `version` on each SoftwareSourceCode item. I did not add it; it is a small follow-up.
