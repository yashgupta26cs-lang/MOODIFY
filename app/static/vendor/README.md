# Vendored front-end libraries

These files are served from MOODIFY itself (not from a CDN), so the motion
layer keeps working offline and does not depend on a third-party host.

| File | Library | Version | Licence |
|------|---------|---------|---------|
| `gsap.min.js` | GSAP | 3.15.1 | GreenSock Standard "no charge" licence - https://gsap.com/standard-license |
| `ScrollTrigger.min.js` | GSAP ScrollTrigger plugin | 3.15.1 | Same GSAP Standard licence |
| `lenis.min.js` | Lenis smooth scroll | 1.3.28 | MIT - see `LICENSE-lenis.txt` |
| `fonts/inter-latin-wght-normal.woff2` | Inter (variable, Latin subset) | 5.3.0 (`@fontsource-variable/inter`) | SIL OFL 1.1 - see `LICENSE-inter-OFL.txt` |

Notes
- `lenis.min.js` has its trailing `sourceMappingURL` comment removed so browsers
  do not request a map file that is not shipped.
- To update a library, download the new build from npm (`npm pack <name>`),
  replace the file, and update the version in this table.
- GSAP is distributed under its own "no charge" licence, which has conditions.
  Read the licence text at the link above before changing how GSAP is used.
