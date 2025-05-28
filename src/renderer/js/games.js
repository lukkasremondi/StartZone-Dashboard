// games.js - Gerenciador de jogos para o frontend com capas automáticas
class GamesManager {
    constructor() {
        this.games = [];
        this.filteredGames = [];
        this.currentFilter = 'all';
        this.searchTerm = '';
        this.isLoading = false;
        this.gameCovers = new Map(); // Cache de capas
        this.coverCache = new Map(); // Cache de URLs de capas
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.createSearchInterface();
        this.createFilterInterface();
    }

    bindEvents() {
        // Evento para voltar à tela inicial
        const backButton = document.getElementById('games-back');
        if (backButton) {
            backButton.addEventListener('click', () => {
                this.goBack();
            });
        }

        // Evento para detectar entrada na tela de jogos
        document.addEventListener('screenChanged', (e) => {
            if (e.detail.screen === 'games-screen') {
                this.loadGames();
            }
        });
    }

    createSearchInterface() {
        const screenHeader = document.querySelector('#games-screen .screen-header');
        if (!screenHeader) return;

        // Verificar se já existe para evitar duplicação
        if (screenHeader.querySelector('.search-container')) return;

        // Criar barra de pesquisa
        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        searchContainer.innerHTML = `
            <input type="text" id="games-search" placeholder="Pesquisar jogos..." class="search-input">
            <button id="search-clear" class="search-clear">✕</button>
        `;

        screenHeader.appendChild(searchContainer);

        // Eventos de pesquisa
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
        if (!screenHeader) return;

        // Verificar se já existe para evitar duplicação
        if (screenHeader.querySelector('.filter-container')) return;

        // Criar filtros por plataforma
        const filterContainer = document.createElement('div');
        filterContainer.className = 'filter-container';
        filterContainer.innerHTML = `
            <div class="filter-tabs">
                <button class="filter-tab active" data-filter="all">Todos</button>
                <button class="filter-tab" data-filter="steam">Steam</button>
                <button class="filter-tab" data-filter="epic">Epic Games</button>
                <button class="filter-tab" data-filter="other">Outros</button>
            </div>
        `;

        screenHeader.appendChild(filterContainer);

        // Eventos dos filtros
        const filterTabs = document.querySelectorAll('.filter-tab');
        filterTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                console.log('Filtro clicado:', e.target.dataset.filter);
                
                // Remove active de todos os tabs
                filterTabs.forEach(t => t.classList.remove('active'));
                // Adiciona active ao tab clicado
                e.target.classList.add('active');
                
                this.currentFilter = e.target.dataset.filter;
                this.filterGames();
            });
        });
    }

    // Função para buscar capa do jogo por nome
    async getGameCover(gameName, retryCount = 0) {
        const maxRetries = 2;
        
        // Verificar cache primeiro
        if (this.coverCache.has(gameName)) {
            return this.coverCache.get(gameName);
        }

        try {
            // Limpar o nome do jogo para busca
            const cleanName = this.cleanGameName(gameName);
            console.log(`Buscando capa para: "${gameName}" -> "${cleanName}"`);

            // Tentar várias APIs em ordem de preferência
            let coverUrl = null;

            // 1. Tentar RAWG API (gratuita, boa qualidade)
            if (!coverUrl) {
                coverUrl = await this.fetchFromRAWG(cleanName);
            }

            // 2. Tentar IGDB (através de proxy se necessário)
            if (!coverUrl && retryCount === 0) {
                coverUrl = await this.fetchFromIGDB(cleanName);
            }

            // 3. Tentar busca genérica no Google Images (como fallback)
            if (!coverUrl && retryCount < maxRetries) {
                coverUrl = await this.fetchGenericCover(cleanName);
            }

            // Cache o resultado (mesmo que seja null)
            this.coverCache.set(gameName, coverUrl);
            
            return coverUrl;

        } catch (error) {
            console.warn(`Erro ao buscar capa para ${gameName}:`, error);
            
            // Cache resultado negativo para evitar tentativas repetidas
            this.coverCache.set(gameName, null);
            return null;
        }
    }

    // Limpar nome do jogo para busca mais eficiente
    cleanGameName(name) {
        return name
            .replace(/[™®©]/g, '') // Remover símbolos de marca
            .replace(/\s*\([^)]*\)/g, '') // Remover texto entre parênteses
            .replace(/\s*\[[^\]]*\]/g, '') // Remover texto entre colchetes
            .replace(/[:\-–—]/g, ' ') // Substituir pontuação por espaços
            .replace(/\s+/g, ' ') // Múltiplos espaços por um
            .trim()
            .toLowerCase();
    }

    // Buscar na RAWG API (gratuita)
    async fetchFromRAWG(gameName) {
        try {
            // RAWG API é gratuita mas requer chave (você pode se registrar em https://rawg.io/apidocs)
            // Por enquanto, usaremos sem chave (limitado)
            const searchUrl = `https://api.rawg.io/api/games?search=${encodeURIComponent(gameName)}&page_size=1`;
            
            const response = await fetch(searchUrl);
            if (!response.ok) throw new Error(`RAWG API error: ${response.status}`);
            
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
                const game = data.results[0];
                return game.background_image || null;
            }
        } catch (error) {
            console.warn('Erro na RAWG API:', error);
        }
        return null;
    }

    // Buscar na IGDB (mais complexa, requer autenticação)
    async fetchFromIGDB(gameName) {
        try {
            // IGDB requer autenticação complexa, implementar apenas se necessário
            // Por enquanto, retornar null
            console.log('IGDB API não implementada ainda');
            return null;
        } catch (error) {
            console.warn('Erro na IGDB API:', error);
        }
        return null;
    }

    // Busca genérica usando serviços de imagem
    async fetchGenericCover(gameName) {
        try {
            // Usar um serviço proxy para buscar imagens
            // Esta é uma abordagem mais simples mas menos confiável
            const searchTerm = `${gameName} game cover`;
            
            // Você pode implementar aqui uma busca personalizada
            // Por exemplo, usando uma API própria ou um serviço de proxy
            
            return null; // Placeholder por enquanto
        } catch (error) {
            console.warn('Erro na busca genérica:', error);
        }
        return null;
    }

    // Alternativa: usar capas locais se disponíveis
    async getLocalGameCover(game) {
        try {
            // Verificar se há ícone do jogo no sistema
            if (window.electronAPI && window.electronAPI.getGameIcon) {
                const iconDataUrl = await window.electronAPI.getGameIcon(game.path);
                if (iconDataUrl) {
                    return iconDataUrl;
                }
            }

            // Verificar capas Steam locais
            if (game.path && game.path.toLowerCase().includes('steam')) {
                const steamCover = await this.getSteamLocalCover(game);
                if (steamCover) return steamCover;
            }

            return null;
        } catch (error) {
            console.warn('Erro ao buscar capa local:', error);
            return null;
        }
    }

    // Buscar capa local do Steam
    async getSteamLocalCover(game) {
        try {
            // Steam armazena capas em pastas específicas
            // Implementar se necessário baseado na estrutura do Steam
            return null;
        } catch (error) {
            console.warn('Erro ao buscar capa Steam local:', error);
            return null;
        }
    }

    async loadGames() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading();

        try {
            console.log('Carregando jogos instalados...');
            
            // Verificar se a API está disponível
            if (!window.electronAPI || !window.electronAPI.getInstalledGames) {
                console.error('API electronAPI.getInstalledGames não está disponível');
                throw new Error('API não disponível');
            }
            
            const result = await window.electronAPI.getInstalledGames();
            console.log('Resultado da API:', result);
            
            // Verificar se o resultado é válido
            if (!Array.isArray(result)) {
                console.error('Resultado da API não é um array:', typeof result, result);
                this.games = [];
            } else {
                this.games = result;
            }
            
            console.log(`${this.games.length} jogos encontrados`);
            
            // Log detalhado para debug
            if (this.games.length === 0) {
                console.warn('⚠️ Nenhum jogo foi retornado pela API');
                console.log('Verificando se os métodos de busca estão funcionando...');
                
                // Teste direto das funções se disponível
                if (window.electronAPI.testGameSearch) {
                    const testResult = await window.electronAPI.testGameSearch();
                    console.log('Teste de busca de jogos:', testResult);
                }
            } else {
                console.log('Jogos encontrados:');
                this.games.forEach((game, index) => {
                    const platform = this.detectGamePlatform(game);
                    console.log(`${index + 1}. ${game.name} | ${platform} | ${game.path}`);
                });
            }
            
            // Resetar filtros quando carregar jogos
            this.currentFilter = 'all';
            this.searchTerm = '';
            
            // Resetar interface
            const searchInput = document.getElementById('games-search');
            if (searchInput) searchInput.value = '';
            
            const filterTabs = document.querySelectorAll('.filter-tab');
            filterTabs.forEach(t => t.classList.remove('active'));
            const allTab = document.querySelector('[data-filter="all"]');
            if (allTab) allTab.classList.add('active');
            
            this.filteredGames = [...this.games];
            await this.renderGames();
            await this.updateGamesSummary();
            
        } catch (error) {
            console.error('Erro ao carregar jogos:', error);
            console.error('Stack trace:', error.stack);
            this.games = [];
            this.filteredGames = [];
            this.showError(`Erro ao carregar jogos instalados: ${error.message}`);
        } finally {
            this.isLoading = false;
            this.hideLoading();
        }
    }

    filterGames() {
        console.log('Filtrando jogos:', {
            currentFilter: this.currentFilter,
            searchTerm: this.searchTerm,
            totalGames: this.games.length
        });

        // Sempre começar com todos os jogos
        let filtered = [...this.games];

        // Filtro por plataforma
        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(game => {
                const platform = this.detectGamePlatform(game);
                const matches = platform === this.currentFilter;
                console.log(`Jogo: ${game.name}, Platform: ${platform}, Filter: ${this.currentFilter}, Matches: ${matches}`);
                return matches;
            });
        }

        // Filtro por pesquisa
        if (this.searchTerm.trim()) {
            const searchLower = this.searchTerm.toLowerCase();
            filtered = filtered.filter(game => 
                game.name.toLowerCase().includes(searchLower) ||
                (game.publisher && game.publisher.toLowerCase().includes(searchLower))
            );
        }

        console.log(`Jogos filtrados: ${filtered.length}`);
        this.filteredGames = filtered;
        this.renderGames();
    }

    detectGamePlatform(game) {
        if (!game.path) {
            console.log(`Jogo sem path: ${game.name} - classificado como 'other'`);
            return 'other';
        }
        
        const path = game.path.toLowerCase();
        
        if (path.includes('steam')) {
            return 'steam';
        }
        if (path.includes('epic') || path.includes('epicgames')) {
            return 'epic';
        }
        
        // Jogos locais ou outros
        return 'other';
    }

    async renderGames() {
        console.log('Renderizando jogos:', this.filteredGames.length);
        
        const gamesGrid = document.getElementById('games-grid');
        if (!gamesGrid) {
            console.error('games-grid não encontrado');
            return;
        }

        if (this.filteredGames.length === 0) {
            gamesGrid.innerHTML = `
                <div class="no-games">
                    <div class="no-games-icon">🎮</div>
                    <div class="no-games-text">
                        ${this.searchTerm ? 'Nenhum jogo encontrado para a pesquisa' : 'Nenhum jogo encontrado para este filtro'}
                    </div>
                </div>
            `;
            return;
        }

        // Ordenar jogos por nome
        const sortedGames = this.filteredGames.sort((a, b) => 
            a.name.localeCompare(b.name, 'pt-BR')
        );

        // Limpar grid
        gamesGrid.innerHTML = '';

        // Renderizar cada jogo
        for (const game of sortedGames) {
            const gameElement = await this.createGameElement(game);
            gamesGrid.appendChild(gameElement);
        }

        console.log('Jogos renderizados com sucesso');
    }

    async createGameElement(game) {
        const gameDiv = document.createElement('div');
        gameDiv.className = 'game-item';
        gameDiv.setAttribute('tabindex', '0');
        
        // Buscar capa do jogo (primeira tentativa com ícone local)
        let coverUrl = await this.getLocalGameCover(game);
        
        // Se não encontrou capa local, buscar online
        if (!coverUrl) {
            coverUrl = await this.getGameCover(game.name);
        }

        const platform = this.detectGamePlatform(game);
        const platformIcon = this.getPlatformIcon(platform);
        const sizeText = game.size ? this.formatFileSize(game.size) : 'Tamanho desconhecido';

        // Criar HTML do jogo com capa
        gameDiv.innerHTML = `
            <div class="game-cover">
                ${coverUrl ? 
                    `<img src="${coverUrl}" alt="${game.name}" class="game-cover-img" onerror="this.parentElement.innerHTML='<div class=\\"default-game-cover\\">🎮</div>'">` : 
                    '<div class="default-game-cover">🎮</div>'
                }
                <div class="platform-badge">${platformIcon}</div>
                <div class="game-cover-overlay">
                    <div class="game-actions">
                        <button class="game-launch-btn" title="Executar jogo">▶</button>
                        <button class="game-add-btn" title="Adicionar à StartZone">+</button>
                    </div>
                </div>
            </div>
            <div class="game-info">
                <div class="game-name" title="${game.name}">${game.name}</div>
                <div class="game-details">
                    <span class="game-size">${sizeText}</span>
                    ${game.publisher ? `<span class="game-publisher">${game.publisher}</span>` : ''}
                </div>
                <div class="game-platform">${this.getPlatformName(platform)}</div>
            </div>
        `;

        // Eventos do jogo
        this.bindGameEvents(gameDiv, game);

        return gameDiv;
    }

    bindGameEvents(gameElement, game) {
        const launchBtn = gameElement.querySelector('.game-launch-btn');
        const addBtn = gameElement.querySelector('.game-add-btn');

        // Evento de executar jogo
        launchBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.launchGame(game);
        });

        // Evento de adicionar à StartZone
        addBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.addGameToStartZone(game);
        });

        // Evento de duplo clique no jogo
        gameElement.addEventListener('dblclick', async () => {
            await this.launchGame(game);
        });

        // Evento de tecla Enter no jogo
        gameElement.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                await this.launchGame(game);
            }
        });
    }

    async launchGame(game) {
        if (!game.path) {
            this.showNotification('Erro: Caminho do jogo não encontrado', 'error');
            return;
        }

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
            // Buscar capa para incluir no StartZone
            let coverUrl = await this.getLocalGameCover(game);
            if (!coverUrl) {
                coverUrl = await this.getGameCover(game.name);
            }

            const result = await window.electronAPI.addGameToStartzone({
                name: game.name,
                path: game.path,
                cover: coverUrl // Incluir capa se disponível
            });

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

    async updateGamesSummary() {
        try {
            const summary = await window.electronAPI.getGamesSummary();
            
            // Atualizar informações no rodapé ou em outro local
            const summaryElement = document.querySelector('.games-summary');
            if (summaryElement) {
                summaryElement.innerHTML = `
                    <span>Total: ${summary.total} jogos</span>
                    <span>Espaço: ${summary.totalSize}</span>
                `;
            }
        } catch (error) {
            console.error('Erro ao obter resumo de jogos:', error);
        }
    }

    getPlatformIcon(platform) {
        const icons = {
            steam: '🟢',
            epic: '🟣',
            other: '⚪'
        };
        return icons[platform] || icons.other;
    }

    getPlatformName(platform) {
        const names = {
            steam: 'Steam',
            epic: 'Epic Games',
            other: 'Jogos Locais'
        };
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
            gamesGrid.innerHTML = `
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <div>Carregando jogos...</div>
                </div>
            `;
        }
    }

    hideLoading() {
        // O loading será removido quando renderGames() for chamado
    }

    showError(message) {
        const gamesGrid = document.getElementById('games-grid');
        if (gamesGrid) {
            gamesGrid.innerHTML = `
                <div class="error">
                    <div class="error-icon">⚠️</div>
                    <div class="error-text">${message}</div>
                    <button class="retry-btn" onclick="gamesManager.loadGames()">Tentar Novamente</button>
                </div>
            `;
        }
    }

    showNotification(message, type = 'info') {
        // Usar o sistema de notificações existente
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    goBack() {
        // Usar o sistema de navegação existente
        if (window.showScreen) {
            window.showScreen('home-screen');
        } else {
            const homeScreen = document.getElementById('home-screen');
            const gamesScreen = document.getElementById('games-screen');
            
            if (homeScreen && gamesScreen) {
                gamesScreen.classList.remove('active');
                homeScreen.classList.add('active');
            }
        }
    }

    // Método para busca externa
    async searchGames(searchTerm) {
        this.searchTerm = searchTerm;
        const searchInput = document.getElementById('games-search');
        if (searchInput) {
            searchInput.value = searchTerm;
        }
        this.filterGames();
    }

    // Método para filtro externo
    filterByPlatform(platform) {
        this.currentFilter = platform;
        const filterTabs = document.querySelectorAll('.filter-tab');
        filterTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.filter === platform);
        });
        this.filterGames();
    }

    // Método para recarregar jogos
    async refreshGames() {
        this.games = [];
        this.filteredGames = [];
        await this.loadGames();
    }

    // Método para obter estatísticas
    getStats() {
        return {
            total: this.games.length,
            filtered: this.filteredGames.length,
            platforms: this.getPlatformStats(),
            currentFilter: this.currentFilter,
            searchTerm: this.searchTerm
        };
    }

    getPlatformStats() {
        const stats = {};
        this.games.forEach(game => {
            const platform = this.detectGamePlatform(game);
            stats[platform] = (stats[platform] || 0) + 1;
        });
        return stats;
    }

    // Método para limpar cache de capas
    clearCoverCache() {
        this.coverCache.clear();
        this.gameCovers.clear();
        console.log('Cache de capas limpo');
    }

    // Método para pré-carregar capas em lote
    async preloadCovers() {
        console.log('Pré-carregando capas dos jogos...');
        const promises = this.games.map(game => this.getGameCover(game.name));
        await Promise.allSettled(promises);
        console.log('Pré-carregamento de capas concluído');
    }

    // Método para debug - pode ser removido em produção
    async debugFilters() {
        console.log('=== DEBUG COMPLETO ===');
        console.log('Total de jogos:', this.games.length);
        console.log('Filtro atual:', this.currentFilter);
        console.log('Termo de pesquisa:', this.searchTerm);
        console.log('Jogos filtrados:', this.filteredGames.length);
        console.log('Cache de capas:', this.coverCache.size, 'entradas');
        
        // Verificar API
        console.log('API disponível:', !!window.electronAPI);
        console.log('getInstalledGames disponível:', !!window.electronAPI?.getInstalledGames);
        
        // Testar API diretamente
        try {
            console.log('Testando API diretamente...');
            const testResult = await window.electronAPI.getInstalledGames();
            console.log('Resultado do teste da API:', testResult);
            console.log('Tipo do resultado:', typeof testResult);
            console.log('É array?', Array.isArray(testResult));
        } catch (error) {
            console.error('Erro ao testar API:', error);
        }
        
        console.log('Estatísticas por plataforma:');
        const stats = this.getPlatformStats();
        Object.entries(stats).forEach(([platform, count]) => {
            console.log(`  ${platform}: ${count} jogos`);
        });
        
        console.log('Lista de jogos:');
        this.games.forEach((game, index) => {
            const platform = this.detectGamePlatform(game);
            console.log(`  ${index + 1}. ${game.name}: ${platform} (${game.path})`);
        });

        // Verificar elementos DOM
        console.log('Elementos DOM:');
        console.log('  games-grid:', !!document.getElementById('games-grid'));
        console.log('  filter-tabs:', document.querySelectorAll('.filter-tab').length);
        console.log('  tab ativo:', document.querySelector('.filter-tab.active')?.dataset.filter);
    }

    // Método para forçar recarregamento completo
    async forceReload() {
        console.log('Forçando recarregamento completo...');
        this.games = [];
        this.filteredGames = [];
        this.currentFilter = 'all';
        this.searchTerm = '';
        this.isLoading = false;
        this.clearCoverCache();
        
        // Limpar interface
        const gamesGrid = document.getElementById('games-grid');
        if (gamesGrid) gamesGrid.innerHTML = '';
        
        // Recarregar
        await this.loadGames();
    }
}

// Inicializar o gerenciador de jogos quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.gamesManager = new GamesManager();
});

// Exportar para uso global
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GamesManager;
}