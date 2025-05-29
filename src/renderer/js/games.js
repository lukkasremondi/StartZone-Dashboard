let cachedGames = []; // Cache persistente para a lista de jogos.
let isFetching = false; // Flag para evitar buscas simultâneas.
let fetchPromise = null; // Promise para garantir que todas as chamadas aguardem a mesma busca

/**
 * Busca os jogos do backend APENAS UMA VEZ e os armazena no cache.
 * Em chamadas futuras, retorna a lista do cache instantaneamente.
 */
async function fetchAndCacheGames() {
    // Se o cache já tem jogos, retorna a lista cacheada.
    if (cachedGames.length > 0) {
        return cachedGames;
    }
    
    // Se uma busca já está em andamento, aguarda a mesma promise
    if (isFetching && fetchPromise) {
        return await fetchPromise;
    }

    console.log('Buscando e cacheando a lista de jogos pela primeira vez...');
    isFetching = true;

    // Cria uma nova promise para a busca
    fetchPromise = (async () => {
        try {
            // Diagnóstico detalhado da API do Electron
            console.log('Verificando APIs disponíveis:', {
                hasElectronAPI: !!window.electronAPI,
                availableMethods: window.electronAPI ? Object.keys(window.electronAPI) : [],
                hasGetInstalledGames: !!(window.electronAPI && window.electronAPI.getInstalledGames)
            });

            if (!window.electronAPI) {
                throw new Error('window.electronAPI não está disponível. Verifique o preload.js');
            }
            
            if (!window.electronAPI.getInstalledGames) {
                throw new Error('window.electronAPI.getInstalledGames não está disponível. Verifique se o método foi exposto no preload.js');
            }

            console.log('Chamando window.electronAPI.getInstalledGames()...');
            const gamesFromBackend = await window.electronAPI.getInstalledGames();
            console.log('Resposta do backend:', gamesFromBackend);
            
            cachedGames = gamesFromBackend || [];
            console.log(`Cache de jogos preenchido com ${cachedGames.length} itens.`);
            return cachedGames;
        } catch (error) {
            console.error("Erro fatal ao buscar jogos para o cache:", error);
            console.error("Detalhes do erro:", {
                message: error.message,
                stack: error.stack,
                electronAPI: !!window.electronAPI,
                electronAPIMethods: window.electronAPI ? Object.keys(window.electronAPI) : 'N/A'
            });
            cachedGames = []; // Limpa o cache em caso de erro.
            return cachedGames;
        } finally {
            isFetching = false;
            fetchPromise = null;
        }
    })();

    return await fetchPromise;
}

// A classe agora é principalmente uma controladora da interface.
class GamesManager {
    constructor() {
        // A classe não armazena mais a lista principal, apenas a lista filtrada.
        this.filteredGames = [];
        this.currentFilter = 'all';
        this.searchTerm = '';
        this.isLoading = false;
        this.coverCache = new Map();
        this.init();
    }

    init() {
        this.bindEvents();
        this.createSearchInterface();
        this.createFilterInterface();
    }

    bindEvents() {
        const backButton = document.getElementById('games-back');
        if (backButton) {
            backButton.addEventListener('click', () => this.goBack());
        }
        document.addEventListener('screenChanged', (e) => {
            if (e.detail.screen === 'games-screen') {
                this.loadGames();
            }
        });
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

    // CORREÇÃO: loadGames agora garante que o cache está preenchido antes de continuar
    async loadGames() {
        if (this.isLoading) return;
        this.isLoading = true;
        this.showLoading();

        try {
            // Garante que o cache foi preenchido e aguarda a resposta
            await fetchAndCacheGames();
            
            // Verifica se o cache foi realmente preenchido
            if (cachedGames.length === 0) {
                console.warn('Cache de jogos ainda está vazio após fetchAndCacheGames()');
            }
            
            // A classe agora sempre trabalha com a lista vinda do cache.
            this.filteredGames = [...cachedGames];
            
            this.currentFilter = 'all';
            this.searchTerm = '';
            
            const searchInput = document.getElementById('games-search');
            if (searchInput) searchInput.value = '';
            
            const filterTabs = document.querySelectorAll('.filter-tab');
            filterTabs.forEach(t => t.classList.remove('active'));
            const allTab = document.querySelector('[data-filter="all"]');
            if (allTab) allTab.classList.add('active');
            
            await this.renderGames();
        } catch (error) {
            console.error('Erro ao carregar jogos:', error);
            this.filteredGames = [];
            await this.renderGames();
        } finally {
            this.isLoading = false;
        }
    }

    // CORREÇÃO: filterGames agora verifica se o cache está disponível
    async filterGames() {
        console.log(`Filtrando. Total de jogos no cache: ${cachedGames.length}`);
        
        // Se o cache estiver vazio, tenta recarregar
        if (cachedGames.length === 0) {
            console.log('Cache vazio durante filtro, tentando recarregar...');
            await fetchAndCacheGames();
        }
        
        // Sempre começa com a lista completa e persistente do cache.
        let filtered = [...cachedGames];

        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(game => this.detectGamePlatform(game) === this.currentFilter);
        }

        if (this.searchTerm.trim()) {
            const searchLower = this.searchTerm.toLowerCase();
            filtered = filtered.filter(game => game.name.toLowerCase().includes(searchLower));
        }

        this.filteredGames = filtered;
        console.log(`Jogos filtrados: ${this.filteredGames.length}`);
        await this.renderGames();
    }
    
    // CORREÇÃO: A detecção usa a propriedade 'platform' do backend.
    detectGamePlatform(game) {
        const backendPlatform = game.platform ? game.platform.toLowerCase() : 'other';
        if (backendPlatform.includes('steam')) return 'steam';
        if (backendPlatform.includes('epic')) return 'epic';
        return 'other'; // Mapeia "local games" etc. para "other"
    }

    async renderGames() {
        const gamesGrid = document.getElementById('games-grid');
        if (!gamesGrid) return;

        if (this.filteredGames.length === 0) {
            gamesGrid.innerHTML = `<div class="no-games"><div class="no-games-icon">🎮</div><div class="no-games-text">${this.searchTerm ? 'Nenhum jogo encontrado para a pesquisa' : 'Nenhum jogo encontrado para este filtro'}</div></div>`;
            return;
        }

        const sortedGames = [...this.filteredGames].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

        gamesGrid.innerHTML = '';
        for (const game of sortedGames) {
            const gameElement = await this.createGameElement(game);
            gamesGrid.appendChild(gameElement);
        }
    }

    // Métodos restantes permanecem inalterados
    async createGameElement(game) {
        const gameDiv = document.createElement('div');
        gameDiv.className = 'game-item';
        gameDiv.setAttribute('tabindex', '0');
        let coverUrl = await this.getLocalGameCover(game);
        if (!coverUrl) { coverUrl = await this.getGameCover(game.name); }
        const platform = this.detectGamePlatform(game);
        const platformIcon = this.getPlatformIcon(platform);
        const sizeText = game.size ? this.formatFileSize(game.size) : 'Tamanho desconhecido';
        gameDiv.innerHTML = `<div class="game-cover">${coverUrl ? `<img src="${coverUrl}" alt="${game.name}" class="game-cover-img" onerror="this.parentElement.innerHTML='<div class=\\"default-game-cover\\">🎮</div>'">` : '<div class="default-game-cover">🎮</div>'}<div class="platform-badge">${platformIcon}</div><div class="game-cover-overlay"><div class="game-actions"><button class="game-launch-btn" title="Executar jogo">▶</button><button class="game-add-btn" title="Adicionar à StartZone">+</button></div></div></div><div class="game-info"><div class="game-name" title="${game.name}">${game.name}</div><div class="game-details"><span class="game-size">${sizeText}</span>${game.publisher ? `<span class="game-publisher">${game.publisher}</span>` : ''}</div><div class="game-platform">${this.getPlatformName(platform)}</div></div>`;
        this.bindGameEvents(gameDiv, game);
        return gameDiv;
    }

    bindGameEvents(gameElement, game) { 
        const launchBtn = gameElement.querySelector('.game-launch-btn'); 
        const addBtn = gameElement.querySelector('.game-add-btn'); 
        launchBtn.addEventListener('click', async (e) => { e.stopPropagation(); await this.launchGame(game); }); 
        addBtn.addEventListener('click', async (e) => { e.stopPropagation(); await this.addGameToStartZone(game); }); 
        gameElement.addEventListener('dblclick', async () => { await this.launchGame(game); }); 
        gameElement.addEventListener('keydown', async (e) => { if (e.key === 'Enter') { await this.launchGame(game); } }); 
    }

    async launchGame(game) { 
        if (!game.path) { this.showNotification('Erro: Caminho do jogo não encontrado', 'error'); return; } 
        this.showNotification(`Iniciando ${game.name}...`, 'info'); 
        try { 
            const result = await window.electronAPI.launchGame(game.path); 
            if (result.success) { 
                this.showNotification(`${game.name} iniciado com sucesso!`, 'success'); 
            } else { 
                this.showNotification(`Erro ao iniciar ${game.name}: ${result.message}`, 'error'); 
            } 
        } catch (error) { 
            console.error('Erro ao executar jogo:', error); 
            this.showNotification(`Erro ao iniciar ${game.name}`, 'error'); 
        } 
    }

    async addGameToStartZone(game) { 
        try { 
            let coverUrl = await this.getLocalGameCover(game); 
            if (!coverUrl) { coverUrl = await this.getGameCover(game.name); } 
            const result = await window.electronAPI.addGameToStartzone({ name: game.name, path: game.path, cover: coverUrl }); 
            if (result.success) { 
                this.showNotification(`${game.name} adicionado à StartZone!`, 'success'); 
            } else { 
                this.showNotification(`Erro ao adicionar ${game.name}: ${result.message}`, 'error'); 
            } 
        } catch (error) { 
            console.error('Erro ao adicionar jogo à StartZone:', error); 
            this.showNotification(`Erro ao adicionar ${game.name} à StartZone`, 'error'); 
        } 
    }

    getPlatformIcon(platform) { 
        const icons = { steam: '🟢', epic: '🟣', other: '⚪' }; 
        return icons[platform] || icons.other; 
    }

    getPlatformName(platform) { 
        const names = { steam: 'Steam', epic: 'Epic Games', other: 'Jogos Locais' }; 
        return names[platform] || 'Desconhecido'; 
    }

    formatFileSize(bytes) { 
        if (!bytes || bytes === 0) return '0 B'; 
        const k = 1024; 
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']; 
        const i = Math.floor(Math.log(bytes) / Math.log(k)); 
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]; 
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

    // Funções para gerenciamento de capas de jogos
    async getLocalGameCover(game) {
        try {
            if (!game || !game.path) return null;
            
            // Verifica se já existe no cache
            if (this.coverCache.has(game.path)) {
                return this.coverCache.get(game.path);
            }

            // Tenta obter o ícone do executável do jogo
            const coverUrl = await window.electronAPI.getGameIcon(game.path);
            
            // Armazena no cache
            if (coverUrl) {
                this.coverCache.set(game.path, coverUrl);
            }
            
            return coverUrl;
        } catch (error) {
            console.error('Erro ao obter capa local do jogo:', error);
            return null;
        }
    }

    async getGameCover(gameName) {
        try {
            if (!gameName) return null;
            
            // Verifica se já existe no cache
            if (this.coverCache.has(gameName)) {
                return this.coverCache.get(gameName);
            }

            // Aqui você pode implementar busca por capas online se desejar
            // Por enquanto, retorna null para usar a capa padrão
            return null;
        } catch (error) {
            console.error('Erro ao obter capa do jogo:', error);
            return null;
        }
    }

    // Função para mostrar notificações
    showNotification(message, type = 'info') {
        try {
            // Verifica se existe uma função global de notificação
            if (window.showNotification) {
                window.showNotification(message, type);
                return;
            }

            // Fallback: usar console e alert simples
            console.log(`[${type.toUpperCase()}] ${message}`);
            
            // Cria uma notificação visual simples se não existir sistema de notificação
            const notification = document.createElement('div');
            notification.className = `notification notification-${type}`;
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${type === 'error' ? '#ff4444' : type === 'success' ? '#44aa44' : '#4488cc'};
                color: white;
                padding: 12px 20px;
                border-radius: 6px;
                z-index: 10000;
                font-family: sans-serif;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                animation: slideIn 0.3s ease-out;
            `;

            // Adiciona CSS de animação se não existir
            if (!document.getElementById('notification-styles')) {
                const style = document.createElement('style');
                style.id = 'notification-styles';
                style.textContent = `
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }

            document.body.appendChild(notification);

            // Remove a notificação após 3 segundos
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.animation = 'slideIn 0.3s ease-out reverse';
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    }, 300);
                }
            }, 3000);

        } catch (error) {
            console.error('Erro ao mostrar notificação:', error);
            // Fallback final
            alert(`${type.toUpperCase()}: ${message}`);
        }
    }
}

// Inicializa o gerenciador e já dispara a busca de jogos em segundo plano.
document.addEventListener('DOMContentLoaded', () => {
    window.gamesManager = new GamesManager();
    // Inicia o cache em segundo plano
    fetchAndCacheGames()
        .then(() => console.log('Cache de jogos inicializado com sucesso'))
        .catch(error => console.error('Erro ao inicializar cache de jogos:', error));
});