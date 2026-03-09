const state = {
  tabs: [],
  activeTabId: null,
  settings: {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    hasApiKey: false
  },
  recognition: null,
  listening: false,
  maneuvers: []
};

const protocol = window.browserApi.agentProtocol;

const el = {
  backBtn: document.getElementById('backBtn'),
  forwardBtn: document.getElementById('forwardBtn'),
  reloadBtn: document.getElementById('reloadBtn'),
  newTabBtn: document.getElementById('newTabBtn'),
  goBtn: document.getElementById('goBtn'),
  urlInput: document.getElementById('urlInput'),
  tabs: document.getElementById('tabs'),
  chatLog: document.getElementById('chatLog'),
  maneuverLog: document.getElementById('maneuverLog'),
  agentText: document.getElementById('agentText'),
  sendBtn: document.getElementById('sendBtn'),
  micBtn: document.getElementById('micBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  settingsForm: document.getElementById('settingsForm'),
  providerSelect: document.getElementById('providerSelect'),
  modelInput: document.getElementById('modelInput'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  cancelSettings: document.getElementById('cancelSettings')
};

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  el.chatLog.appendChild(div);
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
}

function renderManeuvers() {
  el.maneuverLog.innerHTML = '';
  state.maneuvers.slice(-40).forEach((m) => {
    const item = document.createElement('div');
    item.className = `maneuver-item ${m.phase === 'start' ? 'running' : ''}`;

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = `${m.phase === 'start' ? 'Running' : 'Done'}: ${m.action}`;

    const detail = document.createElement('div');
    detail.className = 'detail';
    const base = m.phase === 'end' && m.result ? m.result.message || JSON.stringify(m.result) : JSON.stringify(m.args || {});
    detail.textContent = base;

    item.appendChild(title);
    item.appendChild(detail);
    el.maneuverLog.appendChild(item);
  });
  el.maneuverLog.scrollTop = el.maneuverLog.scrollHeight;
}

function setActiveTabInUrl() {
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  if (!active) return;
  el.urlInput.value = active.url || '';
  el.backBtn.disabled = !active.canGoBack;
  el.forwardBtn.disabled = !active.canGoForward;
}

function renderTabs() {
  el.tabs.innerHTML = '';

  state.tabs.forEach((tab) => {
    const item = document.createElement('div');
    item.className = `tab ${tab.id === state.activeTabId ? 'active' : ''}`;

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || tab.url || 'New Tab';
    title.title = tab.url || tab.title || '';
    title.onclick = async () => {
      await window.browserApi.switchTab(tab.id);
    };

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = 'x';
    closeBtn.onclick = async (event) => {
      event.stopPropagation();
      await window.browserApi.closeTab(tab.id);
    };

    item.appendChild(title);
    item.appendChild(closeBtn);
    el.tabs.appendChild(item);
  });

  setActiveTabInUrl();
}

async function runAgent(userInput) {
  if (!userInput.trim()) return;
  addMessage('user', userInput);

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const messages = [
    { role: 'system', content: protocol.buildSystemPrompt() },
    { role: 'user', content: userInput }
  ];

  const first = await window.browserApi.openaiRequest({
    messages,
    tools: protocol.tools,
    tool_choice: 'auto',
    model: state.settings.model
  });

  if (!first.ok) {
    addMessage('system', first.error);
    return;
  }

  const modelMessage = first.data.choices?.[0]?.message;
  if (!modelMessage) {
    addMessage('system', 'No response from model.');
    return;
  }

  const calls = modelMessage.tool_calls || [];
  if (!calls.length) {
    addMessage('agent', modelMessage.content || 'Done.');
    return;
  }

  const toolResults = [];
  for (const call of calls) {
    const name = call.function?.name;
    const args = protocol.parseToolArguments(call.function?.arguments || '{}');
    const result = await window.browserApi.agentAction(name, args, {
      requestId,
      toolCallId: call.id
    });

    toolResults.push({ call, result });
  }

  const followupMessages = [
    ...messages,
    modelMessage,
    ...toolResults.map((entry) => ({
      role: 'tool',
      tool_call_id: entry.call.id,
      content: JSON.stringify(entry.result)
    }))
  ];

  const second = await window.browserApi.openaiRequest({
    messages: followupMessages,
    model: state.settings.model
  });

  if (!second.ok) {
    addMessage('system', second.error);
    return;
  }

  addMessage('agent', second.data.choices?.[0]?.message?.content || 'Actions completed.');
}

function setupVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    el.micBtn.disabled = true;
    el.micBtn.textContent = 'Voice N/A';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const text = event.results?.[0]?.[0]?.transcript || '';
    el.agentText.value = text;
    runAgent(text);
  };

  recognition.onend = () => {
    state.listening = false;
    el.micBtn.textContent = 'Voice';
  };

  recognition.onerror = (event) => {
    state.listening = false;
    el.micBtn.textContent = 'Voice';
    addMessage('system', `Voice error: ${event.error}`);
  };

  state.recognition = recognition;
}

async function openSettings(autoOpen = false) {
  const settings = await window.browserApi.getSettings();
  state.settings = settings;

  el.providerSelect.value = settings.provider || 'openai';
  el.modelInput.value = settings.model || 'gpt-4.1-mini';
  el.apiKeyInput.value = '';

  if (autoOpen && settings.hasApiKey) return;
  if (!el.settingsModal.open) {
    el.settingsModal.showModal();
  }
}

function bindEvents() {
  el.goBtn.onclick = async () => {
    if (!state.activeTabId) return;
    await window.browserApi.navigate(state.activeTabId, el.urlInput.value);
  };

  el.urlInput.onkeydown = async (event) => {
    if (event.key !== 'Enter' || !state.activeTabId) return;
    await window.browserApi.navigate(state.activeTabId, el.urlInput.value);
  };

  el.newTabBtn.onclick = async () => {
    await window.browserApi.newTab('https://www.google.com');
  };

  el.backBtn.onclick = () => {
    if (state.activeTabId) window.browserApi.controlTab(state.activeTabId, 'back');
  };

  el.forwardBtn.onclick = () => {
    if (state.activeTabId) window.browserApi.controlTab(state.activeTabId, 'forward');
  };

  el.reloadBtn.onclick = () => {
    if (state.activeTabId) window.browserApi.controlTab(state.activeTabId, 'reload');
  };

  el.sendBtn.onclick = () => {
    const text = el.agentText.value.trim();
    el.agentText.value = '';
    runAgent(text);
  };

  el.agentText.onkeydown = (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      const text = el.agentText.value.trim();
      el.agentText.value = '';
      runAgent(text);
    }
  };

  el.micBtn.onclick = () => {
    if (!state.recognition) return;
    if (state.listening) {
      state.recognition.stop();
      return;
    }

    state.listening = true;
    el.micBtn.textContent = 'Listening...';
    state.recognition.start();
  };

  el.settingsBtn.onclick = () => {
    openSettings(false);
  };

  el.cancelSettings.onclick = () => {
    el.settingsModal.close();
  };

  el.settingsForm.onsubmit = async (event) => {
    event.preventDefault();

    const payload = {
      provider: el.providerSelect.value,
      model: el.modelInput.value.trim() || 'gpt-4.1-mini',
      apiKey: el.apiKeyInput.value.trim()
    };

    const result = await window.browserApi.saveSettings(payload);
    if (result.ok) {
      state.settings.provider = payload.provider;
      state.settings.model = payload.model;
      state.settings.hasApiKey = result.hasApiKey;
      addMessage('system', 'Agent settings saved.');
      el.settingsModal.close();
    }
  };

  document.querySelectorAll('.quick-action').forEach((btn) => {
    btn.onclick = async () => {
      const action = btn.getAttribute('data-action');
      if (action === 'open-pge') {
        await runAgent('Open PGE login page and fill saved credentials if available.');
      }
      if (action === 'google-10') {
        await runAgent('Open Google in 10 tabs and search 10 famous people, one person per tab.');
      }
      if (action === 'history') {
        const history = await window.browserApi.getHistory();
        const preview = history.slice(0, 12).map((h) => `${h.title} - ${h.url}`).join('\n');
        addMessage('system', preview || 'No history yet.');
      }
    };
  });

  window.browserApi.onTabsState((next) => {
    state.tabs = next.tabs || [];
    state.activeTabId = next.activeTabId || null;
    renderTabs();
  });

  window.browserApi.onAgentManeuver((maneuver) => {
    state.maneuvers.push(maneuver);
    renderManeuvers();
  });
}

async function bootstrap() {
  bindEvents();
  setupVoice();
  await openSettings(true);
  addMessage('agent', 'Voice/text web agent ready. Every browser maneuver is shown in the timeline above.');
}

bootstrap();
