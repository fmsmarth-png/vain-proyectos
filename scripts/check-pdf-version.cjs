const expected = '4.10.38';
const actual = require('pdfjs-dist/package.json').version;
if (actual !== expected) {
  console.error(`\n❌ pdfjs-dist es ${actual} pero debe ser ${expected}`);
  console.error('   Ejecuta: rm -rf node_modules package-lock.json && npm install\n');
  process.exit(1);
}
console.log(`✓ pdfjs-dist ${actual} OK`);
