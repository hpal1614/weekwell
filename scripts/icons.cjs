// Regenerate the PNG app icons from the SVG design (needs Playwright): node scripts/icons.cjs
const { chromium } = require('playwright');
const path = require('node:path');

const out = path.join(__dirname, '..', 'src', 'icons');
const arrow = '<path d="M178 334 334 178M206 178h128v128" fill="none" stroke="#c9f36a" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>';
// Rounded icon for browsers; full-bleed for iOS (it rounds corners itself) and Android "maskable"
// (artwork kept inside the central safe zone).
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#234c39"/>${arrow}</svg>`;
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#234c39"/>${arrow}</svg>`;
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#234c39"/><g transform="translate(51 51) scale(.8)">${arrow}</g></svg>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, svg, size] of [
    ['icon-192.png', rounded, 192], ['icon-512.png', rounded, 512],
    ['icon-maskable-512.png', maskable, 512], ['apple-touch-icon.png', square, 180],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
    await page.screenshot({ path: path.join(out, name), omitBackground: true });
    console.log('wrote', name);
  }
  await browser.close();
})();
