// Extracts dominant color from an image URL using in-memory Canvas
// Includes graceful fallback hashing if canvas or CORS is unavailable

const colorCache = new Map();

// Curated Spotify-style dark atmospheric palettes for fallback
const FALLBACK_PALETTES = [
  { r: 42, g: 68, b: 86, hex: '#2a4456' },   // Slate blue / interstellar
  { r: 65, g: 38, b: 58, hex: '#41263a' },   // Deep berry
  { r: 34, g: 58, b: 46, hex: '#223a2e' },   // Pine green
  { r: 72, g: 48, b: 32, hex: '#483020' },   // Warm amber
  { r: 32, g: 46, b: 72, hex: '#202e48' },   // Deep twilight
  { r: 56, g: 34, b: 68, hex: '#382244' },   // Midnight violet
  { r: 45, g: 56, b: 62, hex: '#2d383e' },   // Deep ocean storm
  { r: 68, g: 52, b: 36, hex: '#443424' },   // Desert sandstone
  { r: 52, g: 42, b: 65, hex: '#342a41' },   // Amethyst dusk
];

function getFallbackColor(seed = '') {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return FALLBACK_PALETTES[Math.abs(hash) % FALLBACK_PALETTES.length];
}

export function extractColorFromImage(imageUrl, seed = '') {
  if (!imageUrl) return Promise.resolve(getFallbackColor(seed));
  if (colorCache.has(imageUrl)) return Promise.resolve(colorCache.get(imageUrl));

  return new Promise((resolve) => {
    const fallback = getFallbackColor(imageUrl + seed);
    if (typeof window === 'undefined') {
      return resolve(fallback);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';

    let settled = false;
    const finish = (color) => {
      if (settled) return;
      settled = true;
      colorCache.set(imageUrl, color);
      resolve(color);
    };

    // Safety timeout in case image loading hangs
    const timer = setTimeout(() => finish(fallback), 1800);

    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        const size = 32;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return finish(fallback);

        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        let totalR = 0, totalG = 0, totalB = 0, count = 0;
        let maxScore = -1;
        let bestR = fallback.r, bestG = fallback.g, bestB = fallback.b;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 128) continue;

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const brightness = (max + min) / 2;
          const delta = max - min;
          const saturation = max === 0 ? 0 : delta / max;

          // Exclude extreme darks and extreme whites
          if (brightness < 30 || brightness > 225) continue;

          // Score by saturation and appealing midtone brightness
          const score = (saturation * 2) + (1 - Math.abs(brightness - 100) / 100);
          if (score > maxScore) {
            maxScore = score;
            bestR = r;
            bestG = g;
            bestB = b;
          }

          totalR += r;
          totalG += g;
          totalB += b;
          count++;
        }

        let pickR = maxScore > 0.5 ? bestR : (count > 0 ? totalR / count : fallback.r);
        let pickG = maxScore > 0.5 ? bestG : (count > 0 ? totalG / count : fallback.g);
        let pickB = maxScore > 0.5 ? bestB : (count > 0 ? totalB / count : fallback.b);

        // Normalize color intensity so it is rich, atmospheric and never blinding
        const maxVal = Math.max(pickR, pickG, pickB, 1);
        const targetMax = Math.min(135, Math.max(75, maxVal));
        const factor = targetMax / maxVal;

        let finalR = Math.round(Math.max(24, Math.min(130, pickR * factor)));
        let finalG = Math.round(Math.max(24, Math.min(130, pickG * factor)));
        let finalB = Math.round(Math.max(28, Math.min(135, pickB * factor)));

        const hex = `#${((1 << 24) + (finalR << 16) + (finalG << 8) + finalB).toString(16).slice(1)}`;
        finish({ r: finalR, g: finalG, b: finalB, hex });
      } catch (err) {
        finish(fallback);
      }
    };

    img.onerror = () => {
      clearTimeout(timer);
      finish(fallback);
    };

    img.src = imageUrl;
  });
}
