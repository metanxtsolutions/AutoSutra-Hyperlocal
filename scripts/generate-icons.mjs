/**
 * Renders the web app icons (public/icons) and Android launcher icons from the AutoSutra mark.
 *   PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium node scripts/generate-icons.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const mark = (scale) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${scale}" height="${scale}">
  <path d="M16 2c-6.1 0-11 4.8-11 10.8C5 21 16 30 16 30s11-9 11-17.2C27 6.8 22.1 2 16 2z" fill="#f59e0b"/>
  <path d="M11 20c2-3 3-5 5-8s3-4 5-4" stroke="#0f1b31" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M13.5 16.5l1.2.6M16 12.6l1.2.6" stroke="#fffbeb" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;

// size: output pixels; inner: share of the canvas the mark occupies (maskable icons keep to the 80% safe zone).
const icons = [
  { file: "icon-192.png", size: 192, inner: 0.72, radius: 0.22 },
  { file: "icon-512.png", size: 512, inner: 0.72, radius: 0.22 },
  { file: "maskable-512.png", size: 512, inner: 0.56, radius: 0 },
  { file: "apple-touch-icon.png", size: 180, inner: 0.7, radius: 0 },
];

// Android launcher icons (legacy square icons per density) and the adaptive icon foreground.
const res = "android/app/src/main/res";
for (const [dir, size] of [["mipmap-mdpi", 48], ["mipmap-hdpi", 72], ["mipmap-xhdpi", 96], ["mipmap-xxhdpi", 144], ["mipmap-xxxhdpi", 192]]) {
  icons.push({ file: `${dir}/ic_launcher.png`, size, inner: 0.72, radius: 0.22, out: res });
}
// Adaptive icons are cropped to a circle or squircle: keep the mark inside the central 66%.
icons.push({ file: "drawable-nodpi/ic_launcher_foreground.png", size: 432, inner: 0.42, radius: 0, out: res, transparent: true });

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const i of icons) {
  await page.setViewportSize({ width: i.size, height: i.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">
    <div style="width:${i.size}px;height:${i.size}px;background:${i.transparent ? "transparent" : "#0f1b31"};border-radius:${i.radius * i.size}px;display:flex;align-items:center;justify-content:center">
      ${mark(Math.round(i.size * i.inner))}
    </div></body></html>`);
  const file = `${i.out ?? "public/icons"}/${i.file}`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: i.size, height: i.size } }));
}
await browser.close();
console.log("Icons written to public/icons and android/app/src/main/res");
