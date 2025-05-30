// Estado da aplicação
let currentScreen = 'home';
let systemInfo = null;
let updateInterval = null;
let isLoading = false;
let focusedIndex = 0;

// Elementos do DOM
const elements = {
    screens: {
        home: document.getElementById('home-screen'),
        games: document.getElementById('games-screen'),
        programs: document.getElementById('programs-screen'),
        shutdown: document.getElementById('shutdown-screen'),
        gameDetails: document.getElementById('game-details-screen')
    },
    footerActions: document.getElementById('footer-actions'),
    systemInfo: {
        cpuModel: document.getElementById('cpu-model'),
        cpuTemp: document.getElementById('cpu-temp'),
        cpuUsage: document.getElementById('cpu-usage'),
        gpuModel: document.getElementById('gpu-model'),
        gpuTemp: document.getElementById('gpu-temp'),
        gpuMemory: document.getElementById('gpu-memory'),
        ramTotal: document.getElementById('ram-total'),
        ramUsed: document.getElementById('ram-used'),
        ramAvailable: document.getElementById('ram-available'),
        ramUsage: document.getElementById('ram-usage'),
        networkStatus: document.getElementById('network-status'),
        networkType: document.getElementById('network-type'),
        networkIp: document.getElementById('network-ip'),
        audioVolume: document.getElementById('audio-volume'),
        currentTime: document.getElementById('current-time'),
        currentDate: document.getElementById('current-date'),
        dayOfWeek: document.getElementById('day-of-week'),
        storageInfo: document.getElementById('storage-info')
    },
    grids: {
        games: document.getElementById('games-grid'),
        programs: document.getElementById('programs-grid')
    },
    buttons: {
        // Os botões de voltar específicos das telas são tratados
        // em seus respectivos gerenciadores ou pela função global navigateBack.
    },
    options: {
        games: document.getElementById('games-option'),
        programs: document.getElementById('programs-option'),
        shutdown: document.getElementById('shutdown-option'),
        shutdownPc: document.getElementById('shutdown-pc'),
        restartPc: document.getElementById('restart-pc'),
        minimizeApp: document.getElementById('minimize-app')
    },
    loadingOverlay: document.getElementById('loading-overlay'),
    notificationContainer: document.getElementById('notification-container')
};

// Inicialização da aplicação
document.addEventListener('DOMContentLoaded', async () => {
    console.log('StartZone Dashboard iniciado');
    try {
        // Funções Globais
        window.navigateFocus = navigateFocus;
        window.activateFocusedElement = () => document.activeElement?.click();
        window.navigateBack = () => {
            if (currentScreen === 'gameDetails') {
                showScreen('games-screen');
            } else if (currentScreen === 'settingsMenu') { // Se o menu de configurações estiver aberto (lógica futura)
                window.settingsMenuManager?.closeMenu(); // Tenta fechar o menu
            } else if (currentScreen !== 'home') {
                showHomeScreen();
            }
        };
        window.showNotification = showNotification;
        window.updateFooterActions = updateFooterActions;
        window.showDetailsForFocusedGame = showDetailsForFocusedGame; 
        window.exitApp = exitApp; // Expondo a função exitApp para o settings-menu.js

        // Inicialização dos Módulos
        console.log("Main.js: Inicializando módulos de frontend...");
        window.gamesManager = new GamesManager();
        window.programsModule.initialize();
        window.gamepadManager = new GamepadManager();
        window.gamepadManager.initialize();
        window.gameDetailsManager = new GameDetailsManager();
        window.settingsMenuManager = new SettingsMenuManager(); // ADICIONADO: Inicializa o gerenciador do menu
        console.log("Main.js: Módulos de frontend inicializados com sucesso.");

        setupEventListeners();
        await updateSystemInfo();
        startSystemInfoUpdates();
        
        updateFooterActions();
        
        setTimeout(() => focusFirstElement(), 100);
        hideLoadingOverlay();
        console.log('Dashboard inicializado com sucesso');
    } catch (error) {
        console.error('Erro na inicialização:', error);
        showNotification('Erro ao inicializar dashboard', 'error');
    }
});

// Configurar event listeners
function setupEventListeners() {
    if (elements.options.games) elements.options.games.addEventListener('click', () => showGamesScreen());
    if (elements.options.programs) elements.options.programs.addEventListener('click', () => showProgramsScreen());
    if (elements.options.shutdown) elements.options.shutdown.addEventListener('click', () => showShutdownScreen());
    
    // O event listener para o botão de configurações (#settings-button)
    // é configurado DENTRO da classe SettingsMenuManager (no settings-menu.js)

    document.addEventListener('keydown', handleKeyboardNavigation);
    setupFocusHandlers();
}

function showDetailsForFocusedGame() {
    if (currentScreen !== 'games') return; 

    const focusedElement = document.activeElement;
    if (!focusedElement || !focusedElement.classList.contains('game-item')) {
        console.log('Nenhum item de jogo focado para mostrar detalhes.');
        return;
    }

    const gameId = focusedElement.dataset.gameId;
    if (!gameId) {
        console.error('Elemento do jogo focado não tem data-game-id.');
        return;
    }

    try {
        const gamePath = atob(gameId); 
        const game = window.gamesManager.cachedGames.find(g => g.path === gamePath);

        if (game && window.gameDetailsManager) {
            window.gameDetailsManager.show(game);
        } else {
            console.error('Não foi possível encontrar o jogo no cache para o ID:', gameId);
        }
    } catch (e) {
        console.error("Erro ao decodificar gameId ou mostrar detalhes:", e);
    }
}

function updateFooterActions() {
    const container = elements.footerActions;
    if (!container) return;

    const isConnected = window.gamepadManager?.isConnected || false;
    const menuOpen = window.settingsMenuManager?.isMenuOpen || false;

    let actions = {
        confirm: { enabled: true, label: 'Confirmar' },
        back: { enabled: currentScreen !== 'home' || menuOpen, label: 'Voltar' }, // Botão B também fecha o menu
        details: { enabled: currentScreen === 'games' && !menuOpen, label: 'Detalhes' }
    };

    // Se o menu de configurações estiver aberto, as ações do rodapé mudam
    if (menuOpen) {
        actions = {
            confirm: { enabled: true, label: 'Selecionar' }, // Se houver itens no menu
            back: { enabled: true, label: 'Fechar Menu' },
            details: {enabled: false } // Sem "Detalhes" quando o menu está aberto
        };
    }
    
    let hintsHTML = '';

    if (actions.details.enabled) {
        const key = isConnected ? `<div class="action-button button-y">Y</div>` : `<div class="key-hint">Espaço</div>`;
        hintsHTML += `<div class="action-hint">${key}<span>${actions.details.label}</span></div>`;
    }

    if (actions.confirm.enabled) {
        const key = isConnected ? `<div class="action-button button-a">A</div>` : `<div class="key-hint">Enter</div>`;
        hintsHTML += `<div class="action-hint">${key}<span>${actions.confirm.label}</span></div>`;
    }

    if (actions.back.enabled) {
        const key = isConnected ? `<div class="action-button button-b">B</div>` : `<div class="key-hint">Esc</div>`;
        hintsHTML += `<div class="action-hint">${key}<span>${actions.back.label}</span></div>`;
    }

    container.innerHTML = hintsHTML;
}

// Gerenciamento de Telas
function showScreen(screenId) { 
    Object.values(elements.screens).forEach(screen => {
        if (screen) screen.classList.remove('active');
    });

    const targetScreen = document.getElementById(screenId); 
    if (targetScreen) {
        targetScreen.classList.add('active');
        currentScreen = Object.keys(elements.screens).find(key => elements.screens[key] === targetScreen) || 'home';
        
        updateFooterActions();
        setTimeout(() => focusFirstElement(), 100);
    } else {
        console.error(`Tela com ID "${screenId}" não encontrada.`);
    }
}

function setupFocusHandlers() {
    document.body.addEventListener('focusin', (e) => {
        const target = e.target.closest('.menu-item, .game-item, .program-item, .power-option, .back-button, button, .settings-menu-item, .close-button');
        if (target) {
            document.querySelectorAll('.focused').forEach(el => el.classList.remove('focused'));
            target.classList.add('focused');
        }
    });
}

function handleKeyboardNavigation(event) {
    if (isLoading) return;
    // Se o menu de configurações estiver aberto, permite que ele trate o Escape primeiro
    if (event.key === 'Escape' && window.settingsMenuManager?.isMenuOpen) {
        window.settingsMenuManager.closeMenu();
        event.preventDefault();
        return;
    }

    switch(event.key) {
        case 'Escape': case 'Backspace':
            if (window.navigateBack) window.navigateBack();
            break;
        case 'Enter':
            if (window.activateFocusedElement) window.activateFocusedElement();
            event.preventDefault();
            break;
        case ' ':
            const focused = document.activeElement;
            if (focused && focused.classList.contains('game-item') && currentScreen === 'games') {
                if(window.showDetailsForFocusedGame) window.showDetailsForFocusedGame();
            } else {
                if (window.activateFocusedElement) window.activateFocusedElement();
            }
            event.preventDefault();
            break;
        case 'ArrowUp': navigateFocus('up'); event.preventDefault(); break;
        case 'ArrowDown': navigateFocus('down'); event.preventDefault(); break;
        case 'ArrowLeft': navigateFocus('left'); event.preventDefault(); break;
        case 'ArrowRight': navigateFocus('right'); event.preventDefault(); break;
    }
}

function navigateFocus(direction) {
    const focusableElements = getFocusableElements();
    if (focusableElements.length === 0) return;
    let currentIndex = focusableElements.findIndex(el => el === document.activeElement);
    if (currentIndex === -1 && focusableElements.length > 0) {
        focusableElements[0].focus();
        return;
    }
    
    let newIndex = currentIndex;
    const currentItem = focusableElements[currentIndex];
    
    // Se o menu de configurações estiver aberto, a navegação é vertical simples
    if (window.settingsMenuManager?.isMenuOpen) {
        if (direction === 'up') newIndex = currentIndex - 1;
        else if (direction === 'down') newIndex = currentIndex + 1;
    } else {
        const grid = currentItem?.closest('.content-grid');
        if (grid && (currentScreen === 'games' || currentScreen === 'programs')) {
            const style = window.getComputedStyle(grid);
            const columns = style.getPropertyValue('grid-template-columns').split(' ').length;
            switch(direction) {
                case 'up': newIndex = currentIndex - columns; break;
                case 'down': newIndex = currentIndex + columns; break;
                case 'left': if (currentIndex % columns !== 0) newIndex = currentIndex - 1; break;
                case 'right': if ((currentIndex + 1) % columns !== 0 && (currentIndex + 1) < focusableElements.length) newIndex = currentIndex + 1; break;
            }
        } else {
             switch(direction) {
                case 'up': case 'left': newIndex = currentIndex - 1; break;
                case 'down': case 'right': newIndex = currentIndex + 1; break;
            }
        }
    }

    if (newIndex >= 0 && newIndex < focusableElements.length) {
        focusableElements[newIndex].focus();
    } else if (direction === 'up' && newIndex < 0) {
        focusableElements[focusableElements.length - 1].focus();
    } else if (direction === 'down' && newIndex >= focusableElements.length) {
        focusableElements[0].focus();
    }
}

function getFocusableElements() {
    let currentActiveScreenElement;
    if (window.settingsMenuManager?.isMenuOpen) {
        currentActiveScreenElement = document.getElementById('settings-menu');
    } else {
        currentActiveScreenElement = elements.screens[currentScreen];
    }

    if (!currentActiveScreenElement) return [];
    
    // Seletores para elementos focáveis
    const selectors = '.menu-item, .game-item, .program-item, .power-option, .back-button, button, .settings-menu-item, .close-button, #settings-button';
    
    return Array.from(currentActiveScreenElement.querySelectorAll(selectors)).filter(el => {
        return el.offsetParent !== null && !el.disabled && !el.classList.contains('hidden') && el.tabIndex !== -1;
    });
}

function focusFirstElement() {
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
        focusableElements[0].focus();
    }
}

function showHomeScreen() { showScreen('home-screen'); }
async function showGamesScreen() {
    showScreen('games-screen');
    if (window.gamesManager) await window.gamesManager.loadGames();
}
async function showProgramsScreen() {
    showScreen('programs-screen');
    if (window.programsModule) await window.programsModule.loadPrograms();
}
function showShutdownScreen() { showScreen('shutdown-screen'); }

async function updateSystemInfo() {
    try {
        systemInfo = await ipcRenderer.invoke('get-system-info');
        if (systemInfo) updateSystemDisplay();
    } catch (error) {
        console.error('Erro ao atualizar informações do sistema:', error);
    }
}

function updateSystemDisplay() {
    if (!systemInfo) return;
    try {
        if (systemInfo.cpu) {
            updateElement(elements.systemInfo.cpuModel, systemInfo.cpu.model);
            updateElement(elements.systemInfo.cpuTemp, systemInfo.cpu.temperature);
            updateElement(elements.systemInfo.cpuUsage, systemInfo.cpu.usage);
        }
        if (systemInfo.gpu) {
            updateElement(elements.systemInfo.gpuModel, systemInfo.gpu.model);
            updateElement(elements.systemInfo.gpuTemp, systemInfo.gpu.temperature);
            updateElement(elements.systemInfo.gpuMemory, systemInfo.gpu.memory);
        }
        if (systemInfo.memory) {
            updateElement(elements.systemInfo.ramTotal, systemInfo.memory.total);
            updateElement(elements.systemInfo.ramUsed, systemInfo.memory.used);
            updateElement(elements.systemInfo.ramAvailable, systemInfo.memory.available);
            updateElement(elements.systemInfo.ramUsage, systemInfo.memory.percentage);
        }
        if (systemInfo.network) {
            updateElement(elements.systemInfo.networkStatus, systemInfo.network.status);
            updateElement(elements.systemInfo.networkType, systemInfo.network.type);
            updateElement(elements.systemInfo.networkIp, systemInfo.network.ip);
        }
        if (systemInfo.audio) {
            updateElement(elements.systemInfo.audioVolume, systemInfo.audio.volume);
        }
        if (systemInfo.datetime) {
            updateElement(elements.systemInfo.currentTime, systemInfo.datetime.time);
            updateElement(elements.systemInfo.currentDate, systemInfo.datetime.date);
            updateElement(elements.systemInfo.dayOfWeek, systemInfo.datetime.dayOfWeek);
        }
        updateStorageDisplay();
    } catch (error) {
        console.error('Erro ao atualizar display do sistema:', error);
    }
}

function updateElement(element, value) {
    if (element && value !== undefined && value !== null) {
        element.textContent = value;
    }
}

function updateStorageDisplay() {
    if (!elements.systemInfo.storageInfo) return;
    if (!systemInfo.storage || !Array.isArray(systemInfo.storage) || systemInfo.storage.length === 0) {
        elements.systemInfo.storageInfo.innerHTML = '<div class="storage-item">Nenhum disco encontrado</div>';
        return;
    }
    try {
        const storageHtml = systemInfo.storage.map(disk => `
            <div class="storage-item">
                <span class="storage-label">${disk.drive || 'Disco'}:</span>
                <span class="storage-usage">${disk.available || '0GB'} / ${disk.total || '0GB'}</span>
                <span class="storage-percent">(${disk.percentage || '0%'})</span>
            </div>
        `).join('');
        elements.systemInfo.storageInfo.innerHTML = storageHtml;
    } catch (error) {
        console.error('Erro ao atualizar storage:', error);
        elements.systemInfo.storageInfo.innerHTML = '<div class="storage-item">Erro ao carregar discos</div>';
    }
}

function startSystemInfoUpdates() {
    updateInterval = setInterval(updateSystemInfo, 5000);
}

async function shutdownComputer() {
    if (await confirmAction('Tem certeza que deseja desligar o computador?')) {
        showLoadingOverlay('Desligando computador...');
        try {
            await ipcRenderer.invoke('shutdown-computer');
        } catch (error) {
            console.error('Erro ao desligar:', error);
            showNotification('Erro ao desligar computador', 'error');
            hideLoadingOverlay();
        }
    }
}

async function restartComputer() {
    if (await confirmAction('Tem certeza que deseja reiniciar o computador?')) {
        showLoadingOverlay('Reiniciando computador...');
        try {
            await ipcRenderer.invoke('restart-computer');
        } catch (error) {
            console.error('Erro ao reiniciar:', error);
            showNotification('Erro ao reiniciar computador', 'error');
            hideLoadingOverlay();
        }
    }
}

async function minimizeApp() {
    try {
        await ipcRenderer.invoke('minimize-startzone');
    } catch (error) {
        console.error('Erro ao minimizar:', error);
        showNotification('Erro ao minimizar aplicação', 'error');
    }
}

async function exitApp() {
    if (await confirmAction('Tem certeza que deseja fechar o StartZone?')) {
        try {
            if (updateInterval) {
                clearInterval(updateInterval);
            }
            await ipcRenderer.invoke('exit-startzone');
        } catch (error) {
            console.error('Erro ao sair:', error);
            window.close(); // Fallback se o IPC falhar
        }
    }
}

function showLoadingOverlay(text = 'Carregando...') {
    isLoading = true;
    if (elements.loadingOverlay) {
        const loadingText = elements.loadingOverlay.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = text;
        }
        elements.loadingOverlay.style.display = 'flex';
    }
}

function hideLoadingOverlay() {
    isLoading = false;
    if (elements.loadingOverlay) {
        elements.loadingOverlay.style.display = 'none';
    }
}

function showLoadingInGrid(grid, text = 'Carregando...') {
    if (grid) {
        grid.innerHTML = `<div class="loading-message">${text}</div>`;
    }
}

function showErrorInGrid(grid, text = 'Erro ao carregar') {
    if (grid) {
        grid.innerHTML = `<div class="error-message">${text}</div>`;
    }
}

function showNotification(message, type = 'info') {
    console.log(`Notification [${type}]: ${message}`);
    if (!elements.notificationContainer) {
        console.warn('Container de notificações não encontrado');
        return;
    }
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    elements.notificationContainer.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

function confirmAction(message) {
    return new Promise((resolve) => {
        // Substituir por um modal customizado se quiser um visual mais integrado
        const result = confirm(message);
        resolve(result);
    });
}

window.addEventListener('beforeunload', () => {
    console.log('Limpando recursos antes de fechar...');
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});

console.log('Main.js carregado - StartZone Dashboard pronto!');

window.debugDashboard = {
    systemInfo: () => systemInfo,
    currentScreen: () => currentScreen,
    elements: () => elements
};