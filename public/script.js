(function () {
  const STORAGE_KEY = 'chatScenarios';
  const SETTINGS_KEY = 'chatSettings';
  const USERS_KEY = 'chatUsers';
  const COLLAPSED_USERS_KEY = 'collapsedUsers';
  const USER_PROFILES_KEY = 'userProfiles';
  
  let currentUser = null;
  let usersList = [];
  let collapsedUsers = new Set();
  let userProfiles = {};
  let selectedScenarios = new Set();
  let selectionMode = false;
  
  // Firestore保存用のヘルパー関数（非同期で裏で実行）
  function saveToFirebase(scenarios) {
    if (!window.firebaseDB) return;
    try {
      const { db, collection, doc, setDoc } = window.firebaseDB;
      const scenariosCollection = collection(db, 'scenarios');
      
      scenarios.forEach(scenario => {
        const docRef = doc(scenariosCollection, scenario.id);
        setDoc(docRef, scenario).then(() => {
          console.log('Saved to Firestore:', scenario.id);
        }).catch(err => {
          console.warn('Firestore save failed:', err);
        });
      });
    } catch (error) {
      console.warn('Firestore save error:', error);
    }
  }
  
  // Firestore読み込み用のヘルパー関数
  function loadFromFirebase(callback) {
    if (!window.firebaseDB) {
      callback([]);
      return;
    }
    try {
      const { db, collection, getDocs } = window.firebaseDB;
      const scenariosCollection = collection(db, 'scenarios');
      
      getDocs(scenariosCollection).then((querySnapshot) => {
        const scenarios = [];
        querySnapshot.forEach((doc) => {
          scenarios.push(doc.data());
        });
        callback(scenarios);
      }).catch(error => {
        console.warn('Firestore load error:', error);
        callback([]);
      });
    } catch (error) {
      console.warn('Firestore load error:', error);
      callback([]);
    }
  }

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
    userNoteModal: null,
    userNoteModalTitle: null,
    userNoteTextarea: null,
    saveUserNoteButton: null,
    closeUserNoteButtons: null,
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
    loadCollapsedState();
    loadUserProfiles();
    settings = loadSettingsFromStorage();
    applySettings();
    
    // Firestoreから読み込みを試みる
    loadFromFirebase((firebaseScenarios) => {
      if (firebaseScenarios.length > 0) {
        // Firestoreにデータがあればそれを使用
        scenariosCache = firebaseScenarios;
        saveScenariosToStorage(scenariosCache); // LocalStorageにも保存
      } else {
        // FirestoreにデータがなければLocalStorageから読み込み
        scenariosCache = loadScenariosFromStorage();
      }
      
      if (scenariosCache.length > 0) {
        setCurrentScenario(scenariosCache[0]);
      }
      // シナリオがない場合は空の状態で開始
      bindEvents();
      renderMessages();
      renderSidebarScenarioList();
      console.log('App initialized');
      window.app = app;
    });
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
    dom.userNoteModal = document.getElementById('user-note-modal');
    dom.userNoteModalTitle = document.getElementById('user-note-modal-title');
    dom.userNoteTextarea = document.getElementById('user-note-textarea');
    dom.saveUserNoteButton = document.getElementById('save-user-note-button');
    dom.closeUserNoteButtons = document.querySelectorAll('.close-user-note-modal');
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
    if (dom.closeUserNoteButtons) {
      dom.closeUserNoteButtons.forEach((btn) => btn.addEventListener('click', closeUserNoteModal));
    }
    if (dom.saveUserNoteButton) {
      dom.saveUserNoteButton.addEventListener('click', saveUserNote);
    }
    if (dom.userNoteModal) {
      dom.userNoteModal.addEventListener('click', (e) => {
        if (e.target === dom.userNoteModal) closeUserNoteModal();
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

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'message-action-btn';
    deleteBtn.innerHTML = '<i data-lucide="trash-2" style="width: 8px; height: 8px;"></i>';
    deleteBtn.title = '削除';
    deleteBtn.addEventListener('click', () => deleteMessage(message.id));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

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

  function createNewScenario(name, owner) {
    const now = new Date();
    const effectiveOwner = owner || currentUser;
    if (!effectiveOwner) {
      console.error('Owner is required to create a scenario');
      return;
    }
    const scenario = {
      id: generateId('scenario'),
      name: name || '未設定',
      owner: effectiveOwner,
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
      owner: scenario.owner,
      createdAt: scenario.createdAt,
      updatedAt: scenario.updatedAt,
      messages: Array.isArray(scenario.messages) ? [...scenario.messages] : [],
    };
    currentUser = currentScenario.owner;
    renderMessages();
  }

  function toggleSidebar() {
    if (dom.sidebar) {
      dom.sidebar.classList.toggle('hidden');
      document.body.classList.toggle('sidebar-hidden', dom.sidebar.classList.contains('hidden'));
    }
  }

  async function renderSidebarScenarioList() {
    if (!dom.sidebarScenarioList) return;
    dom.sidebarScenarioList.innerHTML = '';
    scenariosCache = await loadScenariosFromStorage();
    
    // ownerがないシナリオは削除（古いデータのクリーンアップ）
    const originalLength = scenariosCache.length;
    scenariosCache = scenariosCache.filter(s => s.owner && s.owner.trim());
    if (scenariosCache.length !== originalLength) {
      await saveScenariosToStorage(scenariosCache);
    }
    
    if (!scenariosCache.length) {
      const empty = document.createElement('div');
      empty.style.padding = '12px';
      empty.style.fontSize = '13px';
      empty.style.color = '#8e8e8e';
      empty.textContent = 'シナリオなし';
      dom.sidebarScenarioList.appendChild(empty);
      return;
    }
    
    // 選択モードボタンを追加（サイドバー全体用）
    const selectionModeBtn = document.createElement('button');
    selectionModeBtn.className = 'selection-mode-btn';
    selectionModeBtn.style.cssText = 'width: 100%; padding: 8px 12px; margin: 4px 0; background: #e3f2fd; border: 1px solid #90caf9; border-radius: 4px; cursor: pointer; font-size: 12px; color: #1976d2; text-align: left; display: flex; align-items: center; gap: 6px;';
    selectionModeBtn.innerHTML = '<i data-lucide="check-square" style="width: 12px; height: 12px;"></i> 選択モード';
    selectionModeBtn.addEventListener('click', () => {
      selectionMode = !selectionMode;
      selectedScenarios.clear();
      renderSidebarScenarioList();
    });
    dom.sidebarScenarioList.appendChild(selectionModeBtn);
    
    // 選択モード時の一括操作ボタン
    if (selectionMode) {
      const bulkActions = document.createElement('div');
      bulkActions.style.cssText = 'display: flex; gap: 4px; margin: 4px 0 8px 0;';
      
      const selectAllBtn = document.createElement('button');
      selectAllBtn.style.cssText = 'flex: 1; padding: 6px; background: #fff; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 11px;';
      selectAllBtn.textContent = 'すべて選択';
      selectAllBtn.addEventListener('click', () => {
        scenariosCache.forEach(s => selectedScenarios.add(s.id));
        renderSidebarScenarioList();
      });
      
      const exportSelectedBtn = document.createElement('button');
      exportSelectedBtn.style.cssText = 'flex: 1; padding: 6px; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;';
      exportSelectedBtn.textContent = `エクスポート(${selectedScenarios.size})`;
      exportSelectedBtn.disabled = selectedScenarios.size === 0;
      if (selectedScenarios.size === 0) {
        exportSelectedBtn.style.opacity = '0.5';
        exportSelectedBtn.style.cursor = 'not-allowed';
      }
      exportSelectedBtn.addEventListener('click', () => exportSelectedScenarios());
      
      const deleteSelectedBtn = document.createElement('button');
      deleteSelectedBtn.style.cssText = 'flex: 1; padding: 6px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;';
      deleteSelectedBtn.textContent = `削除(${selectedScenarios.size})`;
      deleteSelectedBtn.disabled = selectedScenarios.size === 0;
      if (selectedScenarios.size === 0) {
        deleteSelectedBtn.style.opacity = '0.5';
        deleteSelectedBtn.style.cursor = 'not-allowed';
      }
      deleteSelectedBtn.addEventListener('click', () => deleteSelectedScenarios());
      
      bulkActions.appendChild(selectAllBtn);
      bulkActions.appendChild(exportSelectedBtn);
      bulkActions.appendChild(deleteSelectedBtn);
      dom.sidebarScenarioList.appendChild(bulkActions);
    }
    
    // ユーザーごとにグループ化
    const groupedByUser = {};
    scenariosCache.forEach(scenario => {
      if (!scenario.owner) return; // ownerがないシナリオはスキップ
      const owner = scenario.owner;
      if (!groupedByUser[owner]) groupedByUser[owner] = [];
      groupedByUser[owner].push(scenario);
    });
    
    // 各ユーザーのセクションを作成
    Object.keys(groupedByUser).sort().forEach(owner => {
      const userSection = createUserSection(owner, groupedByUser[owner]);
      dom.sidebarScenarioList.appendChild(userSection);
    });
    
    if (window.lucide) window.lucide.createIcons();
  }
  
  function createUserSection(owner, scenarios) {
    const section = document.createElement('div');
    section.className = 'user-section';
    
    const header = document.createElement('div');
    header.className = 'user-section-header';
    header.style.cssText = 'display: flex; align-items: center; padding: 8px 12px; font-weight: 600; font-size: 13px; color: #333; background: #f5f5f5; margin-bottom: 4px;';
    
    const chevron = document.createElement('span');
    chevron.style.cssText = 'margin-right: 8px; transition: transform 0.2s; cursor: pointer;';
    chevron.textContent = collapsedUsers.has(owner) ? '▶' : '▼';
    
    const userName = document.createElement('span');
    userName.style.cssText = 'flex: 1; cursor: pointer;';
    userName.textContent = `${owner} (${scenarios.length})`;
    
    const editActions = document.createElement('div');
    editActions.style.cssText = 'display: flex; gap: 4px; margin-left: 8px;';
    
    const renameBtn = document.createElement('button');
    renameBtn.className = 'action-icon';
    renameBtn.style.cssText = 'padding: 4px; background: transparent; border: none; cursor: pointer; display: flex; align-items: center;';
    renameBtn.innerHTML = '<i data-lucide="pencil" style="width: 12px; height: 12px;"></i>';
    renameBtn.title = 'ユーザー名を変更';
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      renameUser(owner);
    });
    
    const profileBtn = document.createElement('button');
    profileBtn.className = 'action-icon';
    profileBtn.style.cssText = 'padding: 4px; background: transparent; border: none; cursor: pointer; display: flex; align-items: center;';
    profileBtn.innerHTML = '<i data-lucide="file-text" style="width: 12px; height: 12px;"></i>';
    profileBtn.title = 'プロフィールを編集';
    profileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      editUserProfile(owner);
    });
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-icon';
    deleteBtn.style.cssText = 'padding: 4px; background: transparent; border: none; cursor: pointer; display: flex; align-items: center; color: #d32f2f;';
    deleteBtn.innerHTML = '<i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>';
    deleteBtn.title = 'ユーザーを削除';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteUser(owner);
    });
    
    editActions.appendChild(renameBtn);
    editActions.appendChild(profileBtn);
    editActions.appendChild(deleteBtn);
    
    const toggleArea = document.createElement('div');
    toggleArea.style.cssText = 'display: flex; align-items: center; flex: 1; cursor: pointer;';
    toggleArea.appendChild(chevron);
    toggleArea.appendChild(userName);
    
    header.appendChild(toggleArea);
    header.appendChild(editActions);
    
    const scenariosList = document.createElement('div');
    scenariosList.className = 'user-scenarios-list';
    scenariosList.style.display = collapsedUsers.has(owner) ? 'none' : 'block';
    
    toggleArea.addEventListener('click', () => {
      if (collapsedUsers.has(owner)) {
        collapsedUsers.delete(owner);
        scenariosList.style.display = 'block';
        chevron.textContent = '▼';
      } else {
        collapsedUsers.add(owner);
        scenariosList.style.display = 'none';
        chevron.textContent = '▶';
      }
      saveCollapsedState();
    });
    
    section.appendChild(header);
    section.appendChild(scenariosList);
    
    // 新規チャットボタンを追加
    const newChatBtn = document.createElement('button');
    newChatBtn.className = 'new-chat-in-section';
    newChatBtn.style.cssText = 'width: 100%; padding: 8px 12px; margin: 4px 0; background: #f0f0f0; border: 1px dashed #ccc; border-radius: 4px; cursor: pointer; font-size: 12px; color: #666; text-align: left;';
    newChatBtn.innerHTML = '+ 新規チャット';
    newChatBtn.addEventListener('click', async () => {
      const defaultName = `新規シナリオ_${formatTimestamp(new Date()).replace(/\s|\//g, '').replace(':', '')}`;
      createNewScenario(defaultName, owner);
      await saveCurrentScenario();
      await renderSidebarScenarioList();
    });
    scenariosList.appendChild(newChatBtn);
    
    // インポートボタンを追加
    const importBtn = document.createElement('button');
    importBtn.className = 'import-in-section';
    importBtn.style.cssText = 'width: 100%; padding: 8px 12px; margin: 4px 0; background: #f8f8f8; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 12px; color: #666; text-align: left; display: flex; align-items: center; gap: 6px;';
    importBtn.innerHTML = '<i data-lucide="upload" style="width: 12px; height: 12px;"></i> ファイルインポート';
    importBtn.addEventListener('click', () => {
      if (dom.importInput) {
        dom.importInput.dataset.targetOwner = owner;
        dom.importInput.click();
      }
    });
    scenariosList.appendChild(importBtn);
    
    // シナリオリストを作成
    scenarios
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .forEach((scenario) => {
        const item = document.createElement('button');
        item.className = 'sidebar-scenario-item';
        if (currentScenario && scenario.id === currentScenario.id) {
          item.classList.add('active');
        }
        item.type = 'button';
        item.dataset.scenarioId = scenario.id;
        
        // 選択モード時のチェックボックス
        if (selectionMode) {
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = selectedScenarios.has(scenario.id);
          checkbox.style.cssText = 'margin-right: 8px;';
          checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
          });
          checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
              selectedScenarios.add(scenario.id);
            } else {
              selectedScenarios.delete(scenario.id);
            }
            renderSidebarScenarioList();
          });
          item.appendChild(checkbox);
        }
        
        const content = document.createElement('span');
        content.className = 'item-content';
        content.textContent = scenario.name || '無題';
        
        item.appendChild(content);
        
        // 選択モードでない時のみアクションボタンを表示
        if (!selectionMode) {
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
          
          item.appendChild(actions);
        }
        
        item.addEventListener('click', async () => {
          if (selectionMode) {
            if (selectedScenarios.has(scenario.id)) {
              selectedScenarios.delete(scenario.id);
            } else {
              selectedScenarios.add(scenario.id);
            }
            await renderSidebarScenarioList();
          } else {
            setCurrentScenario(scenario);
            await renderSidebarScenarioList();
          }
        });
        
        scenariosList.appendChild(item);
      });
    
    return section;
  }
  
  function saveCollapsedState() {
    try {
      window.localStorage.setItem(COLLAPSED_USERS_KEY, JSON.stringify([...collapsedUsers]));
    } catch (e) {
      console.warn('Failed to save collapsed state', e);
    }
  }
  
  function loadCollapsedState() {
    try {
      const raw = window.localStorage.getItem(COLLAPSED_USERS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        collapsedUsers = new Set(arr);
      }
    } catch (e) {
      console.warn('Failed to load collapsed state', e);
    }
  }
  
  function loadUserProfiles() {
    try {
      const raw = window.localStorage.getItem(USER_PROFILES_KEY);
      if (raw) {
        userProfiles = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Failed to load user profiles', e);
    }
  }
  
  function saveUserProfiles() {
    try {
      window.localStorage.setItem(USER_PROFILES_KEY, JSON.stringify(userProfiles));
    } catch (e) {
      console.warn('Failed to save user profiles', e);
    }
  }

  async function handleNewScenario() {
    const owner = window.prompt('新しいユーザー名を入力してください', '');
    if (!owner || !owner.trim()) return;
    const trimmedOwner = owner.trim();
    const defaultName = `新規シナリオ_${formatTimestamp(new Date()).replace(/\s|\//g, '').replace(':', '')}`;
    createNewScenario(defaultName, trimmedOwner);
    await saveCurrentScenario();
    await renderSidebarScenarioList();
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
  
  async function exportSelectedScenarios() {
    if (selectedScenarios.size === 0) return;
    
    // 最新のシナリオリストを取得
    scenariosCache = await loadScenariosFromStorage();
    const scenariosToExport = scenariosCache.filter(s => selectedScenarios.has(s.id));
    
    console.log('Selected IDs:', [...selectedScenarios]);
    console.log('Scenarios to export:', scenariosToExport.length);
    
    if (scenariosToExport.length === 0) {
      showToast('エクスポートするシナリオがありません');
      return;
    }
    
    if (scenariosToExport.length === 1) {
      // 1件の場合は通常のエクスポート
      const prev = currentScenario;
      setCurrentScenario(scenariosToExport[0]);
      exportCurrentScenario();
      if (prev) setCurrentScenario(prev);
      return;
    }
    
    // 複数の場合は形式を選択
    const exportAsOneLine = window.confirm(
      `${scenariosToExport.length}件のシナリオをエクスポートします。形式を選択してください:\n\nOK: 1ファイル形式（各シナリオを1ファイル、全メッセージを1行で）\nキャンセル: 複数行形式（各シナリオを1ファイル、各メッセージを1行ずつ）`
    );
    
    const timestamp = formatTimestamp(new Date()).replace(/\s|\//g, '').replace(':', '');
    
    if (exportAsOneLine) {
      // 1ファイル形式: 各シナリオを1ファイル、全メッセージを1行にまとめる
      scenariosToExport.forEach((scenario, index) => {
        const jsonlData = {
          messages: scenario.messages.map(msg => ({
            role: msg.role,
            content: msg.text
          }))
        };
        const dataStr = JSON.stringify(jsonlData);
        const safeName = (scenario.name || 'scenario').replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `scenario_${safeName}_${timestamp}_${index + 1}.jsonl`;
        setTimeout(() => {
          downloadFile(dataStr, fileName);
        }, index * 100);
      });
      showToast(`${scenariosToExport.length}件のシナリオを1ファイル形式でエクスポートしました`);
    } else {
      // 複数行形式: 各シナリオを1ファイル、2発話ごと（ラリー）を1行のJSONで出力
      scenariosToExport.forEach((scenario, index) => {
        const lines = [];
        for (let i = 0; i < scenario.messages.length; i += 2) {
          const turn = [];
          if (scenario.messages[i]) {
            turn.push({ role: scenario.messages[i].role, content: scenario.messages[i].text });
          }
          if (scenario.messages[i + 1]) {
            turn.push({ role: scenario.messages[i + 1].role, content: scenario.messages[i + 1].text });
          }
          lines.push(JSON.stringify({ turn }));
        }
        const dataStr = lines.join('\n');
        const safeName = (scenario.name || 'scenario').replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `scenario_${safeName}_${timestamp}_${index + 1}.jsonl`;
        setTimeout(() => {
          downloadFile(dataStr, fileName);
        }, index * 100);
      });
      showToast(`${scenariosToExport.length}件のシナリオを複数行形式（ラリーごと1行）でエクスポートしました`);
    }
  }
  
  async function deleteSelectedScenarios() {
    if (selectedScenarios.size === 0) return;
    
    const count = selectedScenarios.size;
    const confirmed = window.confirm(`選択した${count}件のシナリオを削除しますか？\n\nこの操作は取り消せません。`);
    if (!confirmed) return;
    
    scenariosCache = await loadScenariosFromStorage();
    scenariosCache = scenariosCache.filter(s => !selectedScenarios.has(s.id));
    await saveScenariosToStorage(scenariosCache);
    
    // 現在のシナリオが削除された場合
    if (currentScenario && selectedScenarios.has(currentScenario.id)) {
      if (scenariosCache.length > 0) {
        setCurrentScenario(scenariosCache[0]);
      } else {
        currentScenario = null;
        currentUser = null;
        renderMessages();
      }
    }
    
    selectedScenarios.clear();
    selectionMode = false;
    showToast(`${count}件のシナリオを削除しました`);
    await renderSidebarScenarioList();
    renderScenarioList();
  }

  function exportCurrentScenario() {
    if (!currentScenario) return;
    
    // JSONL形式に変換
    const jsonlData = {
      messages: currentScenario.messages.map(msg => ({
        role: msg.role,
        content: msg.text
      }))
    };
    
    const dataStr = JSON.stringify(jsonlData);
    const safeName = (currentScenario.name || 'scenario').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `scenario_${safeName}_${formatTimestamp(new Date()).replace(/\s|\//g, '').replace(':', '')}.jsonl`;
    
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
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const targetOwner = event.target.dataset.targetOwner;
    if (!targetOwner) {
      window.alert('インポート先のユーザーが指定されていません。');
      return;
    }
    
    let importedCount = 0;
    let totalFiles = files.length;
    
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target.result;
          let scenario;
          
          // JSONL形式の検出と変換
          if (content.includes('{"messages":') && content.includes('"role":')) {
            // JSONL形式として処理
            const lines = content.trim().split('\n');
            const allMessages = [];
            
            lines.forEach(line => {
              if (!line.trim()) return;
              try {
                const jsonData = JSON.parse(line);
                if (jsonData.messages && Array.isArray(jsonData.messages)) {
                  jsonData.messages.forEach(msg => {
                    if (msg.role && msg.content) {
                      allMessages.push({
                        id: generateId('msg'),
                        role: msg.role,
                        text: msg.content,
                        timestamp: new Date().toISOString()
                      });
                    }
                  });
                }
              } catch (lineErr) {
                console.warn('JSONL行の解析エラー:', lineErr);
              }
            });
            
            // 新しいシナリオを作成
            const now = new Date();
            scenario = {
              id: generateId('scenario'),
              name: file.name.replace(/\.(jsonl?|txt)$/i, ''),
              owner: targetOwner,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
              messages: allMessages
            };
          } else {
            // 既存のJSON形式として処理
            const parsed = JSON.parse(content);
            scenario = normalizeScenario(parsed);
            scenario.owner = targetOwner;
          }
          
          scenariosCache = await loadScenariosFromStorage();
          scenariosCache.push({ ...scenario });
          await saveScenariosToStorage(scenariosCache);
          
          importedCount++;
          
          // 最後のファイルの処理が終わったら
          if (importedCount === totalFiles) {
            // 最後にインポートしたシナリオを表示
            setCurrentScenario(scenario);
            showToast(`${totalFiles}件のシナリオをインポートしました`);
            renderSidebarScenarioList();
            renderScenarioList();
            event.target.value = '';
            delete event.target.dataset.targetOwner;
          }
        } catch (err) {
          console.error(err);
          window.alert(`「${file.name}」のインポートに失敗しました。形式を確認してください。`);
        }
      };
      reader.readAsText(file);
    });
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
      // Firestoreにも保存（非同期で裏で実行）
      saveToFirebase(scenarios);
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

  function deleteMessage(messageId) {
    if (!currentScenario) return;
    const confirmed = window.confirm('このメッセージを削除しますか？');
    if (!confirmed) return;
    
    currentScenario.messages = currentScenario.messages.filter((m) => m.id !== messageId);
    currentScenario.updatedAt = new Date().toISOString();
    autoSaveCurrentScenario();
    renderMessages();
    showToast('メッセージを削除しました');
  }
  
  async function renameUser(oldName) {
    const newName = window.prompt('新しいユーザー名を入力してください', oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    
    const trimmedName = newName.trim();
    
    // 全てのシナリオのownerを変更
    scenariosCache = await loadScenariosFromStorage();
    scenariosCache.forEach(scenario => {
      if (scenario.owner === oldName) {
        scenario.owner = trimmedName;
      }
    });
    
    // プロフィール情報も移行
    if (userProfiles[oldName]) {
      userProfiles[trimmedName] = userProfiles[oldName];
      delete userProfiles[oldName];
    }
    
    // 折りたたみ状態も移行
    if (collapsedUsers.has(oldName)) {
      collapsedUsers.delete(oldName);
      collapsedUsers.add(trimmedName);
      saveCollapsedState();
    }
    
    // 現在のシナリオも更新
    if (currentScenario && currentScenario.owner === oldName) {
      currentScenario.owner = trimmedName;
      currentUser = trimmedName;
    }
    
    await saveScenariosToStorage(scenariosCache);
    saveUserProfiles();
    await renderSidebarScenarioList();
    showToast('ユーザー名を変更しました');
  }
  
  let currentEditingUser = null;
  
  async function editUserProfile(owner) {
    currentEditingUser = owner;
    const currentProfile = userProfiles[owner] || { note: '' };
    
    if (dom.userNoteModalTitle) {
      dom.userNoteModalTitle.textContent = `${owner} - プロフィール・メモ`;
    }
    if (dom.userNoteTextarea) {
      dom.userNoteTextarea.value = currentProfile.note || '';
    }
    if (dom.userNoteModal) {
      dom.userNoteModal.classList.remove('hidden');
      dom.userNoteModal.setAttribute('aria-hidden', 'false');
      dom.userNoteTextarea.focus();
    }
  }
  
  function closeUserNoteModal() {
    if (dom.userNoteModal) {
      dom.userNoteModal.classList.add('hidden');
      dom.userNoteModal.setAttribute('aria-hidden', 'true');
    }
    currentEditingUser = null;
  }
  
  function saveUserNote() {
    if (!currentEditingUser) return;
    
    const newNote = dom.userNoteTextarea ? dom.userNoteTextarea.value : '';
    
    if (!userProfiles[currentEditingUser]) {
      userProfiles[currentEditingUser] = {};
    }
    userProfiles[currentEditingUser].note = newNote;
    
    saveUserProfiles();
    closeUserNoteModal();
    showToast('プロフィールを更新しました');
  }
  
  async function deleteUser(owner) {
    scenariosCache = await loadScenariosFromStorage();
    const userScenarios = scenariosCache.filter(s => s.owner === owner);
    const confirmed = window.confirm(`${owner}とそのユーザーの全てのチャット（${userScenarios.length}件）を削除しますか？\n\nこの操作は取り消せません。`);
    if (!confirmed) return;
    
    // Firestoreから該当ユーザーのシナリオを削除
    if (window.firebaseDB) {
      try {
        const { db, collection, doc, deleteDoc } = window.firebaseDB;
        // deleteDoc関数をインポート
        const { deleteDoc: deleteDocument } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const scenariosCollection = collection(db, 'scenarios');
        for (const scenario of userScenarios) {
          const docRef = doc(scenariosCollection, scenario.id);
          await deleteDocument(docRef);
          console.log('Deleted from Firestore:', scenario.id);
        }
      } catch (error) {
        console.warn('Failed to delete from Firestore:', error);
      }
    }
    
    // ローカルからも削除
    scenariosCache = scenariosCache.filter(scenario => scenario.owner !== owner);
    
    // プロフィール情報も削除
    if (userProfiles[owner]) {
      delete userProfiles[owner];
    }
    
    // 折りたたみ状態も削除
    if (collapsedUsers.has(owner)) {
      collapsedUsers.delete(owner);
      saveCollapsedState();
    }
    
    // 現在のシナリオが削除されたユーザーのものなら、別のシナリオに切り替え
    if (currentScenario && currentScenario.owner === owner) {
      if (scenariosCache.length > 0) {
        setCurrentScenario(scenariosCache[0]);
      } else {
        // 空の状態にする
        currentScenario = null;
        currentUser = null;
        renderMessages();
      }
    }
    
    await saveScenariosToStorage(scenariosCache);
    saveUserProfiles();
    await renderSidebarScenarioList();
    showToast('ユーザーを削除しました');
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
