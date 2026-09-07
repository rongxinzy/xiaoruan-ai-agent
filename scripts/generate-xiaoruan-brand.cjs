#!/usr/bin/env node
// Deterministic wordmark and platform icons for the custom edition.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const root = path.resolve(__dirname, '..');
const chineseFont = process.env.XIAORUAN_BRAND_FONT || '/System/Library/Fonts/STHeiti Medium.ttc';
if (!fs.existsSync(chineseFont) || !GlobalFonts.registerFromPath(chineseFont, 'XiaoruanBrand')) {
  throw new Error('Set XIAORUAN_BRAND_FONT to a Chinese font before regenerating brand assets.');
}
const output = (name, bytes) => {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
};

function icon(size, template = false) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!template) {
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.roundRect(size / 16, size / 16, (size * 7) / 8, (size * 7) / 8, size / 5);
    ctx.fill();
  }
  ctx.fillStyle = template ? '#000000' : '#ffffff';
  ctx.font = `bold ${size * 0.43}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('XR', size / 2, size * 0.53);
  return canvas.toBuffer('image/png');
}

function ico(sizes) {
  const images = sizes.map(size => icon(size));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const start = 6 + index * 16;
    header[start] = size === 256 ? 0 : size;
    header[start + 1] = header[start];
    header.writeUInt16LE(1, start + 4);
    header.writeUInt16LE(32, start + 6);
    header.writeUInt32LE(images[index].length, start + 8);
    header.writeUInt32LE(offset, start + 12);
    offset += images[index].length;
  });
  return Buffer.concat([header, ...images]);
}

for (const [theme, color] of [
  ['light', '#172033'],
  ['dark', '#f1f5f9'],
]) {
  output(
    `public/xiaoruan-logo-${theme}.svg`,
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="96" viewBox="0 0 600 96"><title>晓软AI智能体</title><text x="0" y="72" fill="${color}" font-family="system-ui,sans-serif" font-size="72" font-weight="600">晓软AI智能体</text></svg>\n`,
    ),
  );
  const canvas = createCanvas(1600, 300);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = '210px XiaoruanBrand';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('晓软AI智能体', 800, 150);
  output(`public/xiaoruan-logo-${theme}-1600.png`, canvas.toBuffer('image/png'));
}

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
for (const size of sizes) output(`build/icons/png/${size}x${size}.png`, icon(size));
output('build/icons/app-icon-master.png', icon(1024));
output('build/icons/png/mac-dev-dock.png', icon(512));
const windowsIcon = ico([16, 24, 32, 48, 64, 128, 256]);
for (const file of [
  'build/icons/win/icon.ico',
  'public/favicon.ico',
  'public/xiaoruan-icon-primary.ico',
  'resources/tray/tray-icon.ico',
])
  output(file, windowsIcon);
output('public/favicon.png', icon(64));
output('public/xiaoruan-icon-primary-32.png', icon(32));
output('resources/tray/tray-icon.png', icon(48));
for (const [suffix, size] of [
  ['', 18],
  ['@2x', 36],
]) {
  output(`resources/tray/tray-icon-mac${suffix}.png`, icon(size));
  output(`resources/tray/trayIconTemplate${suffix}.png`, icon(size, true));
}

// ICNS stores PNG representations in named chunks and is generated on any OS.
const chunks = [
  [16, 'icp4'],
  [32, 'icp5'],
  [64, 'icp6'],
  [128, 'ic07'],
  [256, 'ic08'],
  [512, 'ic09'],
  [1024, 'ic10'],
].map(([size, type]) => {
  const data = icon(size);
  const header = Buffer.alloc(8);
  header.write(type);
  header.writeUInt32BE(data.length + 8, 4);
  return Buffer.concat([header, data]);
});
const header = Buffer.alloc(8);
header.write('icns');
header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
output('build/icons/mac/icon.icns', Buffer.concat([header, ...chunks]));
execFileSync(process.execPath, [path.join(root, 'scripts/generate-nsis-brand-assets.cjs')], {
  stdio: 'inherit',
});
console.log('Generated Xiaoruan application, wordmark, tray and installer assets.');
