const { ipcRenderer } = require('electron');

// Estado específico dos programas
let programsData = [];
let programsLoaded = false;
let programsFilter = '';
let programsSortBy = 'name'; // 'name', 'size', 'date'
let programsSortOrder = 'asc'; // 'asc', 'desc'

// Elementos DOM específicos dos programas
const programsElements = {
    grid: document.getElementById('programs-grid'),
    searchInput: null,
    sortSelect: null,
    filterButtons: null,
    filterToggle: null,
    categoriesContainer: null
};

// Estado da navegação
let currentFocusIndex = -1;
let focusableElements = [];
let isInCategoryMenu = false;
let currentCategoryIndex = 0;

// Inicialização do módulo de programas
function initializeProgramsModule() {
    console.log('Inicializando módulo de programas...');
    
    // Criar controles adicionais na tela de programas
    createProgramsControls();
    
    // Event listeners específicos
    setupProgramsEventListeners();
    
    // Adicionar indicadores visuais para gamepad
    addGamepadIndicators();

    setupGamepadSupport();
    
    console.log('Módulo de programas inicializado');
}

function setupGamepadSupport() {
    let gamepadIndex;
    
    function gamepadLoop() {
        const gamepad = navigator.getGamepads()[gamepadIndex];
        if (!gamepad) return;
        
        // Detectar pressionamento de botões/direcionais
        // Implementar lógica similar aos eventos de teclado
        
        requestAnimationFrame(gamepadLoop);
    }
    
    window.addEventListener("gamepadconnected", (e) => {
        console.log("Gamepad connected");
        gamepadIndex = e.gamepad.index;
        gamepadLoop();
    });
    
    window.addEventListener("gamepaddisconnected", (e) => {
        console.log("Gamepad disconnected");
        gamepadIndex = null;
    });
}

// Criar controles adicionais para a tela de programas
function createProgramsControls() {
    const programsScreen = document.getElementById('programs-screen');
    if (!programsScreen) return;
  
    const header = programsScreen.querySelector('.screen-header');
    if (!header) return;
  
    // Criar container para controles
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'programs-controls';
    controlsContainer.innerHTML = `
      <div class="programs-filters">
        <input type="text" id="programs-search" placeholder="Buscar programas..." class="search-input" tabindex="10">
        <select id="programs-sort" class="sort-select" tabindex="11">
          <option value="name-asc">Nome A-Z</option>
          <option value="name-desc">Nome Z-A</option>
          <option value="size-desc">Maior tamanho</option>
          <option value="size-asc">Menor tamanho</option>
          <option value="date-desc">Mais recente</option>
          <option value="date-asc">Mais antigo</option>
        </select>
        <div class="programs-count">
          <span id="programs-count-text">0 programas</span>
        </div>
        <div id="filter-toggle" tabindex="12" title="Filtrar por categoria">
          <span class="filter-icon">🎛️</span>
          <span class="filter-text">Filtros</span>
        </div>
      </div>
      <div class="programs-categories" id="programs-categories">
        <button class="category-filter active" data-category="all" tabindex="20">
          <span>Todos</span>
        </button>
        <button class="category-filter" data-category="games" tabindex="21">
          <span>🎮 Jogos</span>
        </button>
        <button class="category-filter" data-category="development" tabindex="22">
          <span>💻 Desenvolvimento</span>
        </button>
        <button class="category-filter" data-category="multimedia" tabindex="23">
          <span>🎬 Multimídia</span>
        </button>
        <button class="category-filter" data-category="productivity" tabindex="24">
          <span>📋 Produtividade</span>
        </button>
        <button class="category-filter" data-category="system" tabindex="25">
          <span>⚙️ Sistema</span>
        </button>
        <button class="category-filter" data-category="other" tabindex="26">
          <span>📦 Outros</span>
        </button>
      </div>
    `;
  
    // Inserir após o header
    header.parentNode.insertBefore(controlsContainer, header.nextSibling);
  
    // Atualizar referências dos elementos
    programsElements.searchInput = document.getElementById('programs-search');
    programsElements.sortSelect = document.getElementById('programs-sort');
    programsElements.filterButtons = document.querySelectorAll('.category-filter');
    programsElements.filterToggle = document.getElementById('filter-toggle');
    programsElements.categoriesContainer = document.getElementById('programs-categories');
  
    // Configurar menu de filtros
    setupFilterToggle();
    
    // Configurar navegação nos filtros de categoria
    setupCategoryFiltersNavigation();
}

// Configurar toggle do menu de filtros
function setupFilterToggle() {
    const filterToggle = programsElements.filterToggle;
    const categoriesContainer = programsElements.categoriesContainer;
  
    if (!filterToggle || !categoriesContainer) return;

    // Click handler
    filterToggle.addEventListener('click', () => {
        toggleCategoriesMenu();
    });

    // Keyboard handler
    filterToggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleCategoriesMenu();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!categoriesContainer.classList.contains('show')) {
                toggleCategoriesMenu();
            }
            if (categoriesContainer.classList.contains('show')) {
                setTimeout(() => {
                    isInCategoryMenu = true;
                    currentCategoryIndex = 0;
                    const firstFilter = categoriesContainer.querySelector('.category-filter');
                    if (firstFilter) firstFilter.focus();
                }, 100);
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            programsElements.sortSelect.focus();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            programsElements.searchInput.focus();
        }
    });
}

// Toggle do menu de categorias
function toggleCategoriesMenu() {
    const categoriesContainer = programsElements.categoriesContainer;
    const isShowing = categoriesContainer.classList.contains('show');
    
    if (isShowing) {
        categoriesContainer.classList.remove('show');
        isInCategoryMenu = false;
        programsElements.filterToggle.focus();
    } else {
        categoriesContainer.classList.add('show');
    }
}

// Configurar navegação por teclado/controle nos filtros de categoria
function setupCategoryFiltersNavigation() {
    const categoryFilters = programsElements.filterButtons;
    
    categoryFilters.forEach((filter, index) => {
        filter.addEventListener('keydown', (e) => {
            e.preventDefault();
            
            switch(e.key) {
                case 'ArrowLeft':
                    currentCategoryIndex = Math.max(0, index - 1);
                    categoryFilters[currentCategoryIndex].focus();
                    break;
                    
                case 'ArrowRight':
                    currentCategoryIndex = Math.min(categoryFilters.length - 1, index + 1);
                    categoryFilters[currentCategoryIndex].focus();
                    break;
                    
                case 'ArrowUp':
                case 'Escape':
                    isInCategoryMenu = false;
                    toggleCategoriesMenu();
                    programsElements.filterToggle.focus();
                    break;
                    
                case 'ArrowDown':
                    isInCategoryMenu = false;
                    const firstProgram = document.querySelector('.program-item');
                    if (firstProgram) firstProgram.focus();
                    break;
                    
                case 'Enter':
                case ' ':
                    filter.click();
                    break;
            }
        });
    });
}

// Configurar event listeners específicos dos programas
function setupProgramsEventListeners() {
    // Busca em tempo real
    if (programsElements.searchInput) {
        programsElements.searchInput.addEventListener('input', debounce((e) => {
            programsFilter = e.target.value.toLowerCase();
            filterAndDisplayPrograms();
        }, 300));
        
        // Navegação com controle no campo de busca
        programsElements.searchInput.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    const firstProgram = document.querySelector('.program-item');
                    if (firstProgram) firstProgram.focus();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    programsElements.sortSelect.focus();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    // Se estiver no início, circular para o final
                    programsElements.filterToggle.focus();
                    break;
                case 'Tab':
                    if (e.shiftKey) {
                        e.preventDefault();
                        // Lógica para voltar para o último item se necessário
                    }
                    break;
            }
        });
    }
    
    // Ordenação
    if (programsElements.sortSelect) {
        programsElements.sortSelect.addEventListener('change', (e) => {
            const [sortBy, order] = e.target.value.split('-');
            programsSortBy = sortBy;
            programsSortOrder = order;
            filterAndDisplayPrograms();
        });
        
        // Navegação com controle no select
        programsElements.sortSelect.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowRight':
                    e.preventDefault();
                    programsElements.filterToggle.focus();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    programsElements.searchInput.focus();
                    break;
                case 'ArrowDown':
                    // Se não estiver mudando a opção do select, ir para a grid
                    if (!e.altKey) {
                        e.preventDefault();
                        const firstProgram = document.querySelector('.program-item');
                        if (firstProgram) firstProgram.focus();
                    }
                    break;
                case 'Tab':
                    if (!e.shiftKey) {
                        e.preventDefault();
                        programsElements.filterToggle.focus();
                    }
                    break;
            }
        });
    }
}

// Manipular seleção de categoria
function handleCategorySelection(selectedFilter) {
    // Remover active de todos
    programsElements.filterButtons.forEach(b => {
        b.classList.remove('active');
        b.style.transform = '';
    });
    
    // Ativar o selecionado
    selectedFilter.classList.add('active');
    selectedFilter.style.transform = 'translateY(-4px) scale(1.05)';
    
    // Feedback háptico se disponível
    if (navigator.vibrate) {
        navigator.vibrate(50);
    }
    
    const category = selectedFilter.dataset.category;
    filterProgramsByCategory(category);
    
    // Fechar menu de filtros e focar no primeiro resultado
    isInCategoryMenu = false;
    toggleCategoriesMenu();
    setTimeout(() => {
        const firstProgram = document.querySelector('.program-item');
        if (firstProgram) {
            firstProgram.focus();
        }
    }, 200);
}

// Carregamento principal dos programas
async function loadAllPrograms() {
    if (programsLoaded && programsData.length > 0) {
        filterAndDisplayPrograms();
        return;
    }
    
    showLoadingInProgramsGrid('Carregando programas instalados...');
    
    try {
        const systemPrograms = await ipcRenderer.invoke('get-installed-programs');
        console.log('Programas recebidos:', systemPrograms);
        
        programsData = await enrichProgramsData(systemPrograms || []);
        console.log('Programas processados:', programsData);
        
        programsLoaded = true;
        filterAndDisplayPrograms();
        
    } catch (error) {
        console.error('Erro ao carregar programas:', error);
        showErrorInProgramsGrid('Erro ao carregar programas instalados');
    }
}

async function enrichProgramsData(programs) {
    return Promise.all(programs.map(async program => {
        let icon = null;
        
        if (program.path && program.path.toLowerCase().endsWith('.exe')) {
            try {
                icon = await ipcRenderer.invoke('get-program-icon', program.path);
            } catch (e) {
                console.warn('Erro ao buscar ícone:', e);
            }
        }
        
        let cleanedName = program.name || 'Desconhecido';
        if (!cleanedName || cleanedName.trim().length === 0) {
            cleanedName = 'Programa Desconhecido';
        }
        
        return {
            ...program,
            name: cleanedName.trim(),
            category: categorizeProgramByName(cleanedName),
            icon: icon ?? getProgramIcon(cleanedName),
            size: program.size ?? 'N/A',
            installDate: program.installDate ?? 'N/A',
            publisher: program.publisher ?? 'Desconhecido',
            version: program.version ?? 'N/A'
        };
    }));
}

// Categorizar programa baseado no nome
function categorizeProgramByName(name) {
    const nameLC = name.toLowerCase();
    
    if (nameLC.includes('steam') || nameLC.includes('epic') || nameLC.includes('game') || 
        nameLC.includes('minecraft') || nameLC.includes('valorant') || nameLC.includes('league of legends')) {
        return 'games';
    }
    
    if (nameLC.includes('visual studio') || nameLC.includes('code') || nameLC.includes('git') ||
        nameLC.includes('nodejs') || nameLC.includes('python') || nameLC.includes('android studio')) {
        return 'development';
    }
    
    if (nameLC.includes('vlc') || nameLC.includes('spotify') || nameLC.includes('adobe') ||
        nameLC.includes('photoshop') || nameLC.includes('premiere') || nameLC.includes('obs')) {
        return 'multimedia';
    }
    
    if (nameLC.includes('office') || nameLC.includes('word') || nameLC.includes('excel') ||
        nameLC.includes('powerpoint') || nameLC.includes('outlook') || nameLC.includes('teams')) {
        return 'productivity';
    }
    
    if (nameLC.includes('windows') || nameLC.includes('microsoft') || nameLC.includes('driver') ||
        nameLC.includes('update') || nameLC.includes('security') || nameLC.includes('antivirus')) {
        return 'system';
    }
    
    return 'other';
}

// Obter ícone do programa baseado no nome
function getProgramIcon(name) {
    const nameLC = name.toLowerCase();
    
    const iconMap = {
        'steam': '🎮', 'chrome': '🌐', 'firefox': '🔥', 'edge': '🔵',
        'spotify': '🎵', 'discord': '💬', 'vlc': '🎬', 'photoshop': '🎨',
        'word': '📄', 'excel': '📊', 'powerpoint': '📽️', 'outlook': '📧',
        'teams': '👥', 'code': '💻', 'git': '📂', 'python': '🐍',
        'nodejs': '🟢', 'java': '☕'
    };
    
    for (const [key, icon] of Object.entries(iconMap)) {
        if (nameLC.includes(key)) return icon;
    }
    
    const category = categorizeProgramByName(name);
    const categoryIcons = {
        'games': '🎮', 'development': '💻', 'multimedia': '🎬',
        'productivity': '📋', 'system': '⚙️', 'other': '📦'
    };
    
    return categoryIcons[category] || '📦';
}

// Filtrar programas por categoria
function filterProgramsByCategory(category) {
    let filteredPrograms = [...programsData];
    
    if (category !== 'all') {
        filteredPrograms = programsData.filter(program => program.category === category);
    }
    
    if (programsFilter) {
        filteredPrograms = filteredPrograms.filter(program =>
            program.name.toLowerCase().includes(programsFilter)
        );
    }
    
    filteredPrograms = sortPrograms(filteredPrograms);
    displayProgramsInGrid(filteredPrograms);
    updateProgramsCount(filteredPrograms.length);
}

// Filtrar e exibir programas
function filterAndDisplayPrograms() {
    let filteredPrograms = [...programsData];
    
    if (programsFilter) {
        filteredPrograms = filteredPrograms.filter(program =>
            program.name.toLowerCase().includes(programsFilter) ||
            program.publisher.toLowerCase().includes(programsFilter)
        );
    }
    
    filteredPrograms = sortPrograms(filteredPrograms);
    displayProgramsInGrid(filteredPrograms);
    updateProgramsCount(filteredPrograms.length);
}

// Ordenar programas
function sortPrograms(programs) {
    return programs.sort((a, b) => {
        let aVal, bVal;
        
        switch (programsSortBy) {
            case 'name':
                aVal = a.name.toLowerCase();
                bVal = b.name.toLowerCase();
                break;
            case 'size':
                aVal = parseFloat(a.size) || 0;
                bVal = parseFloat(b.size) || 0;
                break;
            case 'date':
                aVal = new Date(a.installDate || 0);
                bVal = new Date(b.installDate || 0);
                break;
            default:
                return 0;
        }
        
        if (programsSortOrder === 'desc') {
            return aVal < bVal ? 1 : -1;
        } else {
            return aVal > bVal ? 1 : -1;
        }
    });
}

// Exibir programas na grid
function displayProgramsInGrid(programs) {
    const grid = programsElements.grid;
    if (!grid) return;
  
    if (!programs || programs.length === 0) {
        grid.innerHTML = `
            <div class="no-programs-found">
                <div class="no-programs-icon">🔍</div>
                <div class="no-programs-text">Nenhum programa encontrado</div>
                <div class="no-programs-subtitle">Tente ajustar os filtros de busca</div>
            </div>
        `;
        return;
    }
  
    grid.innerHTML = programs.map((program, index) => `
        <div class="program-item"
             tabindex="${100 + index}"
             data-path="${escapeHtml(program.path || '')}"
             data-name="${escapeHtml(program.name)}"
             data-category="${program.category}"
             data-index="${index}">
            <div class="program-icon-only">
                ${program.icon && program.icon.startsWith('data:image')
                    ? `<img src="${program.icon}" alt="${escapeHtml(program.name)}" class="program-icon-img">`
                    : `<div class="program-icon-fallback">${program.icon || '💻'}</div>`}
            </div>
            <div class="program-name-only" title="${escapeHtml(program.name)}">${escapeHtml(program.name)}</div>
        </div>
    `).join('');
  
    setupProgramItemsEventListeners();
}

// Configurar event listeners para os itens de programa
function setupProgramItemsEventListeners() {
    const programItems = document.querySelectorAll('.program-item');
    
    programItems.forEach((item, index) => {
        // Click
        item.addEventListener('click', () => {
            launchProgramFromItem(item);
        });
        
        // Keyboard navigation
        item.addEventListener('keydown', (e) => {
            const currentIndex = parseInt(item.dataset.index);
            
            switch(e.key) {
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    launchProgramFromItem(item);
                    break;
                    
                case 'ArrowUp':
                    e.preventDefault();
                    navigateGrid(currentIndex, 'up', programItems);
                    break;
                    
                case 'ArrowDown':
                    e.preventDefault();
                    navigateGrid(currentIndex, 'down', programItems);
                    break;
                    
                case 'ArrowLeft':
                    e.preventDefault();
                    navigateGrid(currentIndex, 'left', programItems);
                    break;
                    
                case 'ArrowRight':
                    e.preventDefault();
                    navigateGrid(currentIndex, 'right', programItems);
                    break;
                    
                case 'Escape':
                    e.preventDefault();
                    programsElements.searchInput.focus();
                    break;
            }
        });
        
        // Feedback visual
        item.addEventListener('focus', () => {
            item.style.transform = 'translateY(-8px) scale(1.05)';
            item.style.borderColor = '#00d4ff';
            item.style.boxShadow = '0 20px 40px rgba(0, 212, 255, 0.3)';
        });
        
        item.addEventListener('blur', () => {
            item.style.transform = '';
            item.style.borderColor = '';
            item.style.boxShadow = '';
        });
    });
}

// Navegação inteligente na grid - CORRIGIDA
function navigateGrid(currentIndex, direction, items) {
    if (!items.length) return;

    // Calcula o número de colunas corretamente
    const gridContainer = programsElements.grid;
    const gridRect = gridContainer.getBoundingClientRect();
    const firstItem = items[0];
    const itemRect = firstItem.getBoundingClientRect();
    
    // Considera margin, padding e gap
    const gridStyle = window.getComputedStyle(gridContainer);
    const columnGap = parseInt(gridStyle.columnGap) || parseInt(gridStyle.gap) || 0;
    
    // Largura total do item (incluindo margens)
    const itemWidth = itemRect.width + columnGap;
    
    // Número de colunas que cabem na largura visível
    const columnsCount = Math.floor((gridRect.width + columnGap) / itemWidth);

    let targetIndex = currentIndex;
    const rowsCount = Math.ceil(items.length / columnsCount);
    const currentRow = Math.floor(currentIndex / columnsCount);
    const currentCol = currentIndex % columnsCount;

    switch(direction) {
        case 'left':
            if (currentCol > 0) {
                targetIndex = currentIndex - 1;
            } else {
                // Volta para o último item da linha
                targetIndex = currentIndex + (columnsCount - 1);
                if (targetIndex >= items.length) {
                    targetIndex = items.length - 1;
                }
            }
            break;
            
        case 'right':
            if (currentCol < columnsCount - 1 && currentIndex < items.length - 1) {
                targetIndex = currentIndex + 1;
            } else {
                // Avança para o primeiro item da linha
                targetIndex = currentIndex - currentCol;
            }
            break;
            
        case 'up':
            if (currentRow > 0) {
                targetIndex = currentIndex - columnsCount;
            } else {
                // Volta para os controles
                const activeFilter = document.querySelector('.category-filter.active');
                if (activeFilter) {
                    activeFilter.focus();
                    return;
                }
                programsElements.searchInput.focus();
                return;
            }
            break;
            
        case 'down':
            if (currentRow < rowsCount - 1) {
                targetIndex = currentIndex + columnsCount;
                if (targetIndex >= items.length) {
                    // Ajusta para a última posição válida
                    targetIndex = items.length - 1;
                }
            } else {
                // Circular para o primeiro item da coluna
                targetIndex = currentCol;
            }
            break;
    }

    if (items[targetIndex]) {
        items[targetIndex].focus();
    }
}

// Executar programa a partir do item
async function launchProgramFromItem(item) {
    const path = item.dataset.path;
    const name = item.dataset.name;
    
    if (!path) {
        showNotification('Caminho do programa não encontrado', 'error');
        return;
    }
    
    if (window.launchProgram) {
        await window.launchProgram(path, name);
    } else {
        await launchProgramDirectly(path, name);
    }
}

// Executar programa diretamente
async function launchProgramDirectly(programPath, programName) {
    showLoadingOverlay(`Iniciando ${programName}...`);
    
    try {
        const success = await ipcRenderer.invoke('launch-program', programPath);
        if (success) {
            showNotification(`${programName} iniciado com sucesso!`, 'success');
        } else {
            showNotification(`Erro ao iniciar ${programName}`, 'error');
        }
    } catch (error) {
        console.error('Erro ao iniciar programa:', error);
        showNotification(`Erro ao iniciar ${programName}`, 'error');
    } finally {
        hideLoadingOverlay();
    }
}

// Adicionar indicadores visuais para navegação por controle
function addGamepadIndicators() {
    const style = document.createElement('style');
    style.textContent = `
        .program-item:focus::after {
            content: "🎮";
            position: absolute;
            top: 8px;
            right: 8px;
            font-size: 12px;
            opacity: 0.7;
            animation: pulse 1.5s infinite;
            z-index: 10;
        }
        
        .category-filter:focus::before {
            content: "◀ ▶";
            position: absolute;
            top: -20px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 10px;
            color: #00d4ff;
            opacity: 0.8;
        }
        
        #filter-toggle:focus::after {
            content: "↓";
            position: absolute;
            bottom: -15px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 14px;
            color: #00d4ff;
            animation: bounce 1s infinite;
        }
        
        .programs-categories.show {
            display: flex !important;
            opacity: 1;
            transform: translateY(0);
        }
        
        .programs-categories {
            opacity: 0;
            transform: translateY(-10px);
            transition: all 0.3s ease;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 0.7; }
            50% { opacity: 1; }
        }
        
        @keyframes bounce {
            0%, 100% { transform: translateX(-50%) translateY(0); }
            50% { transform: translateX(-50%) translateY(-3px); }
        }
    `;
    document.head.appendChild(style);
}

// Utilitários
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateProgramsCount(count) {
    const countElement = document.getElementById('programs-count-text');
    if (countElement) {
        countElement.textContent = `${count} programa${count !== 1 ? 's' : ''}`;
    }
}

function showLoadingInProgramsGrid(message) {
    if (programsElements.grid) {
        programsElements.grid.innerHTML = `
            <div class="programs-loading">
                <div class="loading-spinner"></div>
                <div class="loading-message">${message}</div>
            </div>
        `;
    }
}

function showErrorInProgramsGrid(message) {
    if (programsElements.grid) {
        programsElements.grid.innerHTML = `
            <div class="programs-error">
                <div class="error-icon">❌</div>
                <div class="error-message">${message}</div>
                <button class="retry-button" onclick="loadAllPrograms()">Tentar Novamente</button>
            </div>
        `;
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Funções auxiliares
function showLoadingOverlay(text) {
    if (window.showLoadingOverlay) {
        window.showLoadingOverlay(text);
    }
}

function hideLoadingOverlay() {
    if (window.hideLoadingOverlay) {
        window.hideLoadingOverlay();
    }
}

function showNotification(message, type) {
    if (window.showNotification) {
        window.showNotification(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// Exportar funções principais
window.programsModule = {
    initialize: initializeProgramsModule,
    loadPrograms: loadAllPrograms,
    isLoaded: () => programsLoaded,
    getData: () => programsData,
    refresh: async () => {
        programsLoaded = false;
        programsData = [];
        await loadAllPrograms();
    }
};

// Auto-inicializar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeProgramsModule);
} else {
    initializeProgramsModule();
}

console.log('Módulo programs.js carregado com sucesso!');