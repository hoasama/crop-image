// Reproduce the REAL user path: click the dragger -> OS file chooser ->
// pick a file -> does the popup appear WITHOUT any extra click?
import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL || 'http://localhost:5190/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

page.on('console', (m) => console.log('  [page]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

const dataUrl = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 500;
  c.height = 300;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 500, 300);
  ctx.fillStyle = '#102040';
  ctx.font = '40px serif';
  ctx.fillText('Hoa', 200, 170);
  return c.toDataURL('image/png');
});
const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');

await page.goto(APP_URL, { waitUntil: 'networkidle' });

const inputsBefore = await page.locator('input[type=file]').count();

// Click the dragger and capture the native file chooser it opens.
const [chooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.getByText('Kéo thả hoặc bấm').click(),
]);
await chooser.setFiles({ name: 'sig.png', mimeType: 'image/png', buffer });

await page.waitForTimeout(1500);

const evidence = await page.evaluate(() => ({
  inputs: document.querySelectorAll('input[type=file]').length,
  modal: !!document.querySelector('.ant-modal'),
  messages: [...document.querySelectorAll('.ant-message-notice')].map(
    (n) => n.textContent,
  ),
}));
console.log('inputsBefore =', inputsBefore);
console.log('evidence =', JSON.stringify(evidence));
await page.screenshot({ path: 'repro-click.png' });

await browser.close();
