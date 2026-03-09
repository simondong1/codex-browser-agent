const { app, BrowserWindow, BrowserView, ipcMain, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const { DEFAULT_HOME, normalizeUrl, boundTabCount, sanitizeNames } = require('./lib/browserCore');

const STORE_DIR = path.join(app.getPath('userData'), 'store');
const HISTORY_FILE = path.join(STORE_DIR, 'history.json');
const SETTINGS_FILE = path.join(STORE_DIR, 'settings.json');
const CREDS_FILE = path.join(STORE_DIR, 'credentials.json');

const SIDEBAR_WIDTH = 360;

let mainWindow;
let tabs = [];
let activeTabId = null;
let tabCounter = 1;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureStore() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureStore();
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function encryptText(text) {
  if (!text) return '';
  if (!safeStorage.isEncryptionAvailable()) return Buffer.from(text, 'utf8').toString('base64');
  return safeStorage.encryptString(text).toString('base64');
}

function decryptText(text) {
  if (!text) return '';
  if (!safeStorage.isEncryptionAvailable()) return Buffer.from(text, 'base64').toString('utf8');
  return safeStorage.decryptString(Buffer.from(text, 'base64'));
}

function getHistory() {
  return readJson(HISTORY_FILE, []);
}

function addHistoryItem(item) {
  const history = getHistory();
  history.unshift({
    url: item.url,
    title: item.title || item.url,
    ts: new Date().toISOString()
  });
  writeJson(HISTORY_FILE, history.slice(0, 2000));
}

function getSettings() {
  return readJson(SETTINGS_FILE, {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    apiKeyEnc: ''
  });
}

function updateSettings(next) {
  const merged = { ...getSettings(), ...next };
  writeJson(SETTINGS_FILE, merged);
  return merged;
}

function getCredentials() {
  return readJson(CREDS_FILE, {});
}

function saveCredential(origin, username, password) {
  const creds = getCredentials();
  creds[origin] = {
    username: encryptText(username),
    password: encryptText(password),
    updatedAt: new Date().toISOString()
  };
  writeJson(CREDS_FILE, creds);
}

function readCredential(origin) {
  const c = getCredentials()[origin];
  if (!c) return null;
  return {
    username: decryptText(c.username),
    password: decryptText(c.password)
  };
}

function getActiveTab() {
  return tabs.find((t) => t.id === activeTabId) || null;
}

function tabMeta(tab) {
  return {
    id: tab.id,
    title: tab.title || 'New Tab',
    url: tab.url || '',
    canGoBack: tab.view.webContents.canGoBack(),
    canGoForward: tab.view.webContents.canGoForward()
  };
}

function emitToRenderer(channel, payload) {
  if (!mainWindow) return;
  mainWindow.webContents.send(channel, payload);
}

function emitTabsState() {
  emitToRenderer('tabs:state', {
    tabs: tabs.map(tabMeta),
    activeTabId
  });
}

function emitManeuver(event) {
  emitToRenderer('agent:maneuver', {
    ts: new Date().toISOString(),
    ...event
  });
}

function layout() {
  if (!mainWindow) return;
  const [width, height] = mainWindow.getContentSize();
  const topBarHeight = 78;
  const webWidth = Math.max(240, width - SIDEBAR_WIDTH);
  const webHeight = Math.max(120, height - topBarHeight);

  const active = getActiveTab();
  if (active) {
    active.view.setBounds({ x: 0, y: topBarHeight, width: webWidth, height: webHeight });
    active.view.setAutoResize({ width: true, height: true });
  }

  emitToRenderer('layout:changed', {
    width,
    height,
    sidebarWidth: SIDEBAR_WIDTH
  });
}

function attachView(tab) {
  const active = getActiveTab();
  if (active?.view) {
    try {
      mainWindow.removeBrowserView(active.view);
    } catch {}
  }

  mainWindow.addBrowserView(tab.view);
  activeTabId = tab.id;
  layout();
  emitTabsState();
}

async function autoFillCredentials(webContents, username, password) {
  const script = `
    (() => {
      const userSelectors = [
        'input[type="email"]',
        'input[name*="user" i]',
        'input[id*="user" i]',
        'input[name*="email" i]',
        'input[id*="email" i]',
        'input[type="text"]'
      ];
      const passSelectors = ['input[type="password"]'];

      function findVisible(selectors) {
        for (const sel of selectors) {
          const elements = Array.from(document.querySelectorAll(sel));
          for (const element of elements) {
            const style = window.getComputedStyle(element);
            if (style.display !== 'none' && style.visibility !== 'hidden' && !element.disabled) {
              return element;
            }
          }
        }
        return null;
      }

      const user = findVisible(userSelectors);
      const pass = findVisible(passSelectors);

      if (user) {
        user.focus();
        user.value = ${JSON.stringify(username)};
        user.dispatchEvent(new Event('input', { bubbles: true }));
        user.dispatchEvent(new Event('change', { bubbles: true }));
      }

      if (pass) {
        pass.focus();
        pass.value = ${JSON.stringify(password)};
        pass.dispatchEvent(new Event('input', { bubbles: true }));
        pass.dispatchEvent(new Event('change', { bubbles: true }));
      }

      return { filledUser: !!user, filledPass: !!pass };
    })();
  `;

  try {
    return await webContents.executeJavaScript(script, true);
  } catch {
    return { filledUser: false, filledPass: false };
  }
}

function createTab(inputUrl = DEFAULT_HOME, inBackground = false) {
  const url = normalizeUrl(inputUrl);
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
      javascript: true
    }
  });

  const tab = {
    id: tabCounter++,
    view,
    title: 'New Tab',
    url
  };

  view.webContents.on('page-title-updated', (_event, title) => {
    tab.title = title;
    emitTabsState();
  });

  view.webContents.on('did-navigate', (_event, navUrl) => {
    tab.url = navUrl;
    addHistoryItem({ url: navUrl, title: tab.title });
    emitTabsState();
  });

  view.webContents.on('did-navigate-in-page', (_event, navUrl) => {
    tab.url = navUrl;
    emitTabsState();
  });

  view.webContents.on('did-finish-load', async () => {
    const current = view.webContents.getURL();
    if (!current) return;

    try {
      const origin = new URL(current).origin;
      const cred = readCredential(origin);
      if (cred) {
        await autoFillCredentials(view.webContents, cred.username, cred.password);
      }
    } catch {}
  });

  tabs.push(tab);
  view.webContents.loadURL(url);

  if (!inBackground || !activeTabId) {
    attachView(tab);
  } else {
    emitTabsState();
  }

  return tab;
}

function closeTab(id) {
  const idx = tabs.findIndex((tab) => tab.id === id);
  if (idx === -1) return;

  const [tab] = tabs.splice(idx, 1);
  try {
    if (mainWindow.getBrowserView() === tab.view) {
      mainWindow.removeBrowserView(tab.view);
    }
    tab.view.webContents.destroy();
  } catch {}

  if (!tabs.length) {
    activeTabId = null;
    createTab(DEFAULT_HOME);
    return;
  }

  if (id === activeTabId) {
    const fallback = tabs[Math.max(0, idx - 1)] || tabs[0];
    attachView(fallback);
  } else {
    emitTabsState();
  }
}

async function handleAgentAction(action, args = {}, meta = {}) {
  emitManeuver({
    requestId: meta.requestId,
    toolCallId: meta.toolCallId,
    phase: 'start',
    action,
    args
  });

  let result;

  switch (action) {
    case 'open_webpage': {
      const url = normalizeUrl(args.url);
      createTab(url, !!args.background);
      result = { ok: true, message: `Opened ${url}` };
      break;
    }

    case 'open_many_tabs': {
      const count = boundTabCount(args.count, 1, 30);
      const url = normalizeUrl(args.url || DEFAULT_HOME);
      for (let i = 0; i < count; i += 1) {
        const tab = createTab(url, false);
        attachView(tab);
        await sleep(180);
      }
      result = { ok: true, message: `Opened ${count} visible tabs for ${url}` };
      break;
    }

    case 'search_people': {
      const names = sanitizeNames(args.names, 20);
      if (!names.length) {
        result = { ok: false, message: 'No names provided' };
        break;
      }

      for (const name of names) {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(name)}`;
        const tab = createTab(searchUrl, false);
        attachView(tab);
        await sleep(180);
      }

      result = { ok: true, message: `Opened ${names.length} visible search tabs` };
      break;
    }

    case 'save_credentials': {
      const active = getActiveTab();
      if (!active) {
        result = { ok: false, message: 'No active tab' };
        break;
      }

      if (!args.username || !args.password) {
        result = { ok: false, message: 'Missing username or password' };
        break;
      }

      const origin = new URL(active.view.webContents.getURL()).origin;
      saveCredential(origin, args.username, args.password);
      result = { ok: true, message: `Saved credentials for ${origin}` };
      break;
    }

    case 'fill_credentials': {
      const active = getActiveTab();
      if (!active) {
        result = { ok: false, message: 'No active tab' };
        break;
      }

      let credential = null;
      const currentUrl = active.view.webContents.getURL();
      if (args.username && args.password) {
        credential = { username: args.username, password: args.password };
      } else {
        try {
          credential = readCredential(new URL(currentUrl).origin);
        } catch {
          credential = null;
        }
      }

      if (!credential) {
        result = { ok: false, message: 'No credentials found for this site' };
        break;
      }

      const fill = await autoFillCredentials(active.view.webContents, credential.username, credential.password);
      result = { ok: true, message: `Fill result: user=${fill.filledUser}, pass=${fill.filledPass}` };
      break;
    }

    case 'navigate': {
      const active = getActiveTab();
      if (!active) {
        result = { ok: false, message: 'No active tab' };
        break;
      }

      const target = normalizeUrl(args.url);
      active.view.webContents.loadURL(target);
      result = { ok: true, message: `Navigating to ${target}` };
      break;
    }

    default:
      result = { ok: false, message: `Unknown action: ${action}` };
  }

  emitManeuver({
    requestId: meta.requestId,
    toolCallId: meta.toolCallId,
    phase: 'end',
    action,
    args,
    result
  });

  return result;
}

function registerIpc() {
  ipcMain.handle('tabs:new', (_event, url) => tabMeta(createTab(url || DEFAULT_HOME, false)));

  ipcMain.handle('tabs:switch', (_event, id) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return null;
    attachView(tab);
    return tabMeta(tab);
  });

  ipcMain.handle('tabs:close', (_event, id) => {
    closeTab(id);
    return true;
  });

  ipcMain.handle('tabs:navigate', (_event, { id, url }) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return false;
    tab.view.webContents.loadURL(normalizeUrl(url));
    return true;
  });

  ipcMain.handle('tabs:control', (_event, { id, cmd }) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return false;
    if (cmd === 'back' && tab.view.webContents.canGoBack()) tab.view.webContents.goBack();
    if (cmd === 'forward' && tab.view.webContents.canGoForward()) tab.view.webContents.goForward();
    if (cmd === 'reload') tab.view.webContents.reload();
    if (cmd === 'stop') tab.view.webContents.stop();
    return true;
  });

  ipcMain.handle('history:list', () => getHistory());

  ipcMain.handle('settings:get', () => {
    const settings = getSettings();
    return {
      provider: settings.provider,
      model: settings.model,
      hasApiKey: !!settings.apiKeyEnc
    };
  });

  ipcMain.handle('settings:save', (_event, payload) => {
    const current = getSettings();
    const next = {
      provider: payload.provider || 'openai',
      model: payload.model || 'gpt-4.1-mini',
      apiKeyEnc: payload.apiKey ? encryptText(payload.apiKey) : current.apiKeyEnc
    };
    updateSettings(next);
    return { ok: true, hasApiKey: !!next.apiKeyEnc };
  });

  ipcMain.handle('openai:request', async (_event, payload) => {
    const settings = getSettings();
    const apiKey = payload.apiKey || decryptText(settings.apiKeyEnc);
    const model = payload.model || settings.model || 'gpt-4.1-mini';

    if (!apiKey) return { ok: false, error: 'No OpenAI API key configured' };

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: payload.messages,
          tools: payload.tools,
          tool_choice: payload.tool_choice || 'auto'
        })
      });

      if (!response.ok) {
        const text = await response.text();
        return { ok: false, error: `OpenAI request failed: ${response.status} ${text}` };
      }

      return { ok: true, data: await response.json() };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle('agent:action', (_event, { action, args, meta }) => handleAgentAction(action, args, meta));

  ipcMain.handle('credentials:save-direct', (_event, payload) => {
    if (!payload.origin || !payload.username || !payload.password) {
      return { ok: false, message: 'origin, username, password required' };
    }
    saveCredential(payload.origin, payload.username, payload.password);
    return { ok: true };
  });

  ipcMain.handle('credentials:list-sites', () => Object.keys(getCredentials()));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1560,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      spellcheck: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('resize', layout);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createTab(DEFAULT_HOME);
}

app.whenReady().then(() => {
  ensureStore();
  registerIpc();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
