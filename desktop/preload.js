const { contextBridge } = require('electron');

const readArgumentValue = (prefix) => {
  const argument = process.argv.find((entry) => entry.startsWith(prefix));
  if (!argument) {
    return '';
  }

  return argument.slice(prefix.length);
};

contextBridge.exposeInMainWorld('desktopApp', {
  isDesktop: true,
  apiBaseUrl: readArgumentValue('--desktop-api-base-url='),
  mode: readArgumentValue('--desktop-mode='),
});