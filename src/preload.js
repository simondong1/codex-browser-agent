const { contextBridge, ipcRenderer } = require('electron');
const { TOOL_DEFINITIONS, parseToolArguments, buildSystemPrompt } = require('./lib/agentProtocol');

contextBridge.exposeInMainWorld('browserApi', {
  newTab: (url) => ipcRenderer.invoke('tabs:new', url),
  switchTab: (id) => ipcRenderer.invoke('tabs:switch', id),
  closeTab: (id) => ipcRenderer.invoke('tabs:close', id),
  navigate: (id, url) => ipcRenderer.invoke('tabs:navigate', { id, url }),
  controlTab: (id, cmd) => ipcRenderer.invoke('tabs:control', { id, cmd }),
  getHistory: () => ipcRenderer.invoke('history:list'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
  openaiRequest: (payload) => ipcRenderer.invoke('openai:request', payload),
  agentAction: (action, args, meta) => ipcRenderer.invoke('agent:action', { action, args, meta }),
  saveCredentialDirect: (payload) => ipcRenderer.invoke('credentials:save-direct', payload),
  listCredentialSites: () => ipcRenderer.invoke('credentials:list-sites'),
  onTabsState: (cb) => ipcRenderer.on('tabs:state', (_ev, data) => cb(data)),
  onLayoutChanged: (cb) => ipcRenderer.on('layout:changed', (_ev, data) => cb(data)),
  onAgentManeuver: (cb) => ipcRenderer.on('agent:maneuver', (_ev, data) => cb(data)),
  agentProtocol: {
    tools: TOOL_DEFINITIONS,
    parseToolArguments,
    buildSystemPrompt
  }
});
