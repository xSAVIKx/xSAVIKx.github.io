# H2: Lighthouse and visual re-audit (2026-11-18)

## Method

- The browser tool on p1 blocks the live origin, so I audited a local build of this branch
  (`npm run build` with the real GitHub API, served by `python3 -m http.server`). The branch
  equals live main plus H8, so the result applies to the live hub.
- Lighthouse (Chrome DevTools MCP), mobile and desktop. That tool does not score performance,
  so I took performance traces and read the LCP entry in the page.
- Screenshots: desktop 1440x900 light and dark, phone 390x844 light (kept outside the repo).

## Results

| Category | Mobile | Desktop |
| --- | --- | --- |
| Accessibility | 100 | 100 |
| Best practices | 96 | 96 |
| SEO | 100 | 100 |
| Agentic browsing | 100 | 100 |

- Best practices 96: one console error. The avatar on avatars.githubusercontent.com failed with
  `net::ERR_INTERNET_DISCONNECTED`. The browser on p1 has no internet. This is not a site fault.
- CLS: 0.00.

## Finding and fix

- The largest paint (LCP) on the first screen was the art of a featured card at 390 px and at
  1905 px wide. That image had `loading="lazy"`, so the browser found it late. Lighthouse showed
  the `LCPDiscovery` insight, and the LCP breakdown had 670 ms load delay (desktop, no throttling).
- Fix: featured card art loads at once, and the first featured card has `fetchpriority="high"`.
  Other cards stay lazy. A test covers this.
- After the fix: phone LCP 250 ms, load delay 67 ms, and the `LCPDiscovery` insight is gone.

## What I did not check

- Real network conditions: p1 refuses network throttling while the browser has a block list.
  All times are from localhost with no throttling. Compare only before and after, not with field data.
- The live origin itself (GitHub Pages headers, cache, compression).
- Dark mode on the phone.
