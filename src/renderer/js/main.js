// Estado da aplicação
let currentScreen = 'home';
let systemInfo = null;
let updateInterval = null;
let games = [];
let programs = [];
let isLoading = false;
let focusedIndex = 0;
let gamepadIndex = -1;
let gamepadConnected = false;

// Elementos do DOM
const elements = {
    screens: {
        home: document.getElementById('home-screen'),
        games: document.getElementById('games-screen'),
        programs: document.getElementById('programs-screen'),
        shutdown: document.getElementById('shutdown-screen')
    },
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
        gamesBack: document.getElementById('games-back'),
        programsBack: document.getElementById('programs-back'),
        shutdownBack: document.getElementById('shutdown-back'),
        exitApp: document.getElementById('exit-app')
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
        setupEventListeners();
        window.programsModule.initialize(); 
        await updateSystemInfo();
        startSystemInfoUpdates();
        setupGamepadSupport();
        
        // Focar no primeiro elemento da tela inicial
        setTimeout(() => {
            focusFirstElement();
        }, 100);
        
        // Remove o overlay de loading inicial
        hideLoadingOverlay();
        
        console.log('Dashboard inicializado com sucesso');
    } catch (error) {
        console.error('Erro na inicialização:', error);
        showNotification('Erro ao inicializar dashboard', 'error');
    }
});

// Configurar event listeners
function setupEventListeners() {
    // Navegação principal
    if (elements.options.games) {
        elements.options.games.addEventListener('click', () => showGamesScreen());
    }
    if (elements.options.programs) {
        elements.options.programs.addEventListener('click', () => showProgramsScreen());
    }
    if (elements.options.shutdown) {
        elements.options.shutdown.addEventListener('click', () => showShutdownScreen());
    }
    
    // Botões de voltar
    if (elements.buttons.gamesBack) {
        elements.buttons.gamesBack.addEventListener('click', () => showHomeScreen());
    }
    if (elements.buttons.programsBack) {
        elements.buttons.programsBack.addEventListener('click', () => showHomeScreen());
    }
    if (elements.buttons.shutdownBack) {
        elements.buttons.shutdownBack.addEventListener('click', () => showHomeScreen());
    }
    
    // Opções de energia
    if (elements.options.shutdownPc) {
        elements.options.shutdownPc.addEventListener('click', () => shutdownComputer());
    }
    if (elements.options.restartPc) {
        elements.options.restartPc.addEventListener('click', () => restartComputer());
    }
    if (elements.options.minimizeApp) {
        elements.options.minimizeApp.addEventListener('click', () => minimizeApp());
    }
    
    // Botão sair
    if (elements.buttons.exitApp) {
        elements.buttons.exitApp.addEventListener('click', () => exitApp());
    }
    
    // Teclas do teclado para navegação
    document.addEventListener('keydown', handleKeyboardNavigation);
    
    // Eventos de foco para elementos
    setupFocusHandlers();
}

function setupFocusHandlers() {
    const focusableElements = document.querySelectorAll('.menu-item, .game-item, .program-item, .power-option, .back-button, button');
    
    focusableElements.forEach((element, index) => {
        element.addEventListener('focus', () => {
            focusedIndex = index;
            element.classList.add('focused');
        });
        
        element.addEventListener('blur', () => {
            element.classList.remove('focused');
        });
    });
}

// Suporte a controles/gamepads
function setupGamepadSupport() {
    window.addEventListener('gamepadconnected', (e) => {
        console.log('Controle conectado:', e.gamepad.id);
        gamepadIndex = e.gamepad.index;
        gamepadConnected = true;
        showNotification('Controle conectado', 'success');
        startGamepadLoop();
    });
    
    window.addEventListener('gamepaddisconnected', (e) => {
        console.log('Controle desconectado:', e.gamepad.id);
        gamepadConnected = false;
        showNotification('Controle desconectado', 'info');
    });
    
    // Verificar controles já conectados
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
            gamepadIndex = i;
            gamepadConnected = true;
            console.log('Controle já conectado:', gamepads[i].id);
            startGamepadLoop();
            break;
        }
    }
}

let gamepadLoopRunning = false;

function startGamepadLoop() {
    if (gamepadLoopRunning) return;
    gamepadLoopRunning = true;
    
    let lastButtonStates = {};
    
    function gamepadLoop() {
        if (!gamepadConnected) {
            gamepadLoopRunning = false;
            return;
        }
        
        const gamepad = navigator.getGamepads()[gamepadIndex];
        if (!gamepad) {
            gamepadConnected = false;
            gamepadLoopRunning = false;
            return;
        }
        
        // Verificar botões pressionados
        gamepad.buttons.forEach((button, index) => {
            const isPressed = button.pressed;
            const wasPressed = lastButtonStates[index] || false;
            
            if (isPressed && !wasPressed) {
                handleGamepadButton(index);
            }
            
            lastButtonStates[index] = isPressed;
        });
        
        // Verificar analógicos
        const leftStickX = gamepad.axes[0];
        const leftStickY = gamepad.axes[1];
        const dpadX = gamepad.axes[6];
        const dpadY = gamepad.axes[7];
        
        // Navegação com analógico esquerdo ou dpad
        if (Math.abs(leftStickX) > 0.5 || Math.abs(dpadX) > 0.5) {
            if (leftStickX > 0.5 || dpadX > 0.5) {
                handleGamepadDirection('right');
            } else if (leftStickX < -0.5 || dpadX < -0.5) {
                handleGamepadDirection('left');
            }
        }
        
        if (Math.abs(leftStickY) > 0.5 || Math.abs(dpadY) > 0.5) {
            if (leftStickY > 0.5 || dpadY > 0.5) {
                handleGamepadDirection('down');
            } else if (leftStickY < -0.5 || dpadY < -0.5) {
                handleGamepadDirection('up');
            }
        }
        
        requestAnimationFrame(gamepadLoop);
    }
    
    gamepadLoop();
}

function handleGamepadButton(buttonIndex) {
    if (isLoading) return;
    
    switch (buttonIndex) {
        case 0: // A (Xbox) / X (PlayStation)
            const focusedElement = document.activeElement;
            if (focusedElement && focusedElement.click) {
                focusedElement.click();
            }
            break;
        case 1: // B (Xbox) / Circle (PlayStation)
            if (currentScreen !== 'home') {
                showHomeScreen();
            }
            break;
        case 9: // Menu/Start
            if (currentScreen === 'home') {
                exitApp();
            }
            break;
    }
}

function handleGamepadDirection(direction) {
    if (isLoading) return;
    
    switch (direction) {
        case 'up':
            navigateFocus('up');
            break;
        case 'down':
            navigateFocus('down');
            break;
        case 'left':
            navigateFocus('left');
            break;
        case 'right':
            navigateFocus('right');
            break;
    }
}

// Navegação por teclado/controle
function handleKeyboardNavigation(event) {
    if (isLoading) return;
    
    switch(event.key) {
        case 'Escape':
            if (currentScreen !== 'home') {
                showHomeScreen();
            }
            break;
        case 'Enter':
        case ' ':
            const focusedElement = document.activeElement;
            if (focusedElement && focusedElement.click) {
                focusedElement.click();
            }
            break;
        case 'ArrowUp':
            navigateFocus('up');
            event.preventDefault();
            break;
        case 'ArrowDown':
            navigateFocus('down');
            event.preventDefault();
            break;
        case 'ArrowLeft':
            navigateFocus('left');
            event.preventDefault();
            break;
        case 'ArrowRight':
            navigateFocus('right');
            event.preventDefault();
            break;
    }
}

function navigateFocus(direction) {
    const focusableElements = getFocusableElements();
    if (focusableElements.length === 0) return;
    
    const currentIndex = focusableElements.indexOf(document.activeElement);
    let newIndex;
    
    switch(direction) {
        case 'up':
            newIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
            break;
        case 'down':
            newIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
            break;
        case 'left':
            newIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
            break;
        case 'right':
            newIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
            break;
    }
    
    if (focusableElements[newIndex]) {
        focusableElements[newIndex].focus();
        focusedIndex = newIndex;
    }
}

function getFocusableElements() {
    const currentScreenElement = elements.screens[currentScreen];
    if (!currentScreenElement) return [];
    
    return Array.from(currentScreenElement.querySelectorAll(
        '.menu-item, .game-item, .program-item, .power-option, .back-button, button'
    )).filter(el => {
        return el.offsetParent !== null && !el.disabled && !el.classList.contains('hidden');
    });
}

function focusFirstElement() {
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
        focusableElements[0].focus();
        focusedIndex = 0;
    }
}

// Gerenciamento de telas
function showScreen(screenName) {
    // Esconder todas as telas
    Object.values(elements.screens).forEach(screen => {
        if (screen) {
            screen.classList.remove('active');
        }
    });
    
    // Mostrar tela selecionada
    if (elements.screens[screenName]) {
        elements.screens[screenName].classList.add('active');
        currentScreen = screenName;
        
        // Focar no primeiro elemento da tela
        setTimeout(() => {
            focusFirstElement();
        }, 100);
    }
}

function showHomeScreen() {
    showScreen('home');
}

async function showGamesScreen() {
    showScreen('games');
    await loadGames();
}

async function showProgramsScreen() {
    console.log('Abrindo tela de programas...');
    showScreen('programs');
    try {
        await window.programsModule.loadPrograms();
        console.log('Programas carregados com sucesso.');
    } catch (error) {
        console.error('Erro ao carregar programas via módulo:', error);
    }
}



function showShutdownScreen() {
    showScreen('shutdown');
}

// Carregamento de jogos
async function loadGames() {
    if (games.length > 0) {
        displayGames();
        return;
    }
    
    showLoadingInGrid(elements.grids.games, 'Carregando jogos...');
    
    try {
        games = await ipcRenderer.invoke('get-installed-games');
        displayGames();
    } catch (error) {
        console.error('Erro ao carregar jogos:', error);
        showErrorInGrid(elements.grids.games, 'Erro ao carregar jogos');
    }
}

function displayGames() {
    const grid = elements.grids.games;
    if (!grid) return;
    
    if (!games || games.length === 0) {
        grid.innerHTML = '<div class="no-items">Nenhum jogo encontrado</div>';
        return;
    }
    
    grid.innerHTML = games.map((game, index) => `
        <div class="game-item" tabindex="${index + 1}" data-path="${game.path || ''}" data-name="${game.name}">
            <div class="item-icon">🎮</div>
            <div class="item-info">
                <div class="item-name">${game.name}</div>
                <div class="item-type">${game.platform || 'PC'}</div>
            </div>
        </div>
    `).join('');
    
    // Adicionar event listeners para os jogos
    grid.querySelectorAll('.game-item').forEach(item => {
        item.addEventListener('click', () => {
            const path = item.dataset.path;
            const name = item.dataset.name;
            launchGame(path, name);
        });
        
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const path = item.dataset.path;
                const name = item.dataset.name;
                launchGame(path, name);
            }
        });
    });
    
    setupFocusHandlers();
}

async function launchGame(gamePath, gameName) {
    if (!gamePath) {
        showNotification('Caminho do jogo não encontrado', 'error');
        return;
    }
    
    showLoadingOverlay(`Iniciando ${gameName}...`);
    
    try {
        const success = await ipcRenderer.invoke('launch-program', gamePath);
        if (success) {
            showNotification(`${gameName} iniciado com sucesso!`, 'success');
        } else {
            showNotification(`Erro ao iniciar ${gameName}`, 'error');
        }
    } catch (error) {
        console.error('Erro ao iniciar jogo:', error);
        showNotification(`Erro ao iniciar ${gameName}`, 'error');
    } finally {
        hideLoadingOverlay();
    }
}

// Atualização das informações do sistema
async function updateSystemInfo() {
    try {
        systemInfo = await ipcRenderer.invoke('get-system-info');
        
        if (systemInfo) {
            updateSystemDisplay();
        }
    } catch (error) {
        console.error('Erro ao atualizar informações do sistema:', error);
        // Não mostrar notificação de erro para evitar spam
    }
}

function updateSystemDisplay() {
    if (!systemInfo) return;
    
    try {
        // Atualizar informações do CPU
        if (systemInfo.cpu) {
            updateElement(elements.systemInfo.cpuModel, systemInfo.cpu.model);
            updateElement(elements.systemInfo.cpuTemp, systemInfo.cpu.temperature);
            updateElement(elements.systemInfo.cpuUsage, systemInfo.cpu.usage);
        }
        
        // Atualizar informações da GPU
        if (systemInfo.gpu) {
            updateElement(elements.systemInfo.gpuModel, systemInfo.gpu.model);
            updateElement(elements.systemInfo.gpuTemp, systemInfo.gpu.temperature);
            updateElement(elements.systemInfo.gpuMemory, systemInfo.gpu.memory);
        }
        
        // Atualizar informações da RAM
        if (systemInfo.memory) {
            updateElement(elements.systemInfo.ramTotal, systemInfo.memory.total);
            updateElement(elements.systemInfo.ramUsed, systemInfo.memory.used);
            updateElement(elements.systemInfo.ramAvailable, systemInfo.memory.available);
            updateElement(elements.systemInfo.ramUsage, systemInfo.memory.percentage);
        }
        
        // Atualizar informações de rede
        if (systemInfo.network) {
            updateElement(elements.systemInfo.networkStatus, systemInfo.network.status);
            updateElement(elements.systemInfo.networkType, systemInfo.network.type);
            updateElement(elements.systemInfo.networkIp, systemInfo.network.ip);
        }
        
        // Atualizar informações de áudio
        if (systemInfo.audio) {
            updateElement(elements.systemInfo.audioVolume, systemInfo.audio.volume);
        }
        
        // Atualizar data e hora
        if (systemInfo.datetime) {
            updateElement(elements.systemInfo.currentTime, systemInfo.datetime.time);
            updateElement(elements.systemInfo.currentDate, systemInfo.datetime.date);
            updateElement(elements.systemInfo.dayOfWeek, systemInfo.datetime.dayOfWeek);
        }
        
        // Atualizar informações de armazenamento
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
    // Atualizar a cada 5 segundos
    updateInterval = setInterval(updateSystemInfo, 5000);
}

// Funções de energia
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
            // Limpar interval antes de sair
            if (updateInterval) {
                clearInterval(updateInterval);
            }
            
            await ipcRenderer.invoke('exit-startzone');
        } catch (error) {
            console.error('Erro ao sair:', error);
            // Forçar saída se houver erro
            window.close();
        }
    }
}

// Utilitários de interface
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
    
    // Animar entrada
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Remover após 4 segundos
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
        // Implementação simples com confirm nativo
        // Pode ser substituído por modal customizado no futuro
        const result = confirm(message);
        resolve(result);
    });
}

// Limpeza quando a janela for fechada
window.addEventListener('beforeunload', () => {
    console.log('Limpando recursos antes de fechar...');
    
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    
    gamepadConnected = false;
    gamepadLoopRunning = false;
});

// Log para debug
console.log('Main.js carregado - StartZone Dashboard pronto!');

// Função para debug - pode ser removida em produção
window.debugDashboard = {
    systemInfo: () => systemInfo,
    currentScreen: () => currentScreen,
    games: () => games,
    programs: () => programs,
    gamepadConnected: () => gamepadConnected,
    elements: () => elements
};