(function () {
  const STORAGE_KEY = 'chatScenarios';
  const SETTINGS_KEY = 'chatSettings';

  const dom = {
    messageList: null,
    scenarioNameDisplay: null,
    messageInput: null,
    roleRadios: null,
    sendButton: null,
    newButton: null,
    importButton: null,
    importInput: null,
    sidebar: null,
    sidebarScenarioList: null,
    toggleSidebarButton: null,
    settingsButton: null,
    settingsModal: null,
    settingsCloseButtons: null,
    saveSettingsButton: null,
    labelUserInput: null,
    labelAiAInput: null,
    labelAiBInput: null,
    scenarioModal: null,
    scenarioListContainer: null,
    modalCloseButtons: null,
    statusToast: null,
  };

  let currentScenario = null;
  let scenariosCache = [];
  let toastTimer = null;
  let settings = {
    labels: {
      user: 'User',
      aiA: 'AI-A',
      aiB: 'AI-B',
    },
  };

  const app = {
    get scenario() {
      return currentScenario;
    },
    addMessage,
    renderMessages,
    loadScenariosFromStorage,
    saveScenariosToStorage,
  };

  document.addEventListener('DOMContentLoaded', () => {
    cacheDom();
    settings = loadSettingsFromStorage();
    applySettings();
    scenariosCache = loadScenariosFromStorage();
    if (scenariosCache.length > 0) {
      setCurrentScenario(scenariosCache[0]);
    } else {
      createNewScenario('新規シナリオ');
    }
    bindEvents();
    renderMessages();
    renderSidebarScenarioList();
    console.log('App initialized');
    window.app = app;
  });

  function cacheDom() {
    dom.messageList = document.getElementById('message-list');
    dom.scenarioNameDisplay = document.getElementById('scenario-name-display');
    dom.messageInput = document.getElementById('message-input');
    dom.roleRadios = document.querySelectorAll('input[name="role"]');
    dom.sendButton = document.getElementById('send-button');
    dom.newButton = document.getElementById('new-scenario-button');
    dom.importButton = document.getElementById('import-scenario-button');
    dom.importInput = document.getElementById('import-file-input');
    dom.sidebar = document.getElementById('sidebar');
    dom.sidebarScenarioList = document.getElementById('sidebar-scenario-list');
    dom.toggleSidebarButton = document.getElementById('toggle-sidebar-button');
    dom.sidebarOverlay = document.getElementById('sidebar-overlay');
    dom.screenshotButton = document.getElementById('screenshot-button');
    dom.settingsButton = document.getElementById('settings-button');
    dom.renameHeaderButton = document.getElementById('rename-header-button');
    dom.settingsModal = document.getElementById('settings-modal');
    dom.settingsCloseButtons = document.querySelectorAll('.close-settings-modal');
    dom.saveSettingsButton = document.getElementById('save-settings-button');
    dom.labelUserInput = document.getElementById('label-user');
    dom.labelAiAInput = document.getElementById('label-aiA');
    dom.labelAiBInput = document.getElementById('label-aiB');
    dom.scenarioModal = document.getElementById('scenario-list-modal');
    dom.scenarioListContainer = document.getElementById('scenario-list-container');
    dom.modalCloseButtons = document.querySelectorAll('.close-modal');
    dom.statusToast = document.getElementById('status-toast');
  }

  function bindEvents() {
    if (dom.sendButton) dom.sendButton.addEventListener('click', handleSend);
    if (dom.messageInput) {
      dom.messageInput.addEventListener('keydown', (event) => {
        const isShortcut = (event.metaKey || event.ctrlKey) && event.key === 'Enter';
        if (isShortcut) {
          event.preventDefault();
          handleSend();
        }
      });
    }
    if (dom.newButton) dom.newButton.addEventListener('click', handleNewScenario);
    if (dom.importButton) dom.importButton.addEventListener('click', () => dom.importInput && dom.importInput.click());
    if (dom.importInput) dom.importInput.addEventListener('change', handleImportFile);
    if (dom.toggleSidebarButton) dom.toggleSidebarButton.addEventListener('click', toggleSidebar);
    if (dom.sidebarOverlay) dom.sidebarOverlay.addEventListener('click', toggleSidebar);
    if (dom.screenshotButton) dom.screenshotButton.addEventListener('click', takeScreenshot);
    if (dom.settingsButton) dom.settingsButton.addEventListener('click', openSettingsModal);
    if (dom.renameHeaderButton) dom.renameHeaderButton.addEventListener('click', () => {
      if (currentScenario) {
        renameScenario(currentScenario.id);
      } else {
        showToast('シナリオが選択されていません');
      }
    });
    if (dom.saveSettingsButton) dom.saveSettingsButton.addEventListener('click', saveSettings);
    if (dom.settingsCloseButtons) {
      dom.settingsCloseButtons.forEach((btn) => btn.addEventListener('click', closeSettingsModal));
    }
    if (dom.settingsModal) {
      dom.settingsModal.addEventListener('click', (e) => {
        if (e.target === dom.settingsModal) closeSettingsModal();
      });
    }
    if (dom.modalCloseButtons) {
      dom.modalCloseButtons.forEach((btn) => btn.addEventListener('click', closeScenarioModal));
    }
    if (dom.scenarioModal) {
      dom.scenarioModal.addEventListener('click', (e) => {
        if (e.target === dom.scenarioModal) closeScenarioModal();
      });
    }
  }

  function handleSend() {
    const role = getSelectedRole();
    const text = dom.messageInput ? dom.messageInput.value : '';
    if (!role || !text || !text.trim()) return;

    addMessage(role, text.trim());

    if (dom.messageInput) {
      dom.messageInput.value = '';
      dom.messageInput.focus();
    }
  }

  function getSelectedRole() {
    const selected = Array.from(dom.roleRadios || []).find((radio) => radio.checked);
    return selected ? selected.value : null;
  }

  function addMessage(role, text) {
    if (!currentScenario) return;
    const now = new Date();
    const message = {
      id: generateId('msg'),
      role,
      text,
      timestamp: now.toISOString(),
    };

    currentScenario.messages.push(message);
    currentScenario.updatedAt = now.toISOString();
    renderMessages();
    autoSaveCurrentScenario();
  }

  function renderMessages() {
    if (!dom.messageList || !currentScenario) return;
    dom.messageList.innerHTML = '';

    currentScenario.messages.forEach((message) => {
      const el = buildMessageElement(message);
      dom.messageList.appendChild(el);
    });

    updateScenarioNameDisplay();
    scrollToBottom(dom.messageList);
  }

  function buildMessageElement(message) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('message');
    wrapper.dataset.messageId = message.id;
    if (message.role === 'user') {
      wrapper.classList.add('message-user');
    } else if (message.role === 'aiA') {
      wrapper.classList.add('message-aiA');
    } else if (message.role === 'aiB') {
      wrapper.classList.add('message-aiB');
    }

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = labelForRole(message.role);

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';

    const body = document.createElement('div');
    body.className = 'body';
    body.textContent = message.text;

    const actions = document.createElement('div');
    actions.className = 'message-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'message-action-btn';
    editBtn.innerHTML = '<i data-lucide="pencil" style="width: 8px; height: 8px;"></i>';
    editBtn.title = '編集';
    editBtn.addEventListener('click', () => startEditMessage(message.id));

    actions.appendChild(editBtn);

    if (message.role === 'user') {
      contentWrapper.appendChild(actions);
      contentWrapper.appendChild(body);
    } else {
      contentWrapper.appendChild(body);
      contentWrapper.appendChild(actions);
    }

    wrapper.appendChild(meta);
    wrapper.appendChild(contentWrapper);
    return wrapper;
  }

  function labelForRole(role) {
    if (role === 'user') return settings.labels.user || 'User';
    if (role === 'aiA') return settings.labels.aiA || 'AI-A';
    if (role === 'aiB') return settings.labels.aiB || 'AI-B';
    return 'Unknown';
  }

  function formatTimestamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${d} ${hh}:${mm}`;
  }

  function scrollToBottom(container) {
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }

  function updateScenarioNameDisplay() {
    if (dom.scenarioNameDisplay && currentScenario) {
      dom.scenarioNameDisplay.textContent = currentScenario.name;
    }
  }

  function createNewScenario(name) {
    const now = new Date();
    const scenario = {
      id: generateId('scenario'),
      name: name || '未設定',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      messages: [],
    };
    setCurrentScenario(scenario);
  }

  function setCurrentScenario(scenario) {
    currentScenario = {
      id: scenario.id,
      name: scenario.name,
      createdAt: scenario.createdAt,
      updatedAt: scenario.updatedAt,
      messages: Array.isArray(scenario.messages) ? [...scenario.messages] : [],
    };
    renderMessages();
  }

  function toggleSidebar() {
    if (dom.sidebar) {
      dom.sidebar.classList.toggle('hidden');
      document.body.classList.toggle('sidebar-hidden', dom.sidebar.classList.contains('hidden'));
    }
  }

  function renderSidebarScenarioList() {
    if (!dom.sidebarScenarioList) return;
    dom.sidebarScenarioList.innerHTML = '';
    scenariosCache = loadScenariosFromStorage();
    if (!scenariosCache.length) {
      const empty = document.createElement('div');
      empty.style.padding = '12px';
      empty.style.fontSize = '13px';
      empty.style.color = '#8e8e8e';
      empty.textContent = 'シナリオなし';
      dom.sidebarScenarioList.appendChild(empty);
      return;
    }
    scenariosCache
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .forEach((scenario) => {
        const item = document.createElement('button');
        item.className = 'sidebar-scenario-item';
        if (currentScenario && scenario.id === currentScenario.id) {
          item.classList.add('active');
        }
        item.type = 'button';
        item.dataset.scenarioId = scenario.id;
        
        const content = document.createElement('span');
        content.className = 'item-content';
        content.textContent = scenario.name || '無題';
        
        const actions = document.createElement('div');
        actions.className = 'item-actions';
        
        const renameBtn = document.createElement('button');
        renameBtn.className = 'action-icon';
        renameBtn.innerHTML = '<i data-lucide="edit" style="width: 14px; height: 14px;"></i>';
        renameBtn.title = '名前を変更';
        renameBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          renameScenario(scenario.id);
        });
        
        const exportBtn = document.createElement('button');
        exportBtn.className = 'action-icon';
        exportBtn.innerHTML = '<i data-lucide="upload" style="width: 14px; height: 14px;"></i>';
        exportBtn.title = 'エクスポート';
        exportBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const prev = currentScenario;
          setCurrentScenario(scenario);
          exportCurrentScenario();
          if (prev) setCurrentScenario(prev);
        });
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-icon';
        deleteBtn.innerHTML = '<i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>';
        deleteBtn.title = '削除';
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteScenario(scenario.id);
        });
        
        actions.appendChild(renameBtn);
        actions.appendChild(exportBtn);
        actions.appendChild(deleteBtn);
        
        item.appendChild(content);
        item.appendChild(actions);
        
        item.addEventListener('click', () => {
          setCurrentScenario(scenario);
          renderSidebarScenarioList();
        });
        
        dom.sidebarScenarioList.appendChild(item);
      });
    if (window.lucide) window.lucide.createIcons();
  }

  function handleNewScenario() {
    if (currentScenario && currentScenario.messages.length > 0) {
      const shouldSave = window.confirm('現在のシナリオを保存しますか？');
      if (shouldSave) {
        saveCurrentScenario();
      }
    }
    const defaultName = `新規シナリオ_${formatTimestamp(new Date()).replace(/\s|\//g, '').replace(':', '')}`;
    createNewScenario(defaultName);
    renderSidebarScenarioList();
  }

  function autoSaveCurrentScenario() {
    if (!currentScenario) return;
    const now = new Date().toISOString();
    currentScenario.updatedAt = now;
    scenariosCache = loadScenariosFromStorage();
    const existingIndex = scenariosCache.findIndex((s) => s.id === currentScenario.id);
    if (existingIndex >= 0) {
      scenariosCache[existingIndex] = { ...currentScenario };
    } else {
      scenariosCache.push({ ...currentScenario });
    }
    saveScenariosToStorage(scenariosCache);
    renderSidebarScenarioList();
  }

  function saveCurrentScenario() {
    if (!currentScenario) return;
    const now = new Date().toISOString();
    currentScenario.updatedAt = now;
    scenariosCache = loadScenariosFromStorage();
    const existingIndex = scenariosCache.findIndex((s) => s.id === currentScenario.id);
    if (existingIndex >= 0) {
      scenariosCache[existingIndex] = { ...currentScenario };
    } else {
      scenariosCache.push({ ...currentScenario });
    }
    saveScenariosToStorage(scenariosCache);
    showToast('保存しました');
    renderSidebarScenarioList();
    renderScenarioList();
  }

  function saveScenarioAs() {
    if (!currentScenario) return;
    const name = window.prompt('新しいシナリオ名を入力してください', currentScenario.name || '新しいシナリオ');
    if (!name) return;
    const now = new Date();
    const duplicated = {
      ...currentScenario,
      id: generateId('scenario'),
      name,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      messages: [...currentScenario.messages],
    };
    setCurrentScenario(duplicated);
    scenariosCache = loadScenariosFromStorage();
    scenariosCache.push({ ...duplicated });
    saveScenariosToStorage(scenariosCache);
    showToast('名前を付けて保存しました');
    renderSidebarScenarioList();
    renderScenarioList();
  }

  function openScenarioPicker() {
    scenariosCache = loadScenariosFromStorage();
    renderScenarioList();
    if (dom.scenarioModal) {
      dom.scenarioModal.classList.remove('hidden');
      dom.scenarioModal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeScenarioModal() {
    if (dom.scenarioModal) {
      dom.scenarioModal.classList.add('hidden');
      dom.scenarioModal.setAttribute('aria-hidden', 'true');
    }
  }

  function renderScenarioList() {
    if (!dom.scenarioListContainer) return;
    dom.scenarioListContainer.innerHTML = '';
    scenariosCache = loadScenariosFromStorage();
    if (!scenariosCache.length) {
      const empty = document.createElement('p');
      empty.textContent = '保存済みのシナリオはありません。';
      dom.scenarioListContainer.appendChild(empty);
      return;
    }
    const list = document.createElement('div');
    list.className = 'scenario-list';
    scenariosCache
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .forEach((scenario) => {
        const item = document.createElement('button');
        item.className = 'scenario-item';
        item.type = 'button';
        item.dataset.scenarioId = scenario.id;
        item.innerHTML = `
          <span class="scenario-title">${scenario.name || '無題'}</span>
          <span class="scenario-meta">更新: ${formatTimestamp(scenario.updatedAt)}</span>
        `;
        item.addEventListener('click', () => {
          setCurrentScenario(scenario);
          closeScenarioModal();
          showToast('シナリオを読み込みました');
        });
        list.appendChild(item);
      });
    dom.scenarioListContainer.appendChild(list);
  }

  function renameScenario(scenarioId) {
    scenariosCache = loadScenariosFromStorage();
    const scenario = scenariosCache.find((s) => s.id === scenarioId);
    if (!scenario) return;
    
    const newName = window.prompt('新しい名前を入力してください', scenario.name || '無題');
    if (!newName || newName === scenario.name) return;
    
    scenario.name = newName;
    scenario.updatedAt = new Date().toISOString();
    
    const existingIndex = scenariosCache.findIndex((s) => s.id === scenarioId);
    if (existingIndex >= 0) {
      scenariosCache[existingIndex] = scenario;
    }
    
    saveScenariosToStorage(scenariosCache);
    
    if (currentScenario && currentScenario.id === scenarioId) {
      currentScenario.name = newName;
      updateScenarioNameDisplay();
    }
    
    showToast('名前を変更しました');
    renderSidebarScenarioList();
    renderScenarioList();
  }

  function deleteScenario(scenarioId) {
    const confirmed = window.confirm('このシナリオを削除しますか？');
    if (!confirmed) return;
    scenariosCache = loadScenariosFromStorage();
    scenariosCache = scenariosCache.filter((s) => s.id !== scenarioId);
    saveScenariosToStorage(scenariosCache);
    if (currentScenario && currentScenario.id === scenarioId) {
      if (scenariosCache.length) {
        setCurrentScenario(scenariosCache[0]);
      } else {
        createNewScenario('新規シナリオ');
      }
    }
    showToast('削除しました');
    renderSidebarScenarioList();
    renderScenarioList();
  }

  function deleteCurrentScenario() {
    if (!currentScenario) return;
    deleteScenario(currentScenario.id);
  }

  function exportCurrentScenario() {
    if (!currentScenario) return;
    const dataStr = JSON.stringify(currentScenario, null, 2);
    const safeName = (currentScenario.name || 'scenario').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `scenario_${safeName}_${formatTimestamp(new Date()).replace(/\s|\//g, '').replace(':', '')}.json`;
    
    // Fileオブジェクトを作成
    const file = new File([dataStr], fileName, { type: 'application/json' });
    
    // Web Share APIが使える場合（モバイル対応）
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title: 'シナリオを共有',
        text: 'チャットシナリオ'
      })
      .then(() => {
        showToast('共有しました');
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('共有に失敗:', err);
          // 共有がキャンセルされた場合以外はダウンロード
          downloadFile(dataStr, fileName);
        }
      });
    } else {
      // Web Share APIが使えない場合はダウンロード
      downloadFile(dataStr, fileName);
    }
  }
  
  function downloadFile(dataStr, fileName) {
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('ファイルをダウンロードしました');
  }

  async function takeScreenshot() {
    if (!dom.messageList) {
      showToast('メッセージがありません');
      return;
    }

    // html2canvasが読み込まれているか確認
    if (typeof html2canvas === 'undefined') {
      showToast('スクリーンショット機能が利用できません');
      console.error('html2canvas is not loaded');
      return;
    }

    showToast('スクリーンショットを作成中...');

    try {
      const messageList = dom.messageList;
      const layout = document.getElementById('layout');
      const chatColumn = document.getElementById('chat-column');
      
      // 現在のスタイルを保存
      const originalStyles = {
        messageList: {
          height: messageList.style.height,
          maxHeight: messageList.style.maxHeight,
          overflow: messageList.style.overflow,
          overflowY: messageList.style.overflowY,
          flex: messageList.style.flex,
          minHeight: messageList.style.minHeight
        },
        layout: layout ? {
          overflow: layout.style.overflow,
          height: layout.style.height
        } : null,
        chatColumn: chatColumn ? {
          overflow: chatColumn.style.overflow,
          height: chatColumn.style.height
        } : null
      };
      
      // 一時的にスクロールを無効化し、全体を表示
      messageList.style.height = 'auto';
      messageList.style.maxHeight = 'none';
      messageList.style.overflow = 'visible';
      messageList.style.overflowY = 'visible';
      messageList.style.flex = 'none';
      messageList.style.minHeight = '0';
      
      if (layout) {
        layout.style.overflow = 'visible';
        layout.style.height = 'auto';
      }
      
      if (chatColumn) {
        chatColumn.style.overflow = 'visible';
        chatColumn.style.height = 'auto';
      }
      
      // 少し待機してDOMが更新されるのを待つ
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // html2canvasでスクリーンショットを撮影
      const canvas = await html2canvas(messageList, {
        backgroundColor: '#f7f7f8',
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        foreignObjectRendering: false,
        imageTimeout: 0,
        windowHeight: messageList.scrollHeight + 100
      });
      
      // 元の状態に戻す
      messageList.style.height = originalStyles.messageList.height;
      messageList.style.maxHeight = originalStyles.messageList.maxHeight;
      messageList.style.overflow = originalStyles.messageList.overflow;
      messageList.style.overflowY = originalStyles.messageList.overflowY;
      messageList.style.flex = originalStyles.messageList.flex;
      messageList.style.minHeight = originalStyles.messageList.minHeight;
      
      if (layout && originalStyles.layout) {
        layout.style.overflow = originalStyles.layout.overflow;
        layout.style.height = originalStyles.layout.height;
      }
      
      if (chatColumn && originalStyles.chatColumn) {
        chatColumn.style.overflow = originalStyles.chatColumn.overflow;
        chatColumn.style.height = originalStyles.chatColumn.height;
      }
      
      // Canvasを画像に変換してダウンロード
      canvas.toBlob((blob) => {
        if (!blob) {
          showToast('画像の生成に失敗しました');
          return;
        }
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const scenarioName = currentScenario?.name || 'chat';
        const safeName = scenarioName.replace(/[^a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_');
        a.href = url;
        a.download = `screenshot_${safeName}_${timestamp}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('スクリーンショットを保存しました');
      }, 'image/png');
      
    } catch (error) {
      console.error('スクリーンショットエラー:', error);
      showToast('スクリーンショットの作成に失敗しました: ' + error.message);
      
      // エラー時は元の状態に戻す
      const messageList = dom.messageList;
      const layout = document.getElementById('layout');
      const chatColumn = document.getElementById('chat-column');
      
      if (messageList) {
        messageList.style.height = '';
        messageList.style.maxHeight = '';
        messageList.style.overflow = '';
        messageList.style.overflowY = '';
        messageList.style.flex = '';
        messageList.style.minHeight = '';
      }
      if (layout) {
        layout.style.overflow = '';
        layout.style.height = '';
      }
      if (chatColumn) {
        chatColumn.style.overflow = '';
        chatColumn.style.height = '';
      }
    }
  }

  function handleImportFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        const scenario = normalizeScenario(parsed);
        setCurrentScenario(scenario);
        scenariosCache = loadScenariosFromStorage();
        scenariosCache.push({ ...scenario });
        saveScenariosToStorage(scenariosCache);
        showToast('インポートしました');
        renderSidebarScenarioList();
        renderScenarioList();
      } catch (err) {
        console.error(err);
        window.alert('インポートに失敗しました。JSON形式を確認してください。');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  function normalizeScenario(raw) {
    const now = new Date().toISOString();
    const messages = Array.isArray(raw.messages) ? raw.messages.map((msg) => ({
      id: msg.id || generateId('msg'),
      role: msg.role || 'user',
      text: msg.text || '',
      timestamp: msg.timestamp || now,
    })) : [];
    return {
      id: raw.id || generateId('scenario'),
      name: raw.name || 'インポートシナリオ',
      createdAt: raw.createdAt || now,
      updatedAt: raw.updatedAt || now,
      messages,
    };
  }

  function loadScenariosFromStorage() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Failed to load scenarios', e);
      return [];
    }
  }

  function saveScenariosToStorage(scenarios) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
    } catch (e) {
      console.warn('Failed to save scenarios', e);
    }
  }

  function generateId(prefix) {
    return `${prefix}-${Math.random().toString(16).slice(2, 10)}-${Date.now().toString(16)}`;
  }

  function startEditMessage(messageId) {
    if (!currentScenario) return;
    const message = currentScenario.messages.find((m) => m.id === messageId);
    if (!message) return;

    const messageEl = dom.messageList.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) return;

    const bodyEl = messageEl.querySelector('.body');
    const actionsEl = messageEl.querySelector('.message-actions');
    if (!bodyEl || !actionsEl) return;

    // Replace body with textarea
    const textarea = document.createElement('textarea');
    textarea.className = 'message-edit-input';
    textarea.value = message.text;
    bodyEl.replaceWith(textarea);
    textarea.focus();
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';

    // Replace actions with save/cancel buttons
    actionsEl.innerHTML = '';
    actionsEl.classList.add('editing');

    const saveBtn = document.createElement('button');
    saveBtn.className = 'message-action-btn save-cancel primary';
    saveBtn.innerHTML = '<i data-lucide="check" style="width: 8px; height: 8px;"></i>';
    saveBtn.title = '保存';
    saveBtn.addEventListener('click', () => saveEditMessage(messageId, textarea.value));

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'message-action-btn save-cancel';
    cancelBtn.innerHTML = '<i data-lucide="x" style="width: 8px; height: 8px;"></i>';
    cancelBtn.title = 'キャンセル';
    cancelBtn.addEventListener('click', () => cancelEditMessage(messageId));

    actionsEl.appendChild(saveBtn);
    actionsEl.appendChild(cancelBtn);

    if (window.lucide) window.lucide.createIcons();
  }

  function saveEditMessage(messageId, newText) {
    if (!currentScenario) return;
    const message = currentScenario.messages.find((m) => m.id === messageId);
    if (!message) return;

    const trimmedText = newText.trim();
    if (!trimmedText) {
      showToast('メッセージは空にできません');
      return;
    }

    message.text = trimmedText;
    message.timestamp = new Date().toISOString();
    currentScenario.updatedAt = new Date().toISOString();
    autoSaveCurrentScenario();
    renderMessages();
    showToast('メッセージを更新しました');
  }

  function cancelEditMessage(messageId) {
    renderMessages();
  }

  function showToast(message) {
    if (!dom.statusToast) return;
    dom.statusToast.textContent = message;
    dom.statusToast.classList.remove('hidden');
    dom.statusToast.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.statusToast.classList.add('hidden');
      dom.statusToast.classList.remove('visible');
    }, 2200);
  }

  function loadSettingsFromStorage() {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { labels: { user: 'User', aiA: 'AI-A', aiB: 'AI-B' } };
      const parsed = JSON.parse(raw);
      return parsed;
    } catch (e) {
      console.warn('Failed to load settings', e);
      return { labels: { user: 'User', aiA: 'AI-A', aiB: 'AI-B' } };
    }
  }

  function saveSettingsToStorage(settingsData) {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsData));
    } catch (e) {
      console.warn('Failed to save settings', e);
    }
  }

  function openSettingsModal() {
    if (dom.labelUserInput) dom.labelUserInput.value = settings.labels.user || 'User';
    if (dom.labelAiAInput) dom.labelAiAInput.value = settings.labels.aiA || 'AI-A';
    if (dom.labelAiBInput) dom.labelAiBInput.value = settings.labels.aiB || 'AI-B';
    if (dom.settingsModal) {
      dom.settingsModal.classList.remove('hidden');
      dom.settingsModal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeSettingsModal() {
    if (dom.settingsModal) {
      dom.settingsModal.classList.add('hidden');
      dom.settingsModal.setAttribute('aria-hidden', 'true');
    }
  }

  function saveSettings() {
    settings.labels.user = dom.labelUserInput ? dom.labelUserInput.value.trim() || 'User' : 'User';
    settings.labels.aiA = dom.labelAiAInput ? dom.labelAiAInput.value.trim() || 'AI-A' : 'AI-A';
    settings.labels.aiB = dom.labelAiBInput ? dom.labelAiBInput.value.trim() || 'AI-B' : 'AI-B';
    saveSettingsToStorage(settings);
    applySettings();
    renderMessages();
    closeSettingsModal();
    showToast('設定を保存しました');
  }

  function applySettings() {
    // Apply settings to UI if needed (e.g., update role selector labels)
    const roleOptions = document.querySelectorAll('.option');
    if (roleOptions.length >= 3) {
      roleOptions[0].childNodes[1].textContent = ` ${settings.labels.aiA}`;
      roleOptions[1].childNodes[1].textContent = ` ${settings.labels.aiB}`;
      roleOptions[2].childNodes[1].textContent = ` ${settings.labels.user}`;
    }
  }
})();
