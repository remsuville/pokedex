import { useState } from 'react';

/**
 * A game sprite drawn crisp. `image-rendering: pixelated` only looks right
 * when every source pixel maps to a whole number of *device* pixels, so
 * once the image loads we pick the largest such scale that fits the box —
 * on a 2x display that allows 1.5x in CSS pixels, which is why sprites come
 * out larger there. Sources vary from 40x40 (Gen I/II) through 64 (III), 80
 * (IV), 96 (V) to 256 (BDSP); tight-cropped GIFs can be as small as 37px.
 * One too big for the box is shrunk to fit. Bottom-aligned because sprites
 * stand on a baseline.
 */
export function PixelSprite({ src, alt, box }: { src: string; alt: string; box: number }) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  return (
    <span className="flex shrink-0 items-end justify-center" style={{ width: box, height: box }}>
      <img
        src={src}
        alt={alt}
        onLoad={e => {
          const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
          if (!w || !h) return;
          const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
          const scale = Math.floor((box * dpr) / Math.max(w, h)) / dpr;
          setSize(scale >= 1 ? { width: w * scale, height: h * scale } : null);
        }}
        className="max-h-full max-w-full object-scale-down object-bottom"
        style={{ imageRendering: 'pixelated', ...size }}
      />
    </span>
  );
}
