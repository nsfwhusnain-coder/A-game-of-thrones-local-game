// Small, fast, deterministic 2D gradient noise + fractal helpers.
export function makeNoise(seed = 1337) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = rnd() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }

  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = perm[X + perm[Y]], b = perm[X + 1 + perm[Y]], c = perm[X + perm[Y + 1]], d = perm[X + 1 + perm[Y + 1]];
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const n00 = gx[a] * xf + gy[a] * yf;
    const n10 = gx[b] * (xf - 1) + gy[b] * yf;
    const n01 = gx[c] * xf + gy[c] * (yf - 1);
    const n11 = gx[d] * (xf - 1) + gy[d] * (yf - 1);
    const x1 = n00 + (n10 - n00) * u, x2 = n01 + (n11 - n01) * u;
    return (x1 + (x2 - x1) * v) * 1.414; // ~[-1,1]
  }
  function fbm(x, y, oct = 5, lac = 2.0, gain = 0.5) {
    let amp = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += amp * noise(x * f, y * f); norm += amp; amp *= gain; f *= lac; }
    return sum / norm;
  }
  function ridged(x, y, oct = 5) {
    let amp = 0.5, f = 1, sum = 0, prev = 1;
    for (let i = 0; i < oct; i++) {
      let n = 1 - Math.abs(noise(x * f, y * f));
      n *= n; sum += n * amp * prev; prev = n; amp *= 0.5; f *= 2.03;
    }
    return sum;
  }
  return { noise, fbm, ridged, rnd };
}
