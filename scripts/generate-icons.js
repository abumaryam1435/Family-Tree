import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function generateAllAppIcons() {
  const sourcePath = 'Tree Logo.png';
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Tree Logo.png not found at project root');
  }

  const publicDir = 'public';
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  console.log('Generating all app icons and manifest from Tree Logo.png...');

  // 1. Master copy to public/tree-logo.png (512x512 high fidelity)
  await sharp(sourcePath)
    .resize(512, 512, { fit: 'cover' })
    .png({ quality: 100, compressionLevel: 8 })
    .toFile(path.join(publicDir, 'tree-logo.png'));
  console.log('Created public/tree-logo.png (512x512)');

  // 2. Standard PWA 512x512 (purpose: any)
  const pwa512Buffer = await sharp(sourcePath)
    .resize(512, 512, { fit: 'cover' })
    .png({ quality: 100, compressionLevel: 8 })
    .toBuffer();
  fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), pwa512Buffer);
  console.log('Created public/pwa-512x512.png (512x512)');

  // 3. Standard PWA 192x192 (purpose: any)
  await sharp(sourcePath)
    .resize(192, 192, { fit: 'cover' })
    .png({ quality: 100, compressionLevel: 8 })
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('Created public/pwa-192x192.png (192x192)');

  // 4. iOS Safari apple-touch-icon (180x180)
  await sharp(sourcePath)
    .resize(180, 180, { fit: 'cover' })
    .png({ quality: 100, compressionLevel: 8 })
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Created public/apple-touch-icon.png (180x180)');

  // 5. Browser Favicons (64x64 and 32x32)
  await sharp(sourcePath)
    .resize(64, 64, { fit: 'cover' })
    .png({ quality: 100, compressionLevel: 8 })
    .toFile(path.join(publicDir, 'favicon.png'));
  console.log('Created public/favicon.png (64x64)');

  await sharp(sourcePath)
    .resize(32, 32, { fit: 'cover' })
    .png({ quality: 100, compressionLevel: 8 })
    .toFile(path.join(publicDir, 'favicon-32x32.png'));
  console.log('Created public/favicon-32x32.png (32x32)');

  // 6. Maskable PWA 512x512 (purpose: maskable)
  // For Android maskable icons, the emblem should stay within the inner 80% circle
  const innerLogo = await sharp(sourcePath)
    .resize(410, 410, { fit: 'contain' })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 11, g: 61, b: 46, alpha: 1 } // #0B3D2E dark emerald matching logo border
    }
  })
    .composite([
      {
        input: innerLogo,
        top: 51,
        left: 51
      }
    ])
    .png({ quality: 100, compressionLevel: 8 })
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));
  console.log('Created public/pwa-maskable-512x512.png (512x512 with safe area margin)');

  // 7. OG Social Share Image (1200x630)
  const ogCenterLogo = await sharp(sourcePath)
    .resize(460, 460, { fit: 'contain' })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 15, g: 76, b: 58, alpha: 1 } // #0F4C3A
    }
  })
    .composite([
      {
        input: ogCenterLogo,
        top: 85,
        left: 370
      }
    ])
    .png({ quality: 95 })
    .toFile(path.join(publicDir, 'og-image.png'));
  console.log('Created public/og-image.png (1200x630)');

  // 8. Vector SVG wrapper embedding the 512x512 PNG for pure SVG icon requests
  const base64Data = pwa512Buffer.toString('base64');
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <image href="data:image/png;base64,${base64Data}" width="512" height="512" />
</svg>`;
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent, 'utf-8');
  console.log('Created public/icon.svg with embedded high-res Tree Logo');

  // 9. Static public/manifest.json for Netlify and direct browser requests
  const manifestData = {
    id: '/',
    name: 'شجرة العائلة',
    short_name: 'شجرة العائلة',
    description: 'شجرة العائلة الموثقة وسجل الأنساب الرقمي',
    theme_color: '#0F4C3A',
    background_color: '#0F4C3A',
    display: 'standalone',
    orientation: 'any',
    start_url: '/',
    scope: '/',
    lang: 'ar',
    dir: 'rtl',
    icons: [
      {
        src: '/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  };
  fs.writeFileSync(path.join(publicDir, 'manifest.json'), JSON.stringify(manifestData, null, 2), 'utf-8');
  console.log('Created public/manifest.json');

  console.log('All icons and manifest successfully generated!');
}

generateAllAppIcons().catch(err => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
