const fs = require('fs');
const path = require('path');

const version = require('./package.json').version;
const distDirectory = path.join(__dirname, 'dist');
const sourceFile = path.join(distDirectory, `Layali Setup ${version}.exe`);
const targetFile = path.join(distDirectory, `Layali Remote Setup ${version}.exe`);
const sourceBlockmap = `${sourceFile}.blockmap`;
const targetBlockmap = `${targetFile}.blockmap`;

if (fs.existsSync(sourceFile)) {
  if (fs.existsSync(targetFile)) {
    fs.unlinkSync(targetFile);
  }
  fs.renameSync(sourceFile, targetFile);
}

if (fs.existsSync(sourceBlockmap)) {
  if (fs.existsSync(targetBlockmap)) {
    fs.unlinkSync(targetBlockmap);
  }
  fs.renameSync(sourceBlockmap, targetBlockmap);
}

console.log(`remote installer renamed to: ${targetFile}`);