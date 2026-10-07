# Yitra — logo files

**Idea.** A single Y whose right arm runs to 58% of its counterpart and stops on a flat cut. The letter is whole, the arm is not: a remainder is a portion of a full thing. It is not a scale, a gauge or a chart.

## Colour

| Role                    | Value                 |
| ----------------------- | --------------------- |
| Primary (light grounds) | `#4B22E0`             |
| Lift (dark grounds)     | `#A78BFA`             |
| One-colour / print      | `#18181B`             |
| Tile ground + knockout  | `#4B22E0` + `#FFFFFF` |

Green, red and amber are reserved by the product's data layer (positive / negative / warning) and never appear in the identity. Violet collides with none of them.

## Geometry

- Icon: artboard 100×100, stroke 28u, both arms at 45°, right arm truncated at 58%, butt caps, mitre joins.
- Wordmark glyph: artboard 58×100 (cap height 100, baseline y=100), stroke 19u — Assistant ExtraBold stem weight, arms at 58° to match the family's Y.
- Never taper, round, outline or add a second colour inside the mark.

## Rules

- Clear space: one stroke width (28u) on all sides.
- Minimum icon size: 16px. Minimum integrated wordmark: 15px type size — below that, set the name in full type.
- Flat single tone in all product chrome. The gradient variant is for outward surfaces only (social thumbnail, README hero) and never in app UI.
- The product uses one Latin name everywhere, including the in-app header: the icon pairs with "Yitra" (decision record, criterion 5 of #247).
- `yitra-wordmark.svg` uses live text, which falls back to a serif wherever Assistant is not installed. Do not use it on outward surfaces (README, GitHub, LinkedIn) until an outlined export replaces it.
- Circle crops are the platform's (avatars only) — the system has no corner radius of its own.

## Files

| File                         | Use                                                           |
| ---------------------------- | ------------------------------------------------------------- |
| `yitra-icon.svg`             | Primary icon, light grounds                                   |
| `yitra-icon-dark-ground.svg` | Icon on dark UI                                               |
| `yitra-icon-mono.svg`        | One-colour, print, embroidery                                 |
| `yitra-icon-white.svg`       | Knockout on violet or photography                             |
| `yitra-tile.svg`             | Avatar / app icon, 512 artboard                               |
| `yitra-cut-y-glyph.svg`      | The Y for setting the wordmark yourself                       |
| `yitra-wordmark.svg`         | Full "Yitra" lockup (live Assistant text — outline for print) |
| `favicon.svg`                | Modern browsers; switches tone with the colour scheme         |
| `favicon-16/32/48.png`       | Legacy favicon set, transparent                               |
| `apple-touch-icon-180.png`   | iOS home screen                                               |
| `icon-512.png`               | PWA manifest / Docker Hub                                     |
| `avatar-1024.png`            | GitHub org, LinkedIn                                          |

## HTML

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon-32.png" sizes="32x32" />
<link rel="apple-touch-icon" href="/apple-touch-icon-180.png" />
```

In the app these are not hand-linked: Next serves `src/app/icon.svg`, `src/app/favicon.ico` and `src/app/apple-icon.png` by file convention, and the in-app mark is `src/components/brand-mark.tsx`.
