// The colours of a house's arms, as the table uses them (GDD 21 §1, D-064). Pure and free of the page, so the game and the
// tests read the same rule: the page's theme (ui/common.js applyHouseTheme) and tests/theme.test.js both import it.

/** '#9c1616' → [hue 0–360, saturation 0–100, lightness 0–100]; anything that is not a six-digit hex colour is null. */
export function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null;
  const n = parseInt(m[1], 16); const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

/** How much pigment a colour holds: none for whites, greys and blacks (they are metals and furs, not wax), more the richer and deeper it is. */
export function pigment(hex) {
  const c = hexToHsl(hex); if (!c) return 0;
  const [, s, l] = c;
  return s >= 30 && l >= 10 && l <= 80 ? (s / 100) * (1 - l / 100) ** 2 : 0;
}

export const OXBLOOD = '#7b1e17'; // the wax a maester keeps for a house whose arms have no colour a seal could take

/** The wax of a house's seals: the richer of its arms' two colours, or oxblood when neither holds pigment (Stark's grey and white). */
export function waxOf(one, two) {
  const best = pigment(two) > pigment(one) ? two : one;
  return pigment(best) > 0 ? best : OXBLOOD;
}
