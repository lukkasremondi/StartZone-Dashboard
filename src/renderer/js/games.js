// A variável 'cachedGames' foi movida para dentro da classe GamesManager
// para que o main.js possa acessá-la através da instância global.

async function fetchAndCacheGames(manager) {
    // Agora a função recebe a instância do manager como argumento
    if (manager.cachedGames.length > 0) {
        return manager.cachedGames;
    }
    if (manager.isFetching && manager.fetchPromise) {
        return await manager.fetchPromise;
    }
    console.log('GamesManager: Buscando e cacheando a lista de jogos pela primeira vez...');
    manager.isFetching = true;

    manager.fetchPromise = (async () => {
        try {
            console.log('GamesManager: Chamando window.electronAPI.getInstalledGames()...');
            const gamesFromBackend = await window.electronAPI.getInstalledGames();
            manager.cachedGames = gamesFromBackend || [];
            console.log(`GamesManager: Cache de jogos preenchido com ${manager.cachedGames.length} itens.`);
            return manager.cachedGames;
        } catch (error) {
            console.error("GamesManager: Erro fatal ao buscar jogos para o cache:", error);
            manager.cachedGames = [];
            return manager.cachedGames;
        } finally {
            manager.isFetching = false;
            manager.fetchPromise = null;
        }
    })();
    return await manager.fetchPromise;
}

class GamesManager {
    constructor() {
        this.cachedGames = []; // AGORA É UMA PROPRIEDADE DA CLASSE
        this.fetchPromise = null;
        this.isFetching = false;
        this.filteredGames = [];
        this.currentFilter = 'all';
        this.searchTerm = '';
        this.isLoading = false;
        this.init();
    }

    init() {
        console.log("GamesManager: Instância criada e inicializada.");
        this.bindEvents();
        this.createSearchInterface();
        this.createFilterInterface();

        if (window.electronAPI) {
            window.electronAPI.onGameStarted((game) => this.setGameState(game, true));
            window.electronAPI.onGameStopped((game) => this.setGameState(game, false));
            console.log("GamesManager: Listeners de estado de jogo configurados.");
        }
    }

    bindEvents() {
        const backButton = document.getElementById('games-back');
        if (backButton) {
            backButton.addEventListener('click', () => this.goBack());
        }
    }

    createSearchInterface() {
        const screenHeader = document.querySelector('#games-screen .screen-header');
        if (!screenHeader || screenHeader.querySelector('.search-container')) return;

        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        searchContainer.innerHTML = `<input type="text" id="games-search" placeholder="Pesquisar jogos..." class="search-input"><button id="search-clear" class="search-clear">✕</button>`;
        screenHeader.appendChild(searchContainer);

        const searchInput = document.getElementById('games-search');
        const clearButton = document.getElementById('search-clear');
        searchInput.addEventListener('input', (e) => {
            this.searchTerm = e.target.value;
            this.filterGames();
        });
        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            this.searchTerm = '';
            this.filterGames();
        });
    }

    createFilterInterface() {
        const screenHeader = document.querySelector('#games-screen .screen-header');
        if (!screenHeader || screenHeader.querySelector('.filter-container')) return;
        
        const filterContainer = document.createElement('div');
        filterContainer.className = 'filter-container';
        filterContainer.innerHTML = `<div class="filter-tabs"><button class="filter-tab active" data-filter="all">Todos</button><button class="filter-tab" data-filter="steam">Steam</button><button class="filter-tab" data-filter="epic">Epic Games</button><button class="filter-tab" data-filter="other">Outros</button></div>`;
        screenHeader.appendChild(filterContainer);

        const filterTabs = document.querySelectorAll('.filter-tab');
        filterTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                filterTabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.filterGames();
            });
        });
    }

    async loadGames() {
        if (this.isLoading) return;
        this.isLoading = true;
        this.showLoading();

        try {
            await fetchAndCacheGames(this); // Passa a instância para a função
            this.filteredGames = [...this.cachedGames];
            this.currentFilter = 'all';
            this.searchTerm = '';
            
            const searchInput = document.getElementById('games-search');
            if (searchInput) searchInput.value = '';
            
            const filterTabs = document.querySelectorAll('.filter-tab');
            filterTabs.forEach(t => t.classList.remove('active'));
            const allTab = document.querySelector('[data-filter="all"]');
            if (allTab) allTab.classList.add('active');
            
            this.renderGames();
        } catch (error) {
            console.error('Erro ao carregar jogos:', error);
            this.filteredGames = [];
            this.renderGames();
        } finally {
            this.isLoading = false;
        }
    }

    async filterGames() {
        if (this.cachedGames.length === 0) {
            await fetchAndCacheGames(this);
        }
        
        let filtered = [...this.cachedGames];

        if (this.currentFilter !== 'all') {
            const platformMap = {
                'steam': 'Steam',
                'epic': 'Epic Games',
                'other': 'Local Games'
            };
            filtered = filtered.filter(game => (game.platform || '').toLowerCase().includes(platformMap[this.currentFilter].toLowerCase()));
        }

        if (this.searchTerm.trim()) {
            const searchLower = this.searchTerm.toLowerCase();
            filtered = filtered.filter(game => game.name.toLowerCase().includes(searchLower));
        }

        this.filteredGames = filtered;
        this.renderGames();
    }
    
    detectGamePlatform(game) {
        const backendPlatform = game.platform ? game.platform.toLowerCase() : 'other';
        if (backendPlatform.includes('steam')) return 'steam';
        if (backendPlatform.includes('epic')) return 'epic';
        return 'other';
    }

    renderGames() {
        const gamesGrid = document.getElementById('games-grid');
        if (!gamesGrid) return;

        if (this.filteredGames.length === 0) {
            gamesGrid.innerHTML = `<div class="no-games"><div class="no-games-icon">🎮</div><div class="no-games-text">${this.searchTerm ? 'Nenhum jogo encontrado para a pesquisa' : 'Nenhum jogo encontrado para este filtro'}</div></div>`;
            return;
        }

        const sortedGames = [...this.filteredGames].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

        gamesGrid.innerHTML = '';
        for (const game of sortedGames) {
            const gameElement = this.createGameElement(game);
            gamesGrid.appendChild(gameElement);
        }
    }

    createGameElement(game) {
        const gameDiv = document.createElement('div');
        gameDiv.className = 'game-item';
        gameDiv.setAttribute('tabindex', '0');

        if (game.path) {
            try {
                gameDiv.dataset.gameId = btoa(game.path);
            } catch (e) {
                gameDiv.dataset.gameId = game.path.replace(/[^a-zA-Z0-9]/g, '');
            }
        }
        
        const coverUrl = game.coverPath; 
        const platform = this.detectGamePlatform(game);
        const platformIcon = this.getPlatformIcon(platform);
        const sizeText = game.size || 'N/A';
        const platformName = game.platform || 'Desconhecido';

        gameDiv.innerHTML = `
            <div class="game-cover">
                ${coverUrl ? `<img src="${coverUrl}" alt="${game.name}" class="game-cover-img" onerror="this.parentElement.innerHTML='<div class=\\'default-game-cover\\'>🎮</div>'">` : '<div class="default-game-cover">🎮</div>'}
                <div class="platform-badge">${platformIcon}</div>
                <div class="game-cover-overlay">
                    <div class="game-actions">
                        <button class="game-launch-btn" title="Executar jogo">▶</button>
                    </div>
                </div>
            </div>
            <div class="game-info">
                <div class="game-name" title="${game.name}">${game.name}</div>
                <div class="game-details">
                    <span class="game-size">${sizeText}</span>
                </div>
                <div class="game-platform">${platformName}</div>
            </div>`;
        
        this.bindGameEvents(gameDiv, game);
        return gameDiv;
    }

    bindGameEvents(gameElement, game) {
        const launchBtn = gameElement.querySelector('.game-launch-btn');
        launchBtn.addEventListener('click', (e) => { 
            e.stopPropagation();
            this.launchGame(game); 
        });
        gameElement.addEventListener('dblclick', () => { this.launchGame(game); });
        
        // AJUSTE: Teclado - 'Enter' inicia o jogo, 'Espaço' abre detalhes.
        gameElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { 
                e.preventDefault();
                this.launchGame(game); 
            }
            if (e.key === ' ') {
                e.preventDefault();
                if (window.showDetailsForFocusedGame) {
                    window.showDetailsForFocusedGame();
                }
            }
        });
    }

    async launchGame(game) {
        if (!game || !game.path) { 
            this.showNotification('Erro: Caminho do jogo não encontrado', 'error');
            return;
        }
        try {
            await window.electronAPI.launchGame(game);
        } catch (error) {
            console.error('Erro ao executar jogo:', error);
            this.showNotification(`Erro ao iniciar ${game.name}: ${error.message}`, 'error');
        }
    }
    
    getPlatformIcon(platform) {
        const icons = { steam: '🟢', epic: '🟣', other: '⚪' };
        return icons[platform] || icons.other;
    }

    showLoading() {
        const gamesGrid = document.getElementById('games-grid');
        if (gamesGrid) {
            gamesGrid.innerHTML = `<div class="loading"><div class="loading-spinner"></div><div>Carregando jogos...</div></div>`;
        }
    }

    goBack() {
        if (window.showScreen) {
            window.showScreen('home-screen');
        }
    }
    
    showNotification(message, type = 'info') {
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    setGameState(game, isRunning) {
        if (!game || !game.path) return;
        
        console.log(`GamesManager: Atualizando estado de '${game.name}' para ${isRunning ? 'Em Execução' : 'Parado'}`);
        
        let gameId;
        try {
            gameId = btoa(game.path);
        } catch (e) {
            gameId = game.path.replace(/[^a-zA-Z0-9]/g, '');
        }

        const gameElement = document.querySelector(`.game-item[data-game-id="${gameId}"]`);

        if (gameElement) {
            if (isRunning) {
                gameElement.classList.add('is-running');
            } else {
                gameElement.classList.remove('is-running');
            }
        }
    }
}

// A inicialização do GamesManager agora é feita pelo main.js para garantir a ordem correta.
document.addEventListener('DOMContentLoaded', () => {
    // A instância é criada no main.js
});