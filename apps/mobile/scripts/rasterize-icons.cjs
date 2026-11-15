// Rasterizes kit SVGs that Expo needs as PNG (monochrome adaptive layer, notification icon, splash
// symbol). Run: node scripts/rasterize-icons.cjs (uses sharp from the workspace).
const sharp = require('sharp');
const kit = require('path').join(__dirname, '../../../Bora-Marca-Kit');
const out = require('path').join(__dirname, '../assets/images');
const fs = require('fs');
async function framed(svgPath, canvas, symbolHeight, dest) {
  const sym = await sharp(fs.readFileSync(svgPath), { density: 600 })
    .resize({ height: symbolHeight })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: sym, gravity: 'center' }])
    .png()
    .toFile(dest);
}
(async () => {
  // Same framing as android-adaptive-foreground.png (symbol ~550/1024 tall).
  await framed(
    `${kit}/03-icones/android-monochrome.svg`,
    1024,
    550,
    `${out}/adaptive-monochrome.png`,
  );
  await framed(`${kit}/03-icones/android-monochrome.svg`, 96, 72, `${out}/notification-icon.png`);
  await framed(`${kit}/01-marca/svg/simbolo-cor.svg`, 1024, 720, `${out}/splash-icon.png`);
})();
