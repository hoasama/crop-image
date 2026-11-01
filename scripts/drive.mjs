// Drives the running dev server (http://localhost:5190) with Playwright:
// generates a synthetic sample image, uploads it, screenshots the popup,
// confirms the crop, and screenshots the result. Run: node scripts/drive.mjs
import { chromium } from 'playwright';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_URL = process.env.APP_URL || 'http://localhost:5190/';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

// 1. Build a sample PNG (ink on a background) with wide margins.
//    BG env: white (#fff) | offwhite (#ebebeb scan) | transparent
const BG = process.env.BG || 'offwhite';
const dataUrl = await page.evaluate((bg) => {
  const c = document.createElement('canvas');
  c.width = 500;
  c.height = 300;
  const ctx = c.getContext('2d');
  if (bg === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 500, 300);
  } else if (bg === 'offwhite') {
    ctx.fillStyle = '#ebebeb'; // luminance 235 — the bug case
    ctx.fillRect(0, 0, 500, 300);
  } // transparent: leave canvas cleared (alpha 0)
  ctx.strokeStyle = '#102040';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(180, 170);
  ctx.bezierCurveTo(210, 110, 250, 220, 290, 150);
  ctx.bezierCurveTo(320, 100, 300, 200, 340, 160);
  ctx.stroke();
  ctx.font = 'italic 28px cursive';
  ctx.fillStyle = '#102040';
  ctx.fillText('Hoa', 200, 210);
  return c.toDataURL('image/png');
}, BG);
const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');

// 2. Load the app. Each preset now has its own demo section; scope to one.
await page.goto(APP_URL, { waitUntil: 'networkidle' });
const PURPOSE = process.env.PURPOSE || 'signature'; // signature | document | thumbnail
const section = page.locator('section.demo', {
  hasText: `purpose="${PURPOSE}"`,
});
await section.locator('input[type=file]').setInputFiles({
  name: 'sig.png',
  mimeType: 'image/png',
  buffer,
});
console.log(`uploaded into demo: ${PURPOSE}`);

// 3. Popup should appear automatically (antd Modal is global).
await page.getByText('Cắt ảnh', { exact: true }).waitFor({ timeout: 8000 });
await page.waitForTimeout(800); // let cropper settle
await page.screenshot({ path: join(OUT, `shot-modal-${PURPOSE}-${BG}.png`) });
console.log(`modal screenshot written (${PURPOSE}, bg=${BG})`);

// 3b. Optionally toggle transparency to verify the plain<->keyed preview swap.
if (process.env.TOGGLE) {
  await page.locator('.ant-switch').click();
  await page.waitForTimeout(800); // let the keyed preview build + settle
  await page.screenshot({ path: join(OUT, `shot-modal-${PURPOSE}-${BG}-on.png`) });
  console.log(`modal-on screenshot written (${PURPOSE}, bg=${BG})`);
}

// 4. Confirm with the auto crop box, then capture the result.
await page.getByRole('button', { name: 'Xác nhận' }).click();
await section.locator('.result .checkerboard img').waitFor({ timeout: 8000 });
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, `shot-result-${PURPOSE}-${BG}.png`) });
console.log(`result screenshot written (${PURPOSE}, bg=${BG})`);

// 5. Report what the `done` event actually emitted (type + size).
const emitted = await section.locator('.emitted h3').textContent();
console.log(`emitted: ${emitted?.trim()}`);

await browser.close();
