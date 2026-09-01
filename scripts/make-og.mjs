/**
 * Genera public/og-default.png (1200x630) dal logo + gradiente di brand.
 * Usa sharp, gia' presente come dipendenza di Astro per astro:assets.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1200, H = 630;

const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0C1830"/>
      <stop offset="45%" stop-color="#1B3E57"/>
      <stop offset="100%" stop-color="#467896"/>
    </linearGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#8FD3E0"/>
      <stop offset="100%" stop-color="#467896"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect x="80" y="300" width="120" height="3" fill="url(#rule)"/>
  <text x="80" y="270" fill="#8FD3E0" font-family="Arial,Helvetica,sans-serif"
        font-size="20" font-weight="700" letter-spacing="7">INVESTIGATIVE INTELLIGENCE</text>
  <text x="80" y="380" fill="#FFFFFF" font-family="Arial,Helvetica,sans-serif"
        font-size="54" font-weight="700" letter-spacing="1">CONOSCERE PRIMA.</text>
  <text x="80" y="446" fill="#FFFFFF" font-family="Arial,Helvetica,sans-serif"
        font-size="54" font-weight="700" letter-spacing="1">AGIRE MEGLIO.</text>
  <text x="80" y="520" fill="#D6F5F8" font-family="Arial,Helvetica,sans-serif"
        font-size="24">Collection Intelligence · Custom Investigations</text>
</svg>`);

const logo = await sharp(join(ROOT, 'brand/netunim-logo-white.png'))
  .resize({ width: 300 })
  .toBuffer();

await sharp(bg)
  .composite([{ input: logo, top: 96, left: 80 }])
  .png({ compressionLevel: 9 })
  .toFile(join(ROOT, 'public/og-default.png'));

const meta = await sharp(join(ROOT, 'public/og-default.png')).metadata();
console.log(`og-default.png generata: ${meta.width}x${meta.height}`);
