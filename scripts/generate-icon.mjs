import pkg from '../apps/desktop/node_modules/playwright-core/index.js';
const { chromium } = pkg;
import { writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';

const sizes = [16, 32, 48, 64, 128, 256, 512];
const svgPath = resolve('apps/desktop/resources/icon-mark.svg');
const svg = readFileSync(svgPath, 'utf-8');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; padding: 0; }
            svg { display: block; width: 100%; height: 100%; }
          </style>
        </head>
        <body>${svg}</body>
      </html>
    `);
    const buffer = await page.screenshot({ type: 'png' });
    const outPath = resolve(`apps/desktop/resources/icon-${size}x${size}.png`);
    writeFileSync(outPath, buffer);
    console.log(`✓ Generated ${outPath}`);
  }

  await browser.close();
  console.log('All PNG files generated successfully.');
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
