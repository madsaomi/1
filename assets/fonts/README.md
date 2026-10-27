# Inter webfonts

These unmodified WOFF2 files are self-hosted font assets, not an installed npm dependency.

- Family: Inter, normal style, variable weight axis 100–900 (default 400).
- Font name-table version: `Version 4.001;git-66647c0bb`.
- Distribution: `@fontsource-variable/inter@5.3.0`, downloaded with `npm pack --ignore-scripts` into a temporary directory outside this project.
- Distribution documentation: <https://fontsource.org/fonts/inter/use>.
- Upstream project: <https://github.com/rsms/inter>.
- Distribution font source: <https://github.com/google/fonts>.
- License: SIL Open Font License 1.1, preserved in `OFL.txt` with the original copyright notice.

| File | Size | SHA-256 |
| --- | ---: | --- |
| `inter-latin-wght-normal.woff2` | 48,256 bytes | `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62` |
| `inter-cyrillic-wght-normal.woff2` | 18,748 bytes | `71d5ee93cc1e9f1d520a3a8b66456de18c7879d8df09d57fcd2eaff75fef0075` |

Use separate `@font-face` declarations with `font-style: normal`, `font-weight: 100 900`, `font-display: swap`, and the distribution's unicode ranges:

```css
/* inter-cyrillic-wght-normal.woff2 */
unicode-range: U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;

/* inter-latin-wght-normal.woff2 */
unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
```

Verification: WOFF2 signature and declared length checked; compressed table stream decoded using Node's built-in Brotli implementation. Name and `fvar` tables confirm Inter and the weight range. `cmap` covers all 95 printable ASCII characters and all 66 Russian letters (including Ё/ё), plus №. No browser rendering verification is implied.
