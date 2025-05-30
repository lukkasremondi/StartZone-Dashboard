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
        const apiUrl = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=${sourceLang}|${targetLang}&de=lucas.remondi@outlook.com`;
        
        const response = await axios.get(apiUrl);
        
        if (response.data && response.data.responseData && response.data.responseData.translatedText) {
            let translated = response.data.responseData.translatedText;
            if (response.data.responseStatus === 200 && !translated.toUpperCase().includes("MYMEMORY WARNING")) {
                 console.log(`[Game-Info] Texto traduzido com sucesso.`);
                return translated;
            } else {
                console.warn("[Game-Info] MyMemory API: Limite de traduções ou aviso presente. Usando texto original.", response.data.responseDetails || "");
                return text; 
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

async function getGameDetails(gameName) {
    if (!gameName) return null;
    const slug = slugify(gameName);
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
            rawDescription = data.description_raw || data.description;
            console.log(`[Game-Info] Descrição em EN da RAWG encontrada.`);
        }

        developer = data.developers?.[0]?.name || 'Não informado';
        releaseDate = data.released ? new Date(data.released).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Não informada';

        let cleanDescription = rawDescription.replace(/<[^>]+>/g, '');
        cleanDescription = cleanDescription.replace(/&nbsp;/g, ' ').replace(/\s{2,}/g, ' ');

        if (cleanDescription && cleanDescription !== 'Nenhuma descrição disponível.') {
            console.log(`[Game-Info] Tentando traduzir a descrição para PT-BR...`);
            finalDescription = await translateText(cleanDescription, 'pt-BR', 'en');
        } else {
            finalDescription = cleanDescription;
        }

        if (finalDescription.length > 1020) {
            finalDescription = finalDescription.substring(0, 1020) + "...";
        }

    } catch (error) {
        console.error(`[Game-Info] Erro ao buscar detalhes para "${gameName}" na API RAWG:`, error.message);
    }

    return {
        description: finalDescription,
        developer: developer,
        releaseDate: releaseDate,
    };
}

// AJUSTE: Função getSteamGames revisada e aprimorada
async function getSteamGames() {
    const steamGames = [];
    console.log('[Game-Info] Iniciando busca por jogos da Steam...');

    const knownSteamPaths = [
        'C:\\Program Files (x86)\\Steam',
        'C:\\Program Files\\Steam',
    ];
    // Adiciona caminhos comuns em outras unidades
    for (let charCode = 'D'.charCodeAt(0); charCode <= 'Z'.charCodeAt(0); charCode++) {
        const drive = String.fromCharCode(charCode);
        knownSteamPaths.push(`${drive}:\\SteamLibrary`);
        knownSteamPaths.push(`${drive}:\\Steam`);
        knownSteamPaths.push(`${drive}:\\Program Files\\Steam`);
        knownSteamPaths.push(`${drive}:\\Program Files (x86)\\Steam`);
    }
    if (process.env.STEAM_PATH) knownSteamPaths.push(process.env.STEAM_PATH);
    if (process.env.ProgramFiles) knownSteamPaths.push(path.join(process.env.ProgramFiles, 'Steam'));
    if (process.env['ProgramFiles(x86)']) knownSteamPaths.push(path.join(process.env['ProgramFiles(x86)'], 'Steam'));

    const uniqueSteamPaths = [...new Set(knownSteamPaths.filter(Boolean))];
    let mainSteamPath = null;
    const librarySearchPaths = new Set();

    for (const testPath of uniqueSteamPaths) {
        try {
            const steamappsFolder = path.join(testPath, 'steamapps');
            if (fs.existsSync(steamappsFolder)) {
                if (!mainSteamPath) { // Prioriza o primeiro caminho principal encontrado
                    mainSteamPath = testPath;
                    console.log(`[Game-Info] Pasta principal da Steam (potencial) encontrada em: ${mainSteamPath}`);
                }
                librarySearchPaths.add(steamappsFolder);
                
                // Verifica se este é um diretório raiz da Steam e busca por libraryfolders.vdf
                const vdfPath = path.join(steamappsFolder, 'libraryfolders.vdf');
                if (fs.existsSync(vdfPath)) {
                     try {
                        const vdfContent = fs.readFileSync(vdfPath, 'utf-8');
                        const lines = vdfContent.split('\n');
                        lines.forEach(line => {
                            const match = line.match(/"path"\s+"([^"]+)"/i);
                            if (match && match[1]) {
                                const libPath = match[1].replace(/\\\\/g, '\\');
                                const potentialSteamAppsPath = path.join(libPath, 'steamapps');
                                if (fs.existsSync(potentialSteamAppsPath)) {
                                    librarySearchPaths.add(potentialSteamAppsPath);
                                }
                            }
                        });
                    } catch (e) { console.warn(`[Game-Info] Erro ao ler libraryfolders.vdf em ${vdfPath}: ${e.message}`); }
                }
            }
        } catch (e) { /* Ignora erros de acesso */ }
    }
    
    if (librarySearchPaths.size === 0) {
         console.warn('[Game-Info] Nenhuma pasta steamapps da Steam foi encontrada.');
        return [];
    }
    
    console.log('[Game-Info] Buscando em pastas steamapps:', [...librarySearchPaths]);

    for (const currentSteamAppsPath of librarySearchPaths) {
        try {
            const files = fs.readdirSync(currentSteamAppsPath);
            for (const file of files) {
                if (file.startsWith('appmanifest_') && file.endsWith('.acf')) {
                    const filePath = path.join(currentSteamAppsPath, file);
                    try {
                        const content = fs.readFileSync(filePath, 'utf-8');
                        const game = parseSteamACF(content);
                        if (game && game.name && game.installdir) {
                            const gameInstallPath = path.join(currentSteamAppsPath, 'common', game.installdir);
                            if (fs.existsSync(gameInstallPath)) {
                                const executablePath = await findGameExecutable(gameInstallPath, game.name);
                                if (executablePath) {
                                    steamGames.push({
                                        name: game.name,
                                        path: executablePath,
                                        appId: game.appid,
                                        installDir: game.installdir,
                                        platform: 'Steam',
                                        type: 'game',
                                        size: await getDirectorySize(gameInstallPath)
                                    });
                                } else {
                                     console.warn(`[Game-Info] Executável não encontrado para ${game.name} em ${gameInstallPath}`);
                                }
                            } else {
                                console.warn(`[Game-Info] Pasta de instalação não encontrada para ${game.name}: ${gameInstallPath}`);
                            }
                        }
                    } catch (acfError) {
                        console.error(`[Game-Info] Erro ao processar arquivo ACF ${file}:`, acfError.message);
                    }
                }
            }
        } catch(readDirError) {
            console.error(`[Game-Info] Erro ao ler diretório ${currentSteamAppsPath}:`, readDirError.message);
        }
    }
    
    // Remover duplicatas por appId, priorizando a que tem path
    const finalSteamGames = [];
    const seenAppIds = new Map();
    for (const game of steamGames) {
        if (!seenAppIds.has(game.appId) || (game.path && !seenAppIds.get(game.appId).path)) {
            seenAppIds.set(game.appId, game);
        }
    }
    finalSteamGames.push(...seenAppIds.values());

    console.log(`[Game-Info] Total de ${finalSteamGames.length} jogos da Steam únicos encontrados.`);
    return finalSteamGames;
}

// AJUSTE: parseSteamACF revisada para ser mais robusta com regex
function parseSteamACF(content) {
    const gameInfo = {};
    try {
        const appidMatch = content.match(/"appid"\s+"(\d+)"/i);
        const nameMatch = content.match(/"name"\s+"([^"]+)"/i);
        const installdirMatch = content.match(/"installdir"\s+"([^"]+)"/i); // Case-insensitive

        if (appidMatch && appidMatch[1]) gameInfo.appid = appidMatch[1];
        if (nameMatch && nameMatch[1]) gameInfo.name = nameMatch[1];
        if (installdirMatch && installdirMatch[1]) gameInfo.installdir = installdirMatch[1];
        
        return (gameInfo.appid && gameInfo.name && gameInfo.installdir) ? gameInfo : null;
    } catch (error) {
        console.error('[Game-Info] Erro ao fazer parse do arquivo ACF:', error);
        return null;
    }
}

// extractValue não é mais necessária para parseSteamACF, mas pode ser mantida se usada em outro lugar.
// Se não, pode ser removida. Vou mantê-la por enquanto caso outra parte do seu código original dependa dela.
function extractValue(line) { 
    const matches = line.match(/"([^"]+)"\s+"([^"]+)"/);
    return matches ? matches[2] : null;
}

// AJUSTE: findGameExecutable revisada para ser mais robusta
function findGameExecutable(gameInstallPath, gameName) {
    try {
        const entries = fs.readdirSync(gameInstallPath, { withFileTypes: true });
        let executables = [];

        function findExesRecursively(currentPath, currentRelativePath = '', depth = 0, maxDepth = 1) {
            if (depth > maxDepth) return;
            try {
                const items = fs.readdirSync(currentPath, { withFileTypes: true });
                for (const item of items) {
                    const itemPath = path.join(currentPath, item.name);
                    const relativeItemPath = path.join(currentRelativePath, item.name);
                    if (item.isFile() && item.name.toLowerCase().endsWith('.exe')) {
                        executables.push({ path: itemPath, name: item.name, size: fs.statSync(itemPath).size });
                    } else if (item.isDirectory() && depth < maxDepth) {
                        const lowerName = item.name.toLowerCase();
                        if (!['engine', 'binaries', 'redist', '_commonredist', 'directx', 'vcredist', 'dotnet', 'support'].some(keyword => lowerName.includes(keyword))) {
                            findExesRecursively(itemPath, relativeItemPath, depth + 1, maxDepth);
                        }
                    }
                }
            } catch (e) {
                console.warn(`[Game-Info] Não foi possível ler o diretório ${currentPath} em findGameExecutable: ${e.message}`);
            }
        }
        
        findExesRecursively(gameInstallPath);

        if (executables.length === 0) return null;
        if (executables.length === 1) return executables[0].path;

        const gameNameLowerSimple = gameName.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Priorizar executáveis com nome similar ao do jogo ou nome da pasta de instalação
        const installDirNameSimple = path.basename(gameInstallPath).toLowerCase().replace(/[^a-z0-9]/g, '');

        executables.sort((a, b) => {
            const aNameLower = a.name.toLowerCase().replace('.exe', '');
            const bNameLower = b.name.toLowerCase().replace('.exe', '');
            let scoreA = 0;
            let scoreB = 0;

            if (aNameLower === gameNameLowerSimple || aNameLower === installDirNameSimple) scoreA += 10;
            if (bNameLower === gameNameLowerSimple || bNameLower === installDirNameSimple) scoreB += 10;
            
            if (aNameLower.includes(gameNameLowerSimple) || aNameLower.includes(installDirNameSimple)) scoreA += 5;
            if (bNameLower.includes(gameNameLowerSimple) || bNameLower.includes(installDirNameSimple)) scoreB += 5;

            if (a.name.toLowerCase() === "game.exe") scoreA += 3;
            if (b.name.toLowerCase() === "game.exe") scoreB += 3;
            
            // Menor profundidade (mais próximo da raiz da pasta do jogo) é melhor
            const depthA = a.path.split(path.sep).length - gameInstallPath.split(path.sep).length;
            const depthB = b.path.split(path.sep).length - gameInstallPath.split(path.sep).length;
            if (depthA < depthB) scoreA += 2;
            if (depthB < depthA) scoreB += 2;

            // Penaliza nomes comuns de launchers de engines ou instaladores
            if (['ue4game', 'unityplayer', 'crashreportclient', 'launcher', 'setup', 'install'].some(key => aNameLower.includes(key))) scoreA -= 5;
            if (['ue4game', 'unityplayer', 'crashreportclient', 'launcher', 'setup', 'install'].some(key => bNameLower.includes(key))) scoreB -= 5;
            
            if (scoreB !== scoreA) return scoreB - scoreA; // Maior score primeiro
            return b.size - a.size; // Se scores iguais, maior arquivo primeiro
        });
        
        return executables.length > 0 ? executables[0].path : null;

    } catch (error) {
        console.error(`[Game-Info] Erro ao procurar executável em ${gameInstallPath} para ${gameName}:`, error);
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
        const manifestDataPath = path.join(process.env.ProgramData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');

        if (fs.existsSync(manifestDataPath)) {
            const manifestGames = await readEpicManifests(manifestDataPath);
            epicGames.push(...manifestGames);
        } else {
             console.warn(`[Game-Info] Pasta de manifestos da Epic não encontrada em: ${manifestDataPath}`);
        }
        
        // Tentar o LauncherInstalled.dat se a busca por manifestos não retornar muito
        const launcherDatPath = path.join(process.env.ProgramData, 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat');
        if (epicGames.length === 0 && fs.existsSync(launcherDatPath)) {
             const launcherGames = await readLauncherInstalledFile(launcherDatPath);
             epicGames.push(...launcherGames);
        }

        const uniqueGames = removeDuplicateGames(epicGames);
        console.log(`[Game-Info] Total de ${uniqueGames.length} jogos da Epic Games encontrados.`);
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
                    if (item.AppName && item.InstallLocation && !item.AppName.toLowerCase().includes('unrealengine') && !item.AppName.toLowerCase().startsWith('ue_')) {
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
                } catch (itemError) { console.error('Erro ao processar item da Epic (LauncherInstalled.dat):', itemError); }
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
                if (manifest.DisplayName && manifest.InstallLocation && manifest.bIsApplication !== false && !manifest.DisplayName.toLowerCase().includes('unreal engine')) {
                    if (fs.existsSync(manifest.InstallLocation)) {
                        const gameExe = await findEpicGameExecutable(manifest.InstallLocation, manifest.DisplayName, manifest.LaunchExecutable);
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

async function findEpicGameExecutable(gameInstallPath, gameDisplayName, launchExecutable = null) {
    try {
        if (launchExecutable) {
            const mainExePath = path.join(gameInstallPath, launchExecutable);
            if (fs.existsSync(mainExePath) && mainExePath.toLowerCase().endsWith('.exe')) {
                return mainExePath;
            }
        }
        return findGameExecutable(gameInstallPath, gameDisplayName);
    } catch (error) {
         console.error(`[Game-Info] Erro ao procurar executável para ${gameDisplayName} (Epic):`, error);
        return null;
    }
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
    let largestExe = executables.length > 0 ? executables[0] : null; 
    for(const exe of executables){
        try{
            const fullExePath = path.join(folderPath, exe); // Precisa do caminho completo para fs.statSync
            if (fs.existsSync(fullExePath)) { // Verifica se o arquivo existe
                const stats = fs.statSync(fullExePath);
                if(stats.size > largestSize){
                    largestSize = stats.size;
                    largestExe = exe;
                }
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