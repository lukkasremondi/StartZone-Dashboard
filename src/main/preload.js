const { ipcRenderer } = require('electron');

// Como contextIsolation está false, podemos adicionar diretamente ao window
window.electronAPI = {
    // Funções de jogos
    getInstalledGames: () => ipcRenderer.invoke('get-installed-games'),
    launchGame: (game) => ipcRenderer.invoke('launch-game', game), // Corrigido para passar o objeto 'game'
    addGameToStartzone: (gameData) => ipcRenderer.invoke('add-game-to-startzone', gameData),
    getGamesSummary: () => ipcRenderer.invoke('get-games-summary'),
    searchGames: (searchTerm) => ipcRenderer.invoke('search-games', searchTerm),
    getGamesByPlatform: (platform) => ipcRenderer.invoke('get-games-by-platform', platform),
    ensureStartzoneFolder: () => ipcRenderer.invoke('ensure-startzone-folder'),
    getGameIcon: (exePath) => ipcRenderer.invoke('get-game-icon', exePath),
    getGameDetails: (gameName) => ipcRenderer.invoke('get-game-details', gameName), // ADICIONADO

    // Funções de programas
    getInstalledPrograms: () => ipcRenderer.invoke('get-installed-programs'),
    launchProgram: (programPath) => ipcRenderer.invoke('launch-program', programPath),
    getProgramIcon: (exePath) => ipcRenderer.invoke('get-program-icon', exePath),

    // Funções do sistema
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),

    // Funções de energia
    shutdownComputer: () => ipcRenderer.invoke('shutdown-computer'),
    restartComputer: () => ipcRenderer.invoke('restart-computer'),

    // Funções da aplicação
    exitStartzone: () => ipcRenderer.invoke('exit-startzone'),
    minimizeStartzone: () => ipcRenderer.invoke('minimize-startzone'),

    // Funções para o status "Em Execução" e outras comunicações do main para o renderer
    onGameStarted: (callback) => ipcRenderer.on('game-started', (event, game) => callback(game)),
    onGameStopped: (callback) => ipcRenderer.on('game-stopped', (event, game) => callback(game)),
};

console.log('Preload.js carregado - APIs disponíveis:', Object.keys(window.electronAPI));