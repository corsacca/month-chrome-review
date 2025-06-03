const fs = require('fs');
const path = require('path');

function createSVGIcon(size) {
  const svg = `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#4299e1"/>
  <rect x="${size * 0.2}" y="${size * 0.6}" width="${size * 0.125}" height="${size * 0.24}" fill="white"/>
  <rect x="${size * 0.4}" y="${size * 0.28}" width="${size * 0.125}" height="${size * 0.52}" fill="white"/>
  <rect x="${size * 0.6}" y="${size * 0.44}" width="${size * 0.125}" height="${size * 0.36}" fill="white"/>
  <circle cx="${size * 0.85}" cy="${size * 0.15}" r="${size * 0.08}" fill="white"/>
</svg>`.trim();

  return svg;
}

// Create icons directory if it doesn't exist
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir);
}

// Generate SVG icons (since we can't easily generate PNG without additional dependencies)
const sizes = [16, 48, 128];
sizes.forEach(size => {
  const svg = createSVGIcon(size);
  const filename = path.join(iconsDir, `icon${size}.svg`);
  fs.writeFileSync(filename, svg);
  console.log(`Created ${filename}`);
});

console.log('Icons generated! Note: Chrome extensions prefer PNG format.');
console.log('For production, convert these SVGs to PNG files or use an online converter.');
console.log('Alternatively, use the create_icons.html file in a browser to generate PNG icons.'); 