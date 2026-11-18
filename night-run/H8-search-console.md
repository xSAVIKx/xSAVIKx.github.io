# H8: Search Console and Bing Webmaster Tools

## What the branch changes

- `src/site-verification.json` holds the verification tokens. The build writes one
  `<meta>` tag for each token.
- The existing Google token (`sMLPKoYM…`, in the page since 2026-09-11) moved from
  `src/index.html` into this file. The rendered page keeps the same tag. A test checks this.
- `docs/ARCHITECTURE.md` has a new section with the steps.

## What the operator does (I cannot do these steps)

Google Search Console:
1. Open https://search.google.com/search-console and sign in with the account that owns
   the `sMLPKoYM…` token.
2. Check that the property `https://xsavikx.github.io/` exists and shows "Verified".
   If it does not exist, the token belongs to another account: add the property, take the
   new token, and send it to me.
3. Open Sitemaps and submit `https://xsavikx.github.io/sitemap.xml`.

Bing Webmaster Tools (choose one method):
- Method A (no code change): open https://www.bing.com/webmasters, choose
  "Import from Google Search Console", and select `https://xsavikx.github.io/`. Bing imports
  the site and the sitemap.
- Method B: add the site, choose "HTML Meta Tag", and send me the `content` value of the
  `msvalidate.01` tag. I add it to `src/site-verification.json` on a branch.

## What I did not check

- I cannot see the Search Console account, so I do not know if the property is verified now.
- I did not check if Bing already knows the site.
