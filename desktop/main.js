const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

const isPackaged = app.isPackaged;
const defaultDesktopConfig = {
  mode: 'embedded',
  startEmbeddedBackend: true,
  apiBaseUrl: 'http://127.0.0.1:5000/api',
};

const resolveBackendPath = (...segments) => {
  const basePath = isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, '..', 'backend');

  return path.join(basePath, ...segments);
};

const resolveFrontendPath = (...segments) => {
  const basePath = isPackaged
    ? path.join(process.resourcesPath, 'frontend-build')
    : path.join(__dirname, '..', 'frontend', 'build');

  return path.join(basePath, ...segments);
};

const resolveDesktopConfigPath = () => {
  if (isPackaged) {
    return path.join(process.resourcesPath, 'app-config.json');
  }

  return path.join(__dirname, 'build-config.json');
};

const loadDesktopConfig = () => {
  const configPath = resolveDesktopConfigPath();
  try {
    if (!fs.existsSync(configPath)) {
      return defaultDesktopConfig;
    }

    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
      ...defaultDesktopConfig,
      ...parsed,
    };
  } catch (error) {
    throw new Error(`Failed to read desktop config from ${configPath}: ${error.message}`);
  }
};

const startEmbeddedBackend = () => {
  const backendDirectory = resolveBackendPath();
  const envPath = path.join(backendDirectory, '.env');

  process.chdir(backendDirectory);
  process.env.ELECTRON_DESKTOP_APP = 'true';
  process.env.ALLOWED_ORIGINS = [process.env.ALLOWED_ORIGINS, 'null']
    .filter(Boolean)
    .join(',');

  if (!process.env.DOTENV_CONFIG_PATH) {
    process.env.DOTENV_CONFIG_PATH = envPath;
  }

  require(resolveBackendPath('src', 'server.js'));
};

const createMainWindow = async (desktopConfig) => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#161312',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [
        `--desktop-api-base-url=${desktopConfig.apiBaseUrl}`,
        `--desktop-mode=${desktopConfig.mode}`,
      ],
    },
  });

  const indexPath = resolveFrontendPath('index.html');
  await mainWindow.loadFile(indexPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(async () => {
  try {
    const desktopConfig = loadDesktopConfig();
    if (desktopConfig.startEmbeddedBackend) {
      startEmbeddedBackend();
    }
    await createMainWindow(desktopConfig);
  } catch (error) {
    dialog.showErrorBox('Desktop App Startup Failed', error.stack || error.message || String(error));
    app.quit();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const desktopConfig = loadDesktopConfig();
      await createMainWindow(desktopConfig);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});