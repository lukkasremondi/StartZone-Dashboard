// Estado da aplicação
let currentScreen = 'home';
let systemInfo = null;
let updateInterval = null;
// As listas de jogos e programas agora são gerenciadas por seus próprios módulos
// let games = []; // Removido
// let programs = []; // Removido
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
        // AJUSTE: Inicializa os módulos PRIMEIRO para garantir que estejam prontos
        console.log("Main.js: Inicializando módulos de frontend...");
        window.gamesManager = new GamesManager();
        window.programsModule.initialize(); 
        console.log("Main.js: Módulos de frontend inicializados com sucesso.");

        setupEventListeners();
        await updateSystemInfo();
        startSystemInfoUpdates();
        setupGamepadSupport();
        
        setTimeout(() => {
            focusFirstElement();
        }, 100);
        
        hideLoadingOverlay();
        
        console.log('Dashboard inicializado com sucesso');
    } catch (error) {
        console.error('Erro na inicialização:', error);
        showNotification('Erro ao inicializar dashboard', 'error');
    }
});

// Configurar event listeners
function setupEventListeners() {
    if (elements.options.games) {
        elements.options.games.addEventListener('click', () => showGamesScreen());
    }
    if (elements.options.programs) {
        elements.options.programs.addEventListener('click', () => showProgramsScreen());
    }
    if (elements.options.shutdown) {
        elements.options.shutdown.addEventListener('click', () => showShutdownScreen());
    }
    if (elements.buttons.gamesBack) {
        elements.buttons.gamesBack.addEventListener('click', () => showHomeScreen());
    }
    if (elements.buttons.programsBack) {
        elements.buttons.programsBack.addEventListener('click', () => showHomeScreen());
    }
    if (elements.buttons.shutdownBack) {
        elements.buttons.shutdownBack.addEventListener('click', () => showHomeScreen());
    }
    if (elements.options.shutdownPc) {
        elements.options.shutdownPc.addEventListener('click', () => shutdownComputer());
    }
    if (elements.options.restartPc) {
        elements.options.restartPc.addEventListener('click', () => restartComputer());
    }
    if (elements.options.minimizeApp) {
        elements.options.minimizeApp.addEventListener('click', () => minimizeApp());
    }
    if (elements.buttons.exitApp) {
        elements.buttons.exitApp.addEventListener('click', () => exitApp());
    }
    document.addEventListener('keydown', handleKeyboardNavigation);
    setupFocusHandlers();
}

// AJUSTE: A função showGamesScreen agora delega para o GamesManager
async function showGamesScreen() {
    showScreen('games'); // Mostra a div da tela de jogos
    if (window.gamesManager) {
        console.log("Main.js: Chamando o gamesManager para carregar os jogos...");
        await window.gamesManager.loadGames(); // Chama a lógica correta do games.js
    } else {
        console.error("Main.js: A inicialização do gamesManager falhou.");
        showErrorInGrid(elements.grids.games, 'Erro ao carregar módulo de jogos');
    }
}

async function showProgramsScreen() {
    showScreen('programs');
    try {
        await window.programsModule.loadPrograms();
    } catch (error) {
        console.error('Erro ao carregar programas via módulo:', error);
    }
}

// REMOÇÃO: As funções antigas de jogos foram completamente removidas daqui.
// A lógica agora vive em `src/renderer/js/games.js`.
// async function loadGames() { ... } <-- REMOVIDO
// function displayGames() { ... } <-- REMOVIDO
// async function launchGame() { ... } <-- REMOVIDO


// --- O RESTANTE DO SEU CÓDIGO PERMANECE IGUAL ---

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
        gamepad.buttons.forEach((button, index) => {
            const isPressed = button.pressed;
            const wasPressed = lastButtonStates[index] || false;
            if (isPressed && !wasPressed) {
                handleGamepadButton(index);
            }
            lastButtonStates[index] = isPressed;
        });
        const leftStickX = gamepad.axes[0];
        const leftStickY = gamepad.axes[1];
        const dpadX = gamepad.axes[6];
        const dpadY = gamepad.axes[7];
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
        case 0:
            const focusedElement = document.activeElement;
            if (focusedElement && focusedElement.click) {
                focusedElement.click();
            }
            break;
        case 1:
            if (currentScreen !== 'home') {
                showHomeScreen();
            }
            break;
        case 9:
            if (currentScreen === 'home') {
                exitApp();
            }
            break;
    }
}

function handleGamepadDirection(direction) {
    if (isLoading) return;
    switch (direction) {
        case 'up': navigateFocus('up'); break;
        case 'down': navigateFocus('down'); break;
        case 'left': navigateFocus('left'); break;
        case 'right': navigateFocus('right'); break;
    }
}

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
        case 'ArrowUp': navigateFocus('up'); event.preventDefault(); break;
        case 'ArrowDown': navigateFocus('down'); event.preventDefault(); break;
        case 'ArrowLeft': navigateFocus('left'); event.preventDefault(); break;
        case 'ArrowRight': navigateFocus('right'); event.preventDefault(); break;
    }
}

function navigateFocus(direction) {
    const focusableElements = getFocusableElements();
    if (focusableElements.length === 0) return;
    const currentIndex = focusableElements.indexOf(document.activeElement);
    let newIndex;
    switch(direction) {
        case 'up': newIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1; break;
        case 'down': newIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0; break;
        case 'left': newIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1; break;
        case 'right': newIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0; break;
    }
    if (focusableElements[newIndex]) {
        focusableElements[newIndex].focus();
        focusedIndex = newIndex;
    }
}

function getFocusableElements() {
    const currentScreenElement = elements.screens[currentScreen];
    if (!currentScreenElement) return [];
    return Array.from(currentScreenElement.querySelectorAll('.menu-item, .game-item, .program-item, .power-option, .back-button, button')).filter(el => {
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

function showScreen(screenName) {
    Object.values(elements.screens).forEach(screen => {
        if (screen) screen.classList.remove('active');
    });
    if (elements.screens[screenName]) {
        elements.screens[screenName].classList.add('active');
        currentScreen = screenName;
        setTimeout(() => {
            focusFirstElement();
        }, 100);
    }
}

function showHomeScreen() { showScreen('home'); }
function showShutdownScreen() { showScreen('shutdown'); }

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
            window.close();
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
        const result = confirm(message);
        resolve(result);
    });
}

window.addEventListener('beforeunload', () => {
    console.log('Limpando recursos antes de fechar...');
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    gamepadConnected = false;
    gamepadLoopRunning = false;
});

console.log('Main.js carregado - StartZone Dashboard pronto!');

window.debugDashboard = {
    systemInfo: () => systemInfo,
    currentScreen: () => currentScreen,
    // games: () => games, // Removido
    programs: () => programs,
    gamepadConnected: () => gamepadConnected,
    elements: () => elements
};