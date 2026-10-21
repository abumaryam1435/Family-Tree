import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Gradient: Deep Royal Emerald -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F4C3A"/>
      <stop offset="50%" stop-color="#09382B"/>
      <stop offset="100%" stop-color="#041B15"/>
    </linearGradient>

    <!-- Metallic Gold Gradient for Tree Artwork -->
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFEBB0"/>
      <stop offset="35%" stop-color="#F3D370"/>
      <stop offset="70%" stop-color="#D4AF37"/>
      <stop offset="100%" stop-color="#997A15"/>
    </linearGradient>

    <!-- Trunk Solid Gold Gradient -->
    <linearGradient id="trunkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#F3D370"/>
      <stop offset="100%" stop-color="#A68322"/>
    </linearGradient>
  </defs>

  <!-- Background base fill -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>

  <!-- Ornate Decorative Outer Ring -->
  <rect x="20" y="20" width="472" height="472" rx="96" fill="none" stroke="url(#goldGrad)" stroke-width="4" stroke-opacity="0.5"/>

  <!-- Center Tree Iconography Group -->
  <g transform="translate(256, 230)">

    <!-- Deep Roots -->
    <path d="M -30,135 Q -60,165 -110,180 M -15,140 Q -30,175 -50,195 M 0,140 L 0,195 M 15,140 Q 30,175 50,195 M 30,135 Q 60,165 110,180" fill="none" stroke="url(#goldGrad)" stroke-width="6" stroke-linecap="round" opacity="0.85"/>

    <!-- Main Solid Tree Trunk -->
    <path d="M -24,140 C -24,95 -14,50 0,0 C 14,50 24,95 24,140 Z" fill="url(#trunkGrad)"/>

    <!-- Primary Spreading Branches -->
    <path d="M 0,20 C -45,-15 -85,-25 -135,-45" fill="none" stroke="url(#goldGrad)" stroke-width="12" stroke-linecap="round"/>
    <path d="M 0,20 C 45,-15 85,-25 135,-45" fill="none" stroke="url(#goldGrad)" stroke-width="12" stroke-linecap="round"/>

    <!-- Upper Main Trunk Extension -->
    <path d="M 0,0 C 0,-50 0,-90 0,-125" fill="none" stroke="url(#goldGrad)" stroke-width="14" stroke-linecap="round"/>

    <!-- Secondary Crown Branches -->
    <path d="M -65,-25 C -95,-55 -125,-65 -155,-105" fill="none" stroke="url(#goldGrad)" stroke-width="8" stroke-linecap="round"/>
    <path d="M 65,-25 C 95,-55 125,-65 155,-105" fill="none" stroke="url(#goldGrad)" stroke-width="8" stroke-linecap="round"/>

    <path d="M -20,-65 C -45,-95 -55,-125 -75,-155" fill="none" stroke="url(#goldGrad)" stroke-width="8" stroke-linecap="round"/>
    <path d="M 20,-65 C 45,-95 55,-125 75,-155" fill="none" stroke="url(#goldGrad)" stroke-width="8" stroke-linecap="round"/>

    <!-- Generation Nodes (Circular Golden Tokens for Family Ancestors & Offspring) -->
    <!-- Top Root Ancestor (أصل الشجرة) -->
    <circle cx="0" cy="-135" r="26" fill="#FDFBF7" stroke="url(#goldGrad)" stroke-width="6"/>
    <circle cx="0" cy="-135" r="13" fill="#0F4C3A"/>

    <!-- 2nd Generation Main Nodes -->
    <circle cx="-135" cy="-45" r="22" fill="#FDFBF7" stroke="url(#goldGrad)" stroke-width="5"/>
    <circle cx="-135" cy="-45" r="10" fill="#0F4C3A"/>

    <circle cx="135" cy="-45" r="22" fill="#FDFBF7" stroke="url(#goldGrad)" stroke-width="5"/>
    <circle cx="135" cy="-45" r="10" fill="#0F4C3A"/>

    <!-- 3rd Generation Crown Nodes -->
    <circle cx="-155" cy="-105" r="17" fill="#FDFBF7" stroke="url(#goldGrad)" stroke-width="4.5"/>
    <circle cx="-75" cy="-155" r="17" fill="#FDFBF7" stroke="url(#goldGrad)" stroke-width="4.5"/>
    <circle cx="75" cy="-155" r="17" fill="#FDFBF7" stroke="url(#goldGrad)" stroke-width="4.5"/>
    <circle cx="155" cy="-105" r="17" fill="#FDFBF7" stroke="url(#goldGrad)" stroke-width="4.5"/>

    <!-- Golden Leaves & Flourishes -->
    <path d="M -135,-45 Q -165,-65 -155,-25 Z" fill="url(#goldGrad)"/>
    <path d="M 135,-45 Q 165,-65 155,-25 Z" fill="url(#goldGrad)"/>
    <path d="M 0,-135 Q -28,-170 0,-182 Q 28,-170 0,-135 Z" fill="url(#goldGrad)"/>
  </g>

  <!-- Title Banner Arabic Text -->
  <text x="256" y="450" font-family="'Cairo', 'Segoe UI', sans-serif" font-size="42" font-weight="900" fill="#FDFBF7" text-anchor="middle" letter-spacing="1">شجرة العائلة</text>
</svg>`;

// Maskable version with 15% safe padding background
const maskableSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F4C3A"/>
      <stop offset="50%" stop-color="#09382B"/>
      <stop offset="100%" stop-color="#041B15"/>
    </linearGradient>

    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFEBB0"/>
      <stop offset="35%" stop-color="#F3D370"/>
      <stop offset="70%" stop-color="#D4AF37"/>
      <stop offset="100%" stop-color="#997A15"/>
    </linearGradient>

    <linearGradient id="trunkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#F3D370"/>
      <stop offset="100%" stop-color="#A68322"/>
    </linearGradient>
  </defs>

  <!-- Full Bleed Square Background for Maskable Icon -->
  <rect width="512" height="512" fill="url(#bgGrad)"/>

  <!-- Scaled down 80% to fit within the Android maskable Safe Zone -->
  <g transform="translate(51.2, 51.2) scale(0.8)">
    <rect x="20" y="20" width="472" height="472" rx="96" fill="none" stroke="url(#goldGrad)" stroke-width="4" stroke-opacity="0.5"/>

    <g transform="translate(256, 230)">
      <path d="M -30,135 Q -60,165 -110,180 M -15,140 Q -30,175 -50,195 M 0,140 L 0,195 M 15,140 Q 30,175 50,195 M 30,135 Q 60,165 110,180" fill="none" stroke="url(#goldGrad)" stroke-width="6" stroke-linecap="round" opacity="0.85"/>
      <path d="M -24,140 C -24,95 -14,50 0,0 C 14,50 24,95 24,140 Z" fill="url(#trunkGrad)"/>

      <path d="M 0,20 C -45,-15 -85,-25 -135,-45" fill="none" stroke="url(#goldGrad)" stroke-width="12" stroke-linecap="round"/>
      <path d="M 0,20 C 45,-15 85,-25 135,-45" fill="none" stroke="url(#goldGrad)" stroke-width="12" stroke-linecap="round"/>
      <path d="M 0,0 C 0,-50 0,-90 0,-125" fill="none" stroke="url(#goldGrad)" stroke-width="14" stroke-linecap="round"/>

      <path d="M -65,-25 C -95,-55 -125,-65 -155,-105" fill="none" stroke="url(#goldGrad)" stroke-width="8" stroke-linecap="round"/>
      <path d="M 65,-25 C 95,-55 125,-65 155,-105" fill="none" stroke="url(#goldGrad)" stroke-width="8" stroke-linecap="round"/>

      <path d="M -20,-65 C -45,-95 -55,-125 -75,-155" fill="none" stroke="url(#goldGrad)" stroke-width="8" stroke-linecap="round"/>
      <path d="M 20,-65 C 45,-95 55,-125 75,-155" fill="none" stroke="url(#goldGrad)" stroke-width="8" stroke-linecap="round"/>

      <circle cx="0" cy="-135" r="26" fill="#FDFBF7" stroke="url(#goldGrad)" stroke-width="6"/>
      <circle cx="0" cy="-135" r="13" fill="#0F4C3A"/>

      <circle cx="-135" cy="-45" r="22" fill="#FDFBF7" stroke="url(#goldGrad)" stroke-width="5"/>
      <circle cx="-135" cy="-45" r="10" fill="#0F4C3A"/>

      <circle cx="135" cy="-45" r="22" fill="#FDFBF7" stroke="url(#goldGrad)" stroke-width="5"/>
      <circle cx="135" cy="-45" r="10" fill="#0F4C3A"/>

      <circle cx="-155" cy="-105" r="17" fill="#FDFBF7" stroke="url(#goldGrad)" stroke-width="4.5"/>
      <circle cx="-75" cy="-155" r="17" fill="#FDFBF7" stroke="url(#goldGrad)" stroke-width="4.5"/>
      <circle cx="75" cy="-155" r="17" fill="#FDFBF7" stroke="url(#goldGrad)" stroke-width="4.5"/>
      <circle cx="155" cy="-105" r="17" fill="#FDFBF7" stroke="url(#goldGrad)" stroke-width="4.5"/>

      <path d="M -135,-45 Q -165,-65 -155,-25 Z" fill="url(#goldGrad)"/>
      <path d="M 135,-45 Q 165,-65 155,-25 Z" fill="url(#goldGrad)"/>
      <path d="M 0,-135 Q -28,-170 0,-182 Q 28,-170 0,-135 Z" fill="url(#goldGrad)"/>
    </g>

    <text x="256" y="450" font-family="'Cairo', 'Segoe UI', sans-serif" font-size="42" font-weight="900" fill="#FDFBF7" text-anchor="middle" letter-spacing="1">شجرة العائلة</text>
  </g>
</svg>`;

async function main() {
  const publicDir = path.resolve(process.cwd(), 'public');

  // Save SVG
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent, 'utf-8');

  // Generate PNGs using Sharp
  const svgBuffer = Buffer.from(svgContent);
  const maskableSvgBuffer = Buffer.from(maskableSvgContent);

  // 1. pwa-512x512.png
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));

  // 2. pwa-192x192.png
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));

  // 3. apple-touch-icon.png (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  // 4. pwa-maskable-512x512.png
  await sharp(maskableSvgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));

  // 5. favicon.png
  await sharp(svgBuffer)
    .resize(64, 64)
    .png()
    .toFile(path.join(publicDir, 'favicon.png'));

  console.log('Successfully generated all PWA PNG icons!');
}

main().catch(console.error);
