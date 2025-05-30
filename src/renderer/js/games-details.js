class GameDetailsManager {
    constructor() {
        // Armazena o jogo que está sendo exibido no momento
        this.currentGame = null; 
        
        // Mapeia todos os elementos da nova tela para fácil acesso
        this.elements = {
            screen: document.getElementById('game-details-screen'),
            title: document.getElementById('details-game-title'),
            coverImg: document.getElementById('details-cover-img'),
            summary: document.getElementById('details-summary'),
            platform: document.getElementById('details-platform'),
            size: document.getElementById('details-size'),
            developer: document.getElementById('details-developer'),
            releaseDate: document.getElementById('details-release-date'),
            playButton: document.getElementById('details-play-button'),
            backButton: document.getElementById('details-back')
        };
        
        // A inicialização dos listeners é chamada imediatamente
        this.init();
    }

    init() {
        console.log("GameDetailsManager inicializado.");
        
        // Configura o que acontece quando os botões são clicados
        this.elements.playButton?.addEventListener('click', () => {
            if (this.currentGame) {
                // Chama a função de launch que já existe no GamesManager
                window.gamesManager.launchGame(this.currentGame);
            }
        });

        this.elements.backButton?.addEventListener('click', () => {
            // Usa a função global para voltar para a lista de jogos
            if (window.showScreen) {
                window.showScreen('games-screen');
            }
        });
    }

    /**
     * Função principal para exibir a tela de detalhes e popular com os dados de um jogo.
     * @param {object} game - O objeto completo do jogo, vindo do cache.
     */
    async show(game) {
        if (!game) {
            console.error("GameDetailsManager: A função 'show' foi chamada sem um objeto de jogo.");
            return;
        }
        this.currentGame = game;

        console.log(`Exibindo detalhes para: ${game.name}`);

        // 1. Popula os dados que já temos imediatamente
        this.elements.title.textContent = game.name;
        this.elements.coverImg.src = game.coverPath || 'assets/images/placeholder.png'; // Usa a capa já baixada
        this.elements.platform.textContent = game.platform || 'Não informado';
        this.elements.size.textContent = game.size || 'N/A';

        // 2. Mostra a tela de detalhes e esconde as outras
        if (window.showScreen) {
            window.showScreen('game-details-screen');
        }
        
        // 3. Exibe um estado de "carregando" para os dados que vêm da API
        this.elements.summary.innerHTML = '<div class="loading-spinner-small"></div>';
        this.elements.developer.textContent = 'Buscando...';
        this.elements.releaseDate.textContent = 'Buscando...';

        // 4. Pede ao backend para buscar os detalhes adicionais (descrição, etc.)
        const details = await window.electronAPI.getGameDetails(game.name);

        // 5. Quando os dados chegam, popula o resto da tela
        if (details) {
            // Remove tags HTML da descrição para uma exibição limpa e segura
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = details.description;
            const cleanDescription = tempDiv.textContent || tempDiv.innerText || "Nenhuma descrição disponível.";

            this.elements.summary.textContent = cleanDescription;
            this.elements.developer.textContent = details.developer;
            this.elements.releaseDate.textContent = details.releaseDate;
        } else {
            this.elements.summary.textContent = 'Não foi possível carregar os detalhes adicionais do jogo.';
            this.elements.developer.textContent = 'Não informado';
            this.elements.releaseDate.textContent = 'Não informado';
        }
    }
}