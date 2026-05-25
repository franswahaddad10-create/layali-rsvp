const fs = require('fs');
const path = require('path');

const mode = process.argv[2] || 'embedded';
const apiBaseUrl = process.argv[3] || 'http://127.0.0.1:5000/api';

const configByMode = {
  embedded: {
    mode: 'embedded',
    startEmbeddedBackend: true,
    apiBaseUrl: 'http://127.0.0.1:5000/api',
  },
  remote: {
    mode: 'remote',
    startEmbeddedBackend: false,
    apiBaseUrl,
  },
};

if (!configByMode[mode]) {
  throw new Error(`Unsupported desktop build mode: ${mode}`);
}

const outputPath = path.join(__dirname, 'build-config.json');
fs.writeFileSync(outputPath, `${JSON.stringify(configByMode[mode], null, 2)}\n`, 'utf8');
console.log(`desktop build config written: ${outputPath}`);