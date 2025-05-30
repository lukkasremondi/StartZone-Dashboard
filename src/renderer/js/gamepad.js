class GamepadManager {
    constructor() {
        this.gamepadIndex = null;
        this.isConnected = false;
        this.buttonStates = {};
        this.axisStates = {};
        this.loopRunning = false;
        this.debounceTimeout = null;
        this.DEBOUNCE_DELAY = 150; // Atraso em ms para evitar navegação muito rápida
    }

    initialize() {
        console.log("GamepadManager: Inicializando...");
        // Adiciona a instância à window para que o main.js possa verificar o status 'isConnected'
        window.gamepadManager = this;
        window.addEventListener('gamepadconnected', (e) => this.handleConnect(e));
        window.addEventListener('gamepaddisconnected', (e) => this.handleDisconnect(e));
        this.checkForConnectedGamepads();
    }

    handleConnect(event) {
        console.log(`Controle conectado no índice ${event.gamepad.index}: ${event.gamepad.id}`);
        if (!this.isConnected) {
            this.gamepadIndex = event.gamepad.index;
            this.isConnected = true;
            
            // AJUSTE: Notifica o main.js para atualizar o rodapé
            if (window.updateFooterActions) {
                window.updateFooterActions();
            }

            if (window.showNotification) {
                window.showNotification('Controle conectado!', 'success');
            }
            this.startLoop();
        }
    }

    handleDisconnect(event) {
        console.log(`Controle desconectado do índice ${event.gamepad.index}`);
        if (this.gamepadIndex === event.gamepad.index) {
            this.isConnected = false;
            this.gamepadIndex = null;
            this.stopLoop();
            
            // AJUSTE: Notifica o main.js para atualizar o rodapé
            if (window.updateFooterActions) {
                window.updateFooterActions();
            }

            if (window.showNotification) {
                window.showNotification('Controle desconectado', 'info');
            }
        }
    }

    checkForConnectedGamepads() {
        const gamepads = navigator.getGamepads();
        for (const gamepad of gamepads) {
            if (gamepad) {
                this.handleConnect({ gamepad });
                break; // Conecta apenas o primeiro controle encontrado
            }
        }
    }

    startLoop() {
        if (this.loopRunning) return;
        this.loopRunning = true;
        console.log("GamepadManager: Iniciando loop de polling.");
        this.poll();
    }

    stopLoop() {
        this.loopRunning = false;
        console.log("GamepadManager: Parando loop de polling.");
    }

    poll() {
        if (!this.isConnected) {
            this.stopLoop();
            return;
        }

        const gamepad = navigator.getGamepads()[this.gamepadIndex];
        if (!gamepad) {
            this.handleDisconnect({ gamepad: { index: this.gamepadIndex } });
            return;
        }

        // Processar botões
        gamepad.buttons.forEach((button, index) => {
            const isPressed = button.pressed;
            const wasPressed = this.buttonStates[index] || false;

            if (isPressed && !wasPressed) {
                this.handleButtonPress(index);
            }

            this.buttonStates[index] = isPressed;
        });

        // Processar analógicos e D-pad (eixos)
        this.handleAxis(gamepad.axes);

        if (this.loopRunning) {
            requestAnimationFrame(() => this.poll());
        }
    }

    handleButtonPress(buttonIndex) {
        console.log(`Botão pressionado: ${buttonIndex}`);
        switch (buttonIndex) {
            case 0: // Botão A (Xbox) -> Confirma/Clica
                if (window.activateFocusedElement) window.activateFocusedElement();
                break;
            case 1: // Botão B (Xbox) -> Volta
                if (window.navigateBack) window.navigateBack();
                break;
            case 3: // Botão Y (Xbox) -> Detalhes
                if (window.showDetailsForFocusedGame) {
                    window.showDetailsForFocusedGame();
                }
                break;
        }
    }

    handleAxis(axes) {
        const deadzone = 0.5;
        const navX = axes[0]; // Analógico esquerdo X
        const navY = axes[1]; // Analógico esquerdo Y
        // A lógica do D-pad pode variar, esta é uma abordagem comum
        const dpadX = axes.length > 9 ? axes[9] : (axes[6] || 0);
        const dpadY = axes.length > 9 ? axes[9] : (axes[7] || 0);

        // Previne que a navegação seja muito rápida
        if (this.debounceTimeout) return;

        let direction = null;
        
        if (navX > deadzone || dpadX > 0.5) direction = 'right';
        else if (navX < -deadzone || dpadX < -0.5) direction = 'left';
        else if (navY > deadzone || dpadY > 0.5) direction = 'down';
        else if (navY < -deadzone || dpadY < -0.5) direction = 'up';

        if (direction && window.navigateFocus) {
            window.navigateFocus(direction);
            
            // Ativa o debounce
            this.debounceTimeout = setTimeout(() => {
                this.debounceTimeout = null;
            }, this.DEBOUNCE_DELAY);
        }
    }
}