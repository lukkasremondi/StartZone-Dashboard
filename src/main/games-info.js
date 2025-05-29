const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function getInstalledGames() {
  const games = [];
  console.log('🎮 Iniciando busca por jogos instalados...');
  
  try {
      // Array para armazenar as promessas de busca
      const searchPromises = [];
      
      // Função helper para buscar com timeout
      const searchWithTimeout = async (searchFunction, name, timeout = 10000) => {
          return Promise.race([
              searchFunction(),
              new Promise((_, reject) => 
                  setTimeout(() => reject(new Error(`Timeout na busca de ${name}`)), timeout)
              )
          ]);
      };
      
      // Busca jogos de todas as plataformas em paralelo
      console.log('Iniciando busca em paralelo...');
      
      // Steam
      searchPromises.push(
          searchWithTimeout(getSteamGames, 'Steam')
              .then(steamGames => {
                  console.log(`✓ Steam: ${steamGames?.length || 0} jogos encontrados`);
                  return { platform: 'steam', games: steamGames || [] };
              })
              .catch(error => {
                  console.error('✗ Erro Steam:', error.message);
                  return { platform: 'steam', games: [] };
              })
      );
      
      // Epic Games
      searchPromises.push(
          searchWithTimeout(getEpicGames, 'Epic Games')
              .then(epicGames => {
                  console.log(`✓ Epic: ${epicGames?.length || 0} jogos encontrados`);
                  return { platform: 'epic', games: epicGames || [] };
              })
              .catch(error => {
                  console.error('✗ Erro Epic:', error.message);
                  return { platform: 'epic', games: [] };
              })
      );
      
      // Jogos Locais
      searchPromises.push(
          searchWithTimeout(getLocalGames, 'Jogos Locais')
              .then(localGames => {
                  console.log(`✓ Local: ${localGames?.length || 0} jogos encontrados`);
                  return { platform: 'local', games: localGames || [] };
              })
              .catch(error => {
                  console.error('✗ Erro Local:', error.message);
                  return { platform: 'local', games: [] };
              })
      );
      
      // Aguardar todas as buscas
      const results = await Promise.allSettled(searchPromises);
      
      // Processar resultados
      let totalFound = 0;
      results.forEach(result => {
          if (result.status === 'fulfilled' && result.value.games) {
              const platformGames = result.value.games;
              if (Array.isArray(platformGames)) {
                  games.push(...platformGames);
                  totalFound += platformGames.length;
                  console.log(`📊 ${result.value.platform}: ${platformGames.length} jogos adicionados`);
              } else {
                  console.warn(`⚠️ ${result.value.platform}: resultado não é array:`, typeof platformGames);
              }
          } else {
              console.warn(`⚠️ Falha na busca:`, result.reason?.message || 'Erro desconhecido');
          }
      });
      
      console.log(`📋 Total bruto coletado: ${games.length} jogos`);
      
      // Verificar se temos jogos
      if (games.length === 0) {
          console.warn('⚠️ Nenhum jogo foi encontrado em nenhuma plataforma');
          
          // Teste de fallback - tentar buscar pelo menos um jogo local simples
          try {
              console.log('🔍 Tentando busca de fallback...');
              const fallbackGames = await getLocalGames();
              if (fallbackGames && fallbackGames.length > 0) {
                  games.push(...fallbackGames);
                  console.log(`✓ Fallback: ${fallbackGames.length} jogos encontrados`);
              }
          } catch (fallbackError) {
              console.error('✗ Fallback também falhou:', fallbackError);
          }
      }
      
      // Remove duplicatas baseado no nome (case-insensitive)
      const uniqueGames = removeDuplicateGamesByName(games);
      console.log(`🔧 Após remoção de duplicatas: ${uniqueGames.length} jogos`);
      
      // Ordena alfabeticamente
      const sortedGames = uniqueGames.sort((a, b) => {
          if (!a.name || !b.name) return 0;
          return a.name.localeCompare(b.name, 'pt-BR');
      });
      
      // Log final detalhado
      console.log(`🎮 RESULTADO FINAL: ${sortedGames.length} jogos únicos encontrados`);
      
      if (sortedGames.length > 0) {
          console.log('📊 Distribuição por plataforma:');
          const stats = getGameStatistics(sortedGames);
          Object.entries(stats).forEach(([platform, count]) => {
              console.log(`   ${platform}: ${count} jogos`);
          });
          
          // Mostrar primeiros 5 jogos como amostra
          console.log('🎯 Amostra de jogos encontrados:');
          sortedGames.slice(0, 5).forEach((game, index) => {
              console.log(`   ${index + 1}. ${game.name} | ${game.path?.substring(0, 50)}...`);
          });
          
          if (sortedGames.length > 5) {
              console.log(`   ... e mais ${sortedGames.length - 5} jogos`);
          }
      } else {
          console.error('❌ NENHUM JOGO FOI ENCONTRADO!');
          console.log('🔍 Verificações sugeridas:');
          console.log('   1. Steam está instalado?');
          console.log('   2. Epic Games Launcher está instalado?');
          console.log('   3. Existem jogos nas pastas de jogos locais?');
          console.log('   4. As funções getSteamGames, getEpicGames e getLocalGames estão funcionando?');
      }
      
      return sortedGames;
      
  } catch (error) {
      console.error('💥 ERRO CRÍTICO ao buscar jogos instalados:', error);
      console.error('Stack trace:', error.stack);
      
      // Tentar retornar pelo menos os jogos que conseguimos coletar
      console.log(`🚨 Retornando ${games.length} jogos coletados antes do erro`);
      return games;
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
          .replace(/[^\w\s]/g, '') // Remove caracteres especiais
          .replace(/\s+/g, ' ');   // Normaliza espaços
      
      if (!seen.has(normalizedName)) {
          seen.set(normalizedName, true);
          uniqueGames.push(game);
      } else {
          const existingIndex = uniqueGames.findIndex(g => 
              g.name.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ') === normalizedName
          );
          
          if (existingIndex !== -1) {
              const existing = uniqueGames[existingIndex];
              const platformPriority = { 'Steam': 3, 'Epic Games': 2, 'Local Games': 1 };
              const currentPriority = platformPriority[game.platform] || 0;
              const existingPriority = platformPriority[existing.platform] || 0;
              
              if (currentPriority > existingPriority) {
                  uniqueGames[existingIndex] = game;
              }
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
    return games.filter(game => game.platform && game.platform.toLowerCase() === platform.toLowerCase());
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
        totalSize: '0GB',
        avgSize: '0MB'
    };
    
    let totalSizeBytes = 0;
    let gamesWithSize = 0;
    
    for (const game of games) {
        if (game.size && game.size !== 'N/A') {
            const sizeMatch = game.size.match(/(\d+(?:\.\d+)?)(MB|GB)/);
            if (sizeMatch) {
                let bytes = parseFloat(sizeMatch[1]);
                if (sizeMatch[2] === 'GB') bytes *= 1024 * 1024 * 1024;
                else bytes *= 1024 * 1024;
                totalSizeBytes += bytes;
                gamesWithSize++;
            }
        }
    }
    
    if (totalSizeBytes > 0) {
        summary.totalSize = `${Math.round(totalSizeBytes / 1024 / 1024 / 1024 * 100) / 100}GB`;
        if (gamesWithSize > 0) {
            summary.avgSize = `${Math.round((totalSizeBytes / gamesWithSize) / 1024 / 1024)}MB`;
        }
    }
    return summary;
}

async function launchGame(game) {
    return new Promise((resolve, reject) => {
        if (!game || !game.path) return reject(new Error('Caminho do jogo não encontrado'));
        const pathToLaunch = game.path;
        console.log(`Iniciando jogo: ${game.name} em ${pathToLaunch}`);
        exec(`"${pathToLaunch}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Erro ao iniciar ${game.name}:`, error);
                reject(error);
            } else {
                console.log(`${game.name} iniciado com sucesso`);
                resolve(stdout);
            }
        });
    });
}

// ... (todas as outras funções de busca de jogos como getSteamGames, getEpicGames, getLocalGames e suas sub-funções)
// NOTE: As funções abaixo são as mesmas que você forneceu, sem alterações na lógica.

async function getSteamGames() {
    try {
        const steamGames = [];
        const steamPaths = [
            path.join(os.homedir(), 'AppData', 'Local', 'Steam'),
            path.join('C:', 'Program Files (x86)', 'Steam'),
            path.join('C:', 'Program Files', 'Steam'),
            path.join('D:', 'Steam'),
            path.join('E:', 'Steam')
        ];
        let steamPath = null;
        for (const testPath of steamPaths) {
            if (fs.existsSync(testPath)) {
                steamPath = testPath;
                break;
            }
        }
        if (!steamPath) {
            console.log('Steam não encontrada nos caminhos padrão');
            return [];
        }
        const steamappsPath = path.join(steamPath, 'steamapps');
        if (!fs.existsSync(steamappsPath)) {
            console.log('Pasta steamapps não encontrada');
            return [];
        }
        const acfFiles = fs.readdirSync(steamappsPath)
            .filter(file => file.startsWith('appmanifest_') && file.endsWith('.acf'));
        for (const acfFile of acfFiles) {
            try {
                const acfPath = path.join(steamappsPath, acfFile);
                const acfContent = fs.readFileSync(acfPath, 'utf8');
                const gameInfo = parseSteamACF(acfContent);
                if (gameInfo && gameInfo.name && gameInfo.installdir) {
                    const gamePath = path.join(steamappsPath, 'common', gameInfo.installdir);
                    if (fs.existsSync(gamePath)) {
                        const gameExe = findGameExecutable(gamePath, gameInfo.name);
                        steamGames.push({
                            name: gameInfo.name,
                            path: gameExe || gamePath,
                            appId: gameInfo.appid,
                            installDir: gameInfo.installdir,
                            platform: 'Steam',
                            type: 'game',
                            size: await getDirectorySize(gamePath).catch(() => 'N/A')
                        });
                    }
                }
            } catch (error) {
                console.error(`Erro ao processar ${acfFile}:`, error);
                continue;
            }
        }
        const libraryFoldersPath = path.join(steamappsPath, 'libraryfolders.vdf');
        if (fs.existsSync(libraryFoldersPath)) {
            const additionalGames = await getGamesFromAdditionalLibraries(libraryFoldersPath);
            steamGames.push(...additionalGames);
        }
        console.log(`Encontrados ${steamGames.length} jogos da Steam`);
        return steamGames;
    } catch (error) {
        console.error('Erro ao buscar jogos da Steam:', error);
        return [];
    }
}

function parseSteamACF(content) {
    try {
        const lines = content.split('\n');
        const gameInfo = {};
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes('"appid"')) gameInfo.appid = extractValue(trimmed);
            else if (trimmed.includes('"name"')) gameInfo.name = extractValue(trimmed);
            else if (trimmed.includes('"installdir"')) gameInfo.installdir = extractValue(trimmed);
        }
        return gameInfo;
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
        const files = fs.readdirSync(gamePath);
        const gameNameLower = gameName.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const file of files) {
            if (file.toLowerCase().endsWith('.exe')) {
                const fileNameLower = file.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (fileNameLower.includes(gameNameLower) || gameNameLower.includes(fileNameLower)) {
                    return path.join(gamePath, file);
                }
            }
        }
        const exeFile = files.find(file => file.toLowerCase().endsWith('.exe'));
        return exeFile ? path.join(gamePath, exeFile) : null;
    } catch (error) {
        console.error('Erro ao procurar executável do jogo:', error);
        return null;
    }
}

async function getDirectorySize(dirPath) {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            const cmd = `powershell -Command "(Get-ChildItem -Path '${dirPath}' -Recurse | Measure-Object -Property Length -Sum).Sum"`;
            exec(cmd, { timeout: 10000 }, (error, stdout) => {
                if (error) return resolve('N/A');
                const bytes = parseInt(stdout.trim());
                if (!isNaN(bytes)) {
                    resolve(`${Math.round(bytes / 1024 / 1024 / 1024 * 100) / 100}GB`);
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
    try {
        const content = fs.readFileSync(libraryFoldersPath, 'utf8');
        const additionalGames = [];
        const lines = content.split('\n');
        const libraryPaths = [];
        for (const line of lines) {
            if (line.includes('"path"')) {
                const pathValue = extractValue(line);
                if (pathValue && fs.existsSync(pathValue)) libraryPaths.push(pathValue);
            }
        }
        for (const libPath of libraryPaths) {
            const steamappsPath = path.join(libPath, 'steamapps');
            if (fs.existsSync(steamappsPath)) {
                const acfFiles = fs.readdirSync(steamappsPath).filter(file => file.startsWith('appmanifest_') && file.endsWith('.acf'));
                for (const acfFile of acfFiles) {
                    try {
                        const acfPath = path.join(steamappsPath, acfFile);
                        const acfContent = fs.readFileSync(acfPath, 'utf8');
                        const gameInfo = parseSteamACF(acfContent);
                        if (gameInfo && gameInfo.name && gameInfo.installdir) {
                            const gamePath = path.join(steamappsPath, 'common', gameInfo.installdir);
                            if (fs.existsSync(gamePath)) {
                                const gameExe = findGameExecutable(gamePath, gameInfo.name);
                                additionalGames.push({
                                    name: gameInfo.name, path: gameExe || gamePath, appId: gameInfo.appid,
                                    installDir: gameInfo.installdir, platform: 'Steam', type: 'game',
                                    size: await getDirectorySize(gamePath).catch(() => 'N/A')
                                });
                            }
                        }
                    } catch (error) {
                        console.error(`Erro ao processar ${acfFile} da biblioteca adicional:`, error);
                        continue;
                    }
                }
            }
        }
        return additionalGames;
    } catch (error) {
        console.error('Erro ao buscar bibliotecas adicionais da Steam:', error);
        return [];
    }
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
        console.log(`Encontrados ${uniqueGames.length} jogos da Epic Games`);
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
                            games.push({
                                name: item.DisplayName || item.AppName, path: gameExe || item.InstallLocation, appName: item.AppName,
                                installLocation: item.InstallLocation, platform: 'Epic Games', type: 'game',
                                size: await getDirectorySize(item.InstallLocation).catch(() => 'N/A')
                            });
                        }
                    }
                } catch (itemError) {
                    console.error('Erro ao processar item da Epic:', itemError);
                    continue;
                }
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
                        games.push({
                            name: manifest.DisplayName, path: gameExe || manifest.InstallLocation, appName: manifest.AppName || manifest.CatalogItemId,
                            installLocation: manifest.InstallLocation, platform: 'Epic Games', type: 'game',
                            size: await getDirectorySize(manifest.InstallLocation).catch(() => 'N/A')
                        });
                    }
                }
            } catch (manifestError) {
                console.error(`Erro ao processar manifest ${manifestFile}:`, manifestError);
                continue;
            }
        }
        return games;
    } catch (error) {
        console.error('Erro ao ler manifests da Epic:', error);
        return [];
    }
}

async function findEpicGameExecutable(gamePath, gameName) {
    try {
        const rootFiles = fs.readdirSync(gamePath);
        const gameNameLower = gameName.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const file of rootFiles) {
            if (file.toLowerCase().endsWith('.exe')) {
                const fileNameLower = file.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (fileNameLower.includes(gameNameLower) || gameNameLower.includes(fileNameLower) || file.toLowerCase().includes('game') || file.toLowerCase().includes(gameName.toLowerCase().split(' ')[0])) {
                    return path.join(gamePath, file);
                }
            }
        }
        const commonSubfolders = ['Binaries', 'Binaries/Win64', 'Bin', 'Bin/Win64', 'Game/Binaries/Win64'];
        for (const subfolder of commonSubfolders) {
            const subfolderPath = path.join(gamePath, subfolder);
            if (fs.existsSync(subfolderPath)) {
                const subFiles = fs.readdirSync(subfolderPath);
                for (const file of subFiles) {
                    if (file.toLowerCase().endsWith('.exe')) {
                        const fileNameLower = file.toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (fileNameLower.includes(gameNameLower) || gameNameLower.includes(fileNameLower) || file.toLowerCase().includes('game') || (!file.toLowerCase().includes('crash') && !file.toLowerCase().includes('setup') && !file.toLowerCase().includes('uninstall'))) {
                            return path.join(subfolderPath, file);
                        }
                    }
                }
            }
        }
        const validExe = rootFiles.find(file => file.toLowerCase().endsWith('.exe') && !file.toLowerCase().includes('crash') && !file.toLowerCase().includes('setup') && !file.toLowerCase().includes('uninstall') && !file.toLowerCase().includes('prerequisite'));
        return validExe ? path.join(gamePath, validExe) : null;
    } catch (error) {
        console.error('Erro ao procurar executável da Epic Games:', error);
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
        console.log('Buscando jogos locais em:', startZonePath);
        const files = fs.readdirSync(startZonePath);
        for (const file of files) {
            try {
                const filePath = path.join(startZonePath, file);
                const stats = fs.statSync(filePath);
                if (stats.isFile()) {
                    const fileExt = path.extname(file).toLowerCase();
                    if (fileExt === '.lnk') {
                        const shortcutInfo = await processShortcut(filePath, file);
                        if (shortcutInfo) localGames.push(shortcutInfo);
                    } else if (fileExt === '.exe') {
                        const exeInfo = await processExecutable(filePath, file);
                        if (exeInfo) localGames.push(exeInfo);
                    }
                } else if (stats.isDirectory()) {
                    const folderGames = await processGameFolder(filePath, file);
                    localGames.push(...folderGames);
                }
            } catch (fileError) {
                console.error(`Erro ao processar ${file}:`, fileError);
                continue;
            }
        }
        console.log(`Encontrados ${localGames.length} jogos locais na StartZone Games`);
        return localGames.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error('Erro ao buscar jogos locais:', error);
        return [];
    }
}

async function processShortcut(shortcutPath, fileName) {
    try {
        const gameName = path.basename(fileName, '.lnk');
        const shortcutTarget = await getShortcutTarget(shortcutPath);
        if (shortcutTarget && fs.existsSync(shortcutTarget)) {
            return {
                name: gameName, path: shortcutPath, targetPath: shortcutTarget,
                platform: 'Local Games', type: 'game', source: 'shortcut',
                size: await getFileSize(shortcutTarget).catch(() => 'N/A')
            };
        } else {
            console.log(`Atalho ${fileName} aponta para arquivo inexistente: ${shortcutTarget}`);
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
                source: 'executable', size: await getFileSize(exePath).catch(() => 'N/A')
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
                type: 'game', source: 'folder', size: await getDirectorySize(folderPath).catch(() => 'N/A')
            });
        } else if (executables.length > 1) {
            const mainExe = findMainExecutable(executables, folderName);
            if (mainExe) {
                games.push({
                    name: folderName, path: path.join(folderPath, mainExe), platform: 'Local Games',
                    type: 'game', source: 'folder', size: await getDirectorySize(folderPath).catch(() => 'N/A')
                });
            }
        }
        return games;
    } catch (error) {
        console.error(`Erro ao processar pasta ${folderName}:`, error);
        return [];
    }
}

async function getShortcutTarget(shortcutPath) {
    return new Promise((resolve) => {
        const cmd = `powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('${shortcutPath}'); $Shortcut.TargetPath"`;
        exec(cmd, { timeout: 5000 }, (error, stdout) => {
            if (error) {
                console.error('Erro ao ler atalho:', error);
                resolve(null);
            } else {
                resolve(stdout.trim() || null);
            }
        });
    });
}

function findMainExecutable(executables, folderName) {
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
    return executables[0];
}

async function getFileSize(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return `${Math.round(stats.size / 1024 / 1024 * 100) / 100}MB`;
    } catch (error) {
        return 'N/A';
    }
}

async function ensureStartZoneGamesFolder() {
    try {
        const startZonePath = path.join('C:', 'StartZone Games');
        if (!fs.existsSync(startZonePath)) {
            fs.mkdirSync(startZonePath, { recursive: true });
            console.log('Pasta StartZone Games criada em:', startZonePath);
            const readmePath = path.join(startZonePath, 'README.txt');
            const readmeContent = `StartZone Games - Pasta de Jogos Locais\n==========================================\n\nEsta pasta é utilizada pelo StartZone para organizar seus jogos locais.\n\nVocê pode colocar aqui:\n- Atalhos (.lnk) para seus jogos favoritos\n- Executáveis (.exe) de jogos portáteis\n- Pastas contendo jogos\n\nO StartZone irá detectar automaticamente todos os jogos colocados nesta pasta.\n\nCriado automaticamente pelo StartZone System Info\nData: ${new Date().toLocaleString('pt-BR')}`;
            fs.writeFileSync(readmePath, readmeContent, 'utf8');
        }
        return startZonePath;
    } catch (error) {
        console.error('Erro ao criar pasta StartZone Games:', error);
        return null;
    }
}

async function addGameToStartZone(gameName, gamePath) {
    try {
        const startZonePath = await ensureStartZoneGamesFolder();
        if (!startZonePath) return false;
        const shortcutName = `${gameName}.lnk`;
        const shortcutPath = path.join(startZonePath, shortcutName);
        const cmd = `powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('${shortcutPath}'); $Shortcut.TargetPath = '${gamePath}'; $Shortcut.Save()"`;
        return new Promise((resolve) => {
            exec(cmd, { timeout: 5000 }, (error) => {
                if (error) {
                    console.error('Erro ao criar atalho:', error);
                    resolve(false);
                } else {
                    console.log(`Atalho criado: ${shortcutPath}`);
                    resolve(true);
                }
            });
        });
    } catch (error) {
        console.error('Erro ao adicionar jogo à StartZone:', error);
        return false;
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
  testGameSearch
};