class SettingsMenuManager {
    constructor() {
        this.settingsButton = document.getElementById('settings-button');
        this.menuPanel = document.getElementById('settings-menu');
        this.closeButton = document.getElementById('close-settings-menu');
        this.overlay = document.getElementById('settings-menu-overlay');
        this.exitDashboardButton = document.getElementById('settings-exit-dashboard');

        this.isMenuOpen = false;

        this.initialize();
    }

    initialize() {
        console.log("SettingsMenuManager: Inicializando...");

        if (!this.settingsButton || !this.menuPanel || !this.closeButton || !this.overlay || !this.exitDashboardButton) {
            console.error("SettingsMenuManager: Um ou mais elementos do DOM não foram encontrados. Verifique os IDs no HTML.");
            return;
        }

        this.settingsButton.addEventListener('click', () => this.toggleMenu());
        this.closeButton.addEventListener('click', () => this.closeMenu());
        this.overlay.addEventListener('click', () => this.closeMenu());
        
        this.exitDashboardButton.addEventListener('click', () => {
            if (window.exitApp) {
                window.exitApp(); // Chama a função global definida no main.js
            } else {
                console.error("SettingsMenuManager: A função global 'exitApp' não foi encontrada.");
            }
        });

        // Adiciona listener para a tecla 'Escape' para fechar o menu
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.isMenuOpen) {
                this.closeMenu();
            }
        });

        console.log("SettingsMenuManager: Event listeners configurados.");
    }

    toggleMenu() {
        if (this.isMenuOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    openMenu() {
        if (!this.menuPanel || !this.overlay) return;
        
        this.menuPanel.classList.add('open');
        this.overlay.classList.add('active');
        this.isMenuOpen = true;
        console.log("SettingsMenuManager: Menu aberto.");

        // Foca no primeiro item focável dentro do menu (o botão de fechar ou a primeira opção)
        const firstFocusableElement = this.menuPanel.querySelector('button, [tabindex]:not([tabindex="-1"])');
        if (firstFocusableElement) {
            setTimeout(() => firstFocusableElement.focus(), 50); // Pequeno delay para garantir que o menu esteja visível
        }
    }

    closeMenu() {
        if (!this.menuPanel || !this.overlay) return;

        this.menuPanel.classList.remove('open');
        this.overlay.classList.remove('active');
        this.isMenuOpen = false;
        console.log("SettingsMenuManager: Menu fechado.");

        // Opcional: Devolver o foco para o botão de configurações
        if (this.settingsButton) {
            this.settingsButton.focus();
        }
    }
}