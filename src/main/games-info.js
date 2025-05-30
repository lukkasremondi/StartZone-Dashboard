const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');
const { shell } = require('electron');
const { fetchAndCacheCover } = require('./games-covers.js');
const axios = require('axios');

// Chave da API da RAWG para buscar detalhes dos jogos
const RAWG_API_KEY = 'ce546c1cceb34b3caf4b5745705a405c';

// Função para traduzir texto usando a MyMemory API
async function translateText(text, targetLang = 'pt-BR', sourceLang = 'en') {
    if (!text) return null;
    console.log(`[Game-Info] Tentando traduzir texto de ${sourceLang} para ${targetLang}...`);
    try {
        const encodedText = encodeURIComponent(text);
        // Adiciona um parâmetro de email fictício, às vezes ajuda com limites da MyMemory
        const apiUrl = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=${sourceLang}|${targetLang}&de=lucas.remondi@outlook.com`;
        
        const response = await axios.get(apiUrl);
        
        if (response.data && response.data.responseData && response.data.responseData.translatedText) {
            let translated = response.data.responseData.translatedText;
            // Verifica se a tradução realmente ocorreu e não é um aviso de limite
            if (response.data.responseStatus === 200 && !translated.toUpperCase().includes("MYMEMORY WARNING")) {
                 console.log(`[Game-Info] Texto traduzido com sucesso.`);
                return translated;
            } else {
                console.warn("[Game-Info] MyMemory API: Limite de traduções ou aviso presente. Usando texto original.", response.data.responseDetails || "");
                return text; // Retorna o texto original se aviso de limite ou erro
            }
        } else {
            console.warn('[Game-Info] MyMemory API não retornou texto traduzido ou falhou:', response.data);
            return text; 
        }
    } catch (error) {
        console.error('[Game-Info] Erro ao traduzir texto com MyMemory API:', error.message);
        return text; 
    }
}

async function getInstalledGames() {
    const games = [];
    console.log('🎮 Iniciando busca por jogos instalados...');
    
    try {
        const searchPromises = [];
        
        const searchWithTimeout = async (searchFunction, name, timeout = 15000) => {
            return Promise.race([
                searchFunction(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(`Timeout na busca de ${name}`)), timeout)
                )
            ]);
        };
        
        console.log('Iniciando busca em paralelo...');
        
        searchPromises.push(
            searchWithTimeout(getSteamGames, 'Steam')
                .then(steamGames => {
                    console.log(`✓ Steam: ${steamGames?.length || 0} jogos encontrados`);
                    return { platform: 'Steam', games: steamGames || [] };
                })
                .catch(error => {
                    console.error('✗ Erro Steam:', error.message);
                    return { platform: 'Steam', games: [] };
                })
        );
        
        searchPromises.push(
            searchWithTimeout(getEpicGames, 'Epic Games')
                .then(epicGames => {
                    console.log(`✓ Epic: ${epicGames?.length || 0} jogos encontrados`);
                    return { platform: 'Epic Games', games: epicGames || [] };
                })
                .catch(error => {
                    console.error('✗ Erro Epic:', error.message);
                    return { platform: 'Epic Games', games: [] };
                })
        );
        
        searchPromises.push(
            searchWithTimeout(getLocalGames, 'Jogos Locais')
                .then(localGames => {
                    console.log(`✓ Local: ${localGames?.length || 0} jogos encontrados`);
                    return { platform: 'Local Games', games: localGames || [] };
                })
                .catch(error => {
                    console.error('✗ Erro Local:', error.message);
                    return { platform: 'Local Games', games: [] };
                })
        );
        
        const results = await Promise.allSettled(searchPromises);
        
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value.games) {
                const platformGames = result.value.games;
                if (Array.isArray(platformGames)) {
                    games.push(...platformGames);
                }
            }
        });
        
        console.log(`📋 Total bruto coletado: ${games.length} jogos`);
        
        const uniqueGames = removeDuplicateGamesByName(games);
        console.log(`🔧 Após remoção de duplicatas: ${uniqueGames.length} jogos`);
        
        console.log('🖼️  Iniciando busca de capas para jogos únicos...');
        const gamesWithCoversPromises = uniqueGames.map(async (game) => {
            const localCoverPath = await fetchAndCacheCover(game.name);
            const coverUrl = localCoverPath ? url.pathToFileURL(localCoverPath).href : null;
            return {
                ...game,
                coverPath: coverUrl,
            };
        });

        const enrichedGames = await Promise.all(gamesWithCoversPromises);
        console.log('✅ Busca de capas finalizada.');
        
        const sortedGames = enrichedGames.sort((a, b) => {
            if (!a.name || !b.name) return 0;
            return a.name.localeCompare(b.name, 'pt-BR');
        });
        
        if (sortedGames.length > 0) {
            console.log(`🎮 RESULTADO FINAL: ${sortedGames.length} jogos únicos encontrados`);
        } else {
            console.error('❌ NENHUM JOGO FOI ENCONTRADO!');
        }
        
        return sortedGames;
        
    } catch (error) {
        console.error('💥 ERRO CRÍTICO ao buscar jogos instalados:', error);
        console.error('Stack trace:', error.stack);
        return [];
    }
}

async function testGameSearch() {
    console.log('🧪 TESTE DE BUSCA DE JOGOS');
    const tests = [
        { name: 'Steam', func: getSteamGames },
        { name: 'Epic', func: getEpicGames },
        { name: 'Local', func: getLocalGames }
    ];
    const results = {};
    for (const test of tests) {
        try {
            console.log(`🔍 Testando ${test.name}...`);
            const startTime = Date.now();
            const result = await test.func();
            const duration = Date.now() - startTime;
            results[test.name] = {
                success: true,
                count: result?.length || 0,
                duration: duration,
                sample: result?.slice(0, 2)
            };
            console.log(`✅ ${test.name}: ${result?.length || 0} jogos em ${duration}ms`);
        } catch (error) {
            results[test.name] = {
                success: false,
                error: error.message,
                duration: null
            };
            console.error(`❌ ${test.name}: ${error.message}`);
        }
    }
    return results;
}

function removeDuplicateGamesByName(games) {
    const seen = new Map();
    const uniqueGames = [];
    for (const game of games) {
        if (!game || !game.name) continue;
        const normalizedName = game.name.toLowerCase().trim()
            .replace(/[^\w\s]/g, '') 
            .replace(/\s+/g, ' ');  
        if (!seen.has(normalizedName)) {
            seen.set(normalizedName, game);
            uniqueGames.push(game);
        } else {
            const existingGame = seen.get(normalizedName);
            const platformPriority = { 'Steam': 3, 'Epic Games': 2, 'Local Games': 1 };
            const currentPriority = platformPriority[game.platform] || 0;
            const existingPriority = platformPriority[existingGame.platform] || 0;
            
            if (currentPriority > existingPriority) {
                const indexToRemove = uniqueGames.findIndex(ug => ug === existingGame);
                if (indexToRemove !== -1) uniqueGames.splice(indexToRemove, 1);
                uniqueGames.push(game);
                seen.set(normalizedName, game);
            }
        }
    }
    return uniqueGames;
}

function getGameStatistics(games) {
    const stats = {};
    for (const game of games) {
        const platform = game.platform || 'Unknown';
        stats[platform] = (stats[platform] || 0) + 1;
    }
    return stats;
}

function getGamesByPlatform(games, platform) {
    const platformMap = {
        'steam': 'Steam',
        'epic': 'Epic Games',
        'other': 'Local Games'
    };
    const targetPlatform = platformMap[platform.toLowerCase()] || platform;
    return games.filter(game => game.platform && game.platform.toLowerCase() === targetPlatform.toLowerCase());
}

function searchGamesByName(games, searchTerm) {
    if (!searchTerm || searchTerm.trim().length === 0) return games;
    const term = searchTerm.toLowerCase().trim();
    return games.filter(game => game.name && game.name.toLowerCase().includes(term));
}

function getGamesSummary(games) {
    const summary = {
        total: games.length,
        platforms: getGameStatistics(games),
        totalSize: '0 GB',
        avgSize: '0 MB'
    };
    let totalSizeBytes = 0;
    let gamesWithSize = 0;
    for (const game of games) {
        if (game.size && game.size !== 'N/A') {
            let bytes = 0;
            const sizeMatch = String(game.size).match(/(\d+(?:\.\d+)?)\s*(MB|GB)/i);
            if (sizeMatch) {
                bytes = parseFloat(sizeMatch[1]);
                if (sizeMatch[2].toUpperCase() === 'GB') bytes *= 1024 * 1024 * 1024;
                else if (sizeMatch[2].toUpperCase() === 'MB') bytes *= 1024 * 1024;
            }
            if (bytes > 0) {
                 totalSizeBytes += bytes;
                 gamesWithSize++;
            }
        }
    }
    if (totalSizeBytes > 0) {
        if (totalSizeBytes >= 1024 * 1024 * 1024) {
            summary.totalSize = `${(totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        } else {
            summary.totalSize = `${(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB`;
        }
        if (gamesWithSize > 0) {
            summary.avgSize = `${Math.round((totalSizeBytes / gamesWithSize) / (1024 * 1024))} MB`;
        }
    }
    return summary;
}

async function launchGame(game, mainWindow) {
    if (!game || !game.path) {
        return { success: false, message: "Caminho do jogo não fornecido." };
    }
    console.log(`[Game-Info] Tentando iniciar: ${game.name} em ${game.path}`);
    try {
        const gameDir = path.dirname(game.path);
        const gameProcess = exec(`"${game.path}"`, { cwd: gameDir });

        gameProcess.on('spawn', () => {
            console.log(`[Game-Info] ${game.name} iniciado. Enviando evento 'game-started'...`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('game-started', game);
            }
        });

        gameProcess.on('close', (code) => {
            console.log(`[Game-Info] ${game.name} fechado (código: ${code}). Enviando evento 'game-stopped'...`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('game-stopped', game);
            }
        });

        gameProcess.on('error', (err) => {
            console.error(`[Game-Info] Erro durante a execução de ${game.name}:`, err);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('game-stopped', game);
            }
        });
        return { success: true };
    } catch (error) {
        console.error(`[Game-Info] Falha ao executar o processo do jogo ${game.name}:`, error);
        return { success: false, message: error.message };
    }
}

function slugify(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

// AJUSTE NA LÓGICA DE BUSCA E TRADUÇÃO DA DESCRIÇÃO
async function getGameDetails(gameName) {
    if (!gameName) return null;
    
    const slug = slugify(gameName);
    // Sempre busca em inglês primeiro na RAWG
    const rawgUrl = `https://api.rawg.io/api/games/${slug}?key=${RAWG_API_KEY}`; 
    
    let rawDescription = 'Nenhuma descrição disponível.';
    let developer = 'Não informado';
    let releaseDate = 'Não informada';
    let finalDescription = 'Nenhuma descrição disponível.';

    try {
        console.log(`[Game-Info] Buscando detalhes em EN para "${gameName}" na RAWG...`);
        const response = await axios.get(rawgUrl);
        const data = response.data;

        if (data && (data.description_raw || data.description)) {
            rawDescription = data.description_raw || data.description; // Prioriza description_raw
            console.log(`[Game-Info] Descrição em EN da RAWG encontrada.`);
        }

        developer = data.developers?.[0]?.name || 'Não informado';
        releaseDate = data.released ? new Date(data.released).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Não informada';

        // Limpa tags HTML da descrição ANTES de traduzir
        let cleanDescription = rawDescription.replace(/<[^>]+>/g, ''); // Regex para remover HTML
        cleanDescription = cleanDescription.replace(/&nbsp;/g, ' ').replace(/\s{2,}/g, ' '); // Limpa &nbsp; e espaços múltiplos

        // Se a descrição (limpa) não for vazia, tenta traduzir
        if (cleanDescription && cleanDescription !== 'Nenhuma descrição disponível.') {
            console.log(`[Game-Info] Tentando traduzir a descrição para PT-BR...`);
            finalDescription = await translateText(cleanDescription, 'pt-BR', 'en');
        } else {
            finalDescription = cleanDescription; // Usa a descrição limpa se estiver vazia ou for a padrão
        }

        // Limita a 1020 caracteres APÓS a tradução
        if (finalDescription.length > 600) {
            finalDescription = finalDescription.substring(0, 600) + "...";
        }

    } catch (error) {
        console.error(`[Game-Info] Erro ao buscar detalhes para "${gameName}" na API RAWG:`, error.message);
        // finalDescription já está como 'Nenhuma descrição disponível.'
        // developer e releaseDate já são 'Não informado(a)'
    }

    return {
        description: finalDescription,
        developer: developer,
        releaseDate: releaseDate,
    };
}


async function getSteamGames() {
    try {
        const steamGames = [];
        const steamPaths = [
            path.join(os.homedir(), 'AppData', 'Local', 'Steam'),
            'C:\\Program Files (x86)\\Steam',
            'C:\\Program Files\\Steam',
            'D:\\Steam',
            'E:\\Steam',
        ];
        const userDefinedSteamPath = process.env.STEAM_PATH;
        if(userDefinedSteamPath && fs.existsSync(userDefinedSteamPath)) {
            steamPaths.push(userDefinedSteamPath);
        }

        let steamPath = null;
        for (const testPath of steamPaths) {
            try {
                if (fs.existsSync(testPath)) {
                    steamPath = testPath;
                    break;
                }
            } catch (e) { /* Ignora erros de acesso */ }
        }

        if (!steamPath) {
            console.log('Steam não encontrada nos caminhos padrão');
            return [];
        }
        const steamappsPath = path.join(steamPath, 'steamapps');
        if (!fs.existsSync(steamappsPath)) return [];

        const libraryFoldersPath = path.join(steamappsPath, 'libraryfolders.vdf');
        const librarySearchPaths = [steamappsPath];

        if (fs.existsSync(libraryFoldersPath)) {
            try {
                const vdfContent = fs.readFileSync(libraryFoldersPath, 'utf-8');
                const lines = vdfContent.split('\n');
                lines.forEach(line => {
                    const match = line.match(/"path"\s+"([^"]+)"/i);
                    if (match && match[1]) {
                        const libPath = match[1].replace(/\\\\/g, '\\');
                        if (fs.existsSync(libPath) && fs.existsSync(path.join(libPath, 'steamapps'))) {
                            librarySearchPaths.push(path.join(libPath, 'steamapps'));
                        }
                    }
                });
            } catch (e) { console.error('Erro ao ler libraryfolders.vdf:', e); }
        }
        
        for (const currentSteamappsPath of [...new Set(librarySearchPaths)]) {
            const acfFiles = fs.readdirSync(currentSteamappsPath)
                .filter(file => file.startsWith('appmanifest_') && file.endsWith('.acf'));
            for (const acfFile of acfFiles) {
                try {
                    const acfPath = path.join(currentSteamappsPath, acfFile);
                    const acfContent = fs.readFileSync(acfPath, 'utf8');
                    const gameInfo = parseSteamACF(acfContent);
                    if (gameInfo && gameInfo.name && gameInfo.installdir) {
                        const gamePath = path.join(currentSteamappsPath, 'common', gameInfo.installdir);
                        if (fs.existsSync(gamePath)) {
                            const gameExe = findGameExecutable(gamePath, gameInfo.name);
                            steamGames.push({
                                name: gameInfo.name,
                                path: gameExe || gamePath,
                                appId: gameInfo.appid,
                                installDir: gameInfo.installdir,
                                platform: 'Steam',
                                type: 'game',
                                size: await getDirectorySize(gamePath)
                            });
                        }
                    }
                } catch (error) {
                    console.error(`Erro ao processar ${acfFile}:`, error);
                }
            }
        }
        return steamGames;
    } catch (error) {
        console.error('Erro ao buscar jogos da Steam:', error);
        return [];
    }
}

function parseSteamACF(content) {
    try {
        const gameInfo = {};
        const appidMatch = content.match(/"appid"\s+"(\d+)"/);
        const nameMatch = content.match(/"name"\s+"([^"]+)"/);
        const installdirMatch = content.match(/"installdir"\s+"([^"]+)"/);

        if (appidMatch) gameInfo.appid = appidMatch[1];
        if (nameMatch) gameInfo.name = nameMatch[1];
        if (installdirMatch) gameInfo.installdir = installdirMatch[1];
        
        return (gameInfo.appid && gameInfo.name && gameInfo.installdir) ? gameInfo : null;
    } catch (error) {
        console.error('Erro ao fazer parse do ACF:', error);
        return null;
    }
}

function extractValue(line) { 
    const matches = line.match(/"([^"]+)"\s+"([^"]+)"/);
    return matches ? matches[2] : null;
}

function findGameExecutable(gamePath, gameName) {
    try {
        const files = fs.readdirSync(gamePath, { withFileTypes: true });
        let candidates = [];
        for (const file of files) {
            if (file.isFile() && file.name.toLowerCase().endsWith('.exe')) {
                candidates.push(file.name);
            }
        }

        if (candidates.length === 0) return null;
        if (candidates.length === 1) return path.join(gamePath, candidates[0]);

        const gameNameLower = gameName.toLowerCase().replace(/[^a-z0-9]/g, '');
        candidates.sort((a, b) => {
            const aLower = a.toLowerCase();
            const bLower = b.toLowerCase();
            if (aLower.includes(gameNameLower)) return -1;
            if (bLower.includes(gameNameLower)) return 1;
            if (aLower === "game.exe") return -1;
            if (bLower === "game.exe") return 1;
            return 0;
        });
        return path.join(gamePath, candidates[0]);
    } catch (error) {
        console.error(`Erro ao procurar executável em ${gamePath} para ${gameName}:`, error);
        return null;
    }
}

async function getDirectorySize(dirPath) {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            const cmd = `powershell -Command "(Get-ChildItem -Path '${dirPath}' -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum"`;
            exec(cmd, { timeout: 10000 }, (error, stdout) => {
                if (error) { resolve('N/A'); return; }
                const bytes = parseInt(stdout.trim());
                if (!isNaN(bytes)) {
                    if (bytes === 0) resolve('~0 MB');
                    else if (bytes > 1024 * 1024 * 1024) resolve(`${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`);
                    else resolve(`${(bytes / (1024 * 1024)).toFixed(2)} MB`);
                } else {
                    resolve('N/A');
                }
            });
        } else {
            resolve('N/A');
        }
    });
}

async function getGamesFromAdditionalLibraries(libraryFoldersPath) { 
    return [];
}

async function getEpicGames() {
    try {
        const epicGames = [];
        const launcherInstalledPath = path.join('C:', 'ProgramData', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat');
        if (fs.existsSync(launcherInstalledPath)) {
            const launcherGames = await readLauncherInstalledFile(launcherInstalledPath);
            epicGames.push(...launcherGames);
        }
        const manifestsPath = path.join('C:', 'ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
        if (fs.existsSync(manifestsPath)) {
            const manifestGames = await readEpicManifests(manifestsPath);
            epicGames.push(...manifestGames);
        }
        const uniqueGames = removeDuplicateGames(epicGames);
        return uniqueGames;
    } catch (error) {
        console.error('Erro ao buscar jogos da Epic Games:', error);
        return [];
    }
}

async function readLauncherInstalledFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        const games = [];
        if (data.InstallationList && Array.isArray(data.InstallationList)) {
            for (const item of data.InstallationList) {
                try {
                    if (item.AppName && item.InstallLocation && !item.AppName.includes('UE_') && !item.AppName.includes('UnrealEngine') && item.InstallLocation !== '') {
                        if (fs.existsSync(item.InstallLocation)) {
                            const gameExe = await findEpicGameExecutable(item.InstallLocation, item.DisplayName || item.AppName);
                            if (gameExe) {
                                games.push({
                                    name: item.DisplayName || item.AppName, path: gameExe, appName: item.AppName,
                                    installLocation: item.InstallLocation, platform: 'Epic Games', type: 'game',
                                    size: await getDirectorySize(item.InstallLocation)
                                });
                            }
                        }
                    }
                } catch (itemError) { console.error('Erro ao processar item da Epic:', itemError); }
            }
        }
        return games;
    } catch (error) {
        console.error('Erro ao ler LauncherInstalled.dat:', error);
        return [];
    }
}

async function readEpicManifests(manifestsPath) {
    try {
        const games = [];
        const manifestFiles = fs.readdirSync(manifestsPath).filter(file => file.endsWith('.item'));
        for (const manifestFile of manifestFiles) {
            try {
                const manifestPath = path.join(manifestsPath, manifestFile);
                const content = fs.readFileSync(manifestPath, 'utf8');
                const manifest = JSON.parse(content);
                if (manifest.DisplayName && manifest.InstallLocation && manifest.InstallLocation !== '' && !manifest.AppName?.includes('UE_') && !manifest.AppName?.includes('UnrealEngine')) {
                    if (fs.existsSync(manifest.InstallLocation)) {
                        const gameExe = await findEpicGameExecutable(manifest.InstallLocation, manifest.DisplayName);
                        if (gameExe) {
                            games.push({
                                name: manifest.DisplayName, path: gameExe, appName: manifest.AppName || manifest.CatalogItemId,
                                installLocation: manifest.InstallLocation, platform: 'Epic Games', type: 'game',
                                size: await getDirectorySize(manifest.InstallLocation)
                            });
                        }
                    }
                }
            } catch (manifestError) { console.error(`Erro ao processar manifest ${manifestFile}:`, manifestError); }
        }
        return games;
    } catch (error) {
        console.error('Erro ao ler manifests da Epic:', error);
        return [];
    }
}

async function findEpicGameExecutable(gamePath, gameName) {
    return findGameExecutable(gamePath, gameName);
}

function removeDuplicateGames(games) {
    const seen = new Set();
    return games.filter(game => {
        const key = game.name.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function getLocalGames() {
    try {
        const localGames = [];
        const startZonePath = path.join('C:', 'StartZone Games');
        if (!fs.existsSync(startZonePath)) {
            console.log('Pasta StartZone Games não encontrada em C:\\StartZone Games');
            return [];
        }
        const files = fs.readdirSync(startZonePath, { withFileTypes: true });
        for (const file of files) {
            try {
                const filePath = path.join(startZonePath, file.name);
                if (file.isFile()) {
                    const fileExt = path.extname(file.name).toLowerCase();
                    if (fileExt === '.lnk') {
                        const shortcutInfo = processShortcut(filePath, file.name);
                        if (shortcutInfo) localGames.push(shortcutInfo);
                    } else if (fileExt === '.exe') {
                        const exeInfo = await processExecutable(filePath, file.name);
                        if (exeInfo) localGames.push(exeInfo);
                    }
                } else if (file.isDirectory()) {
                    const folderGames = await processGameFolder(filePath, file.name);
                    localGames.push(...folderGames);
                }
            } catch (fileError) { console.error(`Erro ao processar ${file.name}:`, fileError); }
        }
        return localGames.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error('Erro ao buscar jogos locais:', error);
        return [];
    }
}

function processShortcut(shortcutPath, fileName) {
    try {
        const gameName = path.basename(fileName, '.lnk');
        const shortcutTarget = getShortcutTarget(shortcutPath);
        if (shortcutTarget && fs.existsSync(shortcutTarget)) {
            return {
                name: gameName, path: shortcutTarget, platform: 'Local Games', type: 'game', source: 'shortcut',
                size: getFileSync(shortcutTarget)
            };
        } else {
            console.log(`Atalho ${fileName} aponta para arquivo inexistente ou inválido: ${shortcutTarget}`);
            return null;
        }
    } catch (error) {
        console.error(`Erro ao processar atalho ${fileName}:`, error);
        return null;
    }
}

async function processExecutable(exePath, fileName) {
    try {
        const gameName = path.basename(fileName, '.exe');
        if (fs.existsSync(exePath)) {
            return {
                name: gameName, path: exePath, platform: 'Local Games', type: 'game',
                source: 'executable', size: await getFileSize(exePath)
            };
        }
        return null;
    } catch (error) {
        console.error(`Erro ao processar executável ${fileName}:`, error);
        return null;
    }
}

async function processGameFolder(folderPath, folderName) {
    try {
        const games = [];
        const files = fs.readdirSync(folderPath);
        const executables = files.filter(file => file.toLowerCase().endsWith('.exe') && !file.toLowerCase().includes('uninstall') && !file.toLowerCase().includes('setup') && !file.toLowerCase().includes('installer'));
        if (executables.length === 1) {
            games.push({
                name: folderName, path: path.join(folderPath, executables[0]), platform: 'Local Games',
                type: 'game', source: 'folder', size: await getDirectorySize(folderPath)
            });
        } else if (executables.length > 1) {
            const mainExe = findMainExecutable(executables, folderName, folderPath);
            if (mainExe) {
                games.push({
                    name: folderName, path: path.join(folderPath, mainExe), platform: 'Local Games',
                    type: 'game', source: 'folder', size: await getDirectorySize(folderPath)
                });
            }
        }
        return games;
    } catch (error) {
        console.error(`Erro ao processar pasta ${folderName}:`, error);
        return [];
    }
}

function getShortcutTarget(shortcutPath) {
    try {
        const shortcutDetails = shell.readShortcutLink(shortcutPath);
        return shortcutDetails.target || null;
    } catch (error) {
        console.error(`Falha ao ler atalho com API nativa: ${shortcutPath}`, error);
        return null;
    }
}

function findMainExecutable(executables, folderName, folderPath) {
    const folderNameLower = folderName.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const exe of executables) {
        const exeNameLower = exe.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (exeNameLower.includes(folderNameLower) || folderNameLower.includes(exeNameLower)) {
            return exe;
        }
    }
    const gameKeywords = ['game', 'play', 'start', 'launch', 'main'];
    for (const keyword of gameKeywords) {
        const found = executables.find(exe => exe.toLowerCase().includes(keyword));
        if (found) return found;
    }
    let largestSize = 0;
    let largestExe = executables[0]; 
    for(const exe of executables){
        try{
            const stats = fs.statSync(path.join(folderPath, exe));
            if(stats.size > largestSize){
                largestSize = stats.size;
                largestExe = exe;
            }
        } catch(e){
            console.warn(`Não foi possível obter o tamanho de ${exe} em findMainExecutable: ${e.message}`);
        }
    }
    return largestExe;
}

function getFileSync(filePath) {
    try {
        const stats = fs.statSync(filePath);
        const bytes = stats.size;
        if (bytes === 0) return '~0 MB';
        if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    } catch (error) {
        return 'N/A';
    }
}

async function getFileSize(filePath) {
    try {
        const stats = fs.statSync(filePath);
        const bytes = stats.size;
        if (bytes === 0) return '~0 MB';
        if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    } catch (error) {
        return 'N/A';
    }
}

async function ensureStartZoneGamesFolder() {
    try {
        const startZonePath = path.join('C:', 'StartZone Games');
        if (!fs.existsSync(startZonePath)) {
            fs.mkdirSync(startZonePath, { recursive: true });
            const readmePath = path.join(startZonePath, 'README.txt');
            const readmeContent = `StartZone Games - Pasta de Jogos Locais\n==========================================\n\nEsta pasta é utilizada pelo StartZone para organizar seus jogos locais.\n\nVocê pode colocar aqui:\n- Atalhos (.lnk) para seus jogos favoritos\n- Executáveis (.exe) de jogos portáteis\n- Pastas contendo jogos\n\nO StartZone irá detectar automaticamente todos os jogos colocados nesta pasta.\n\nCriado automaticamente pelo StartZone Dashboard`;
            fs.writeFileSync(readmePath, readmeContent, 'utf8');
        }
        return startZonePath;
    } catch (error) {
        console.error('Erro ao criar pasta StartZone Games:', error);
        return null;
    }
}

async function addGameToStartZone(gameDetails) {
    const { name, path: gamePath } = gameDetails;
    try {
        const startZonePath = await ensureStartZoneGamesFolder();
        if (!startZonePath) return { success: false, message: 'Não foi possível criar ou acessar a pasta StartZone Games.'};
        const shortcutName = `${name}.lnk`;
        const shortcutPath = path.join(startZonePath, shortcutName);
        
        const success = shell.writeShortcutLink(shortcutPath, { target: gamePath });
        if (success) {
            console.log(`Atalho criado: ${shortcutPath}`);
            return { success: true, message: 'Atalho criado com sucesso.'};
        } else {
            console.error('Falha ao criar atalho usando shell.writeShortcutLink para:', name);
            return { success: false, message: 'Falha ao criar atalho.'};
        }
    } catch (error) {
        console.error(`Erro ao adicionar jogo ${name} à StartZone:`, error);
        return { success: false, message: error.message };
    }
}

module.exports = {
    getInstalledGames,
    getSteamGames,
    getEpicGames,
    getLocalGames,
    removeDuplicateGamesByName,
    getGameStatistics,
    getGamesByPlatform,
    searchGamesByName,
    getGamesSummary,
    launchGame,
    ensureStartZoneGamesFolder,
    addGameToStartZone,
    testGameSearch,
    getGameDetails,
};