const si = require('systeminformation');
const { getDiskInfo } = require('node-disk-info');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let systemCache = {};
let lastUpdate = 0;
const CACHE_DURATION = 5000;

async function getAllSystemInfo() {
    const now = Date.now();
    if (now - lastUpdate < CACHE_DURATION && Object.keys(systemCache).length > 0) {
        return systemCache;
    }

    try {
        const [cpu, mem, graphics, disks, network, audio] = await Promise.all([
            getCPUInfo(),
            getMemoryInfo(),
            getGPUInfo(),
            getDiskInfoFormatted(),
            getNetworkInfo(),
            getAudioInfo()
        ]);

        systemCache = {
            cpu,
            memory: mem,
            gpu: graphics,
            storage: disks,
            network,
            audio,
            datetime: getCurrentDateTime(),
            timestamp: now
        };

        lastUpdate = now;
        return systemCache;
    } catch (error) {
        console.error('Erro ao coletar informações do sistema:', error);
        return getDefaultSystemInfo();
    }
}

function getDefaultSystemInfo() {
    return {
        cpu: { model: 'CPU não detectado', cores: 'N/A', speed: 'N/A', temperature: '--°C', usage: '--%' },
        memory: { total: '--GB', used: '--GB', available: '--GB', percentage: '--%' },
        gpu: { model: 'GPU não detectada', memory: '--GB', temperature: '--°C' },
        storage: [],
        network: { status: 'Desconhecido', type: 'N/A', ip: 'N/A' },
        audio: { device: 'Dispositivo padrão', volume: '--%' },
        datetime: getCurrentDateTime(),
        timestamp: Date.now()
    };
}

async function getCPUInfo() {
    try {
        const [cpuData, temp, load] = await Promise.all([
            si.cpu().catch(() => null),
            si.cpuTemperature().catch(() => null),
            si.currentLoad().catch(() => null)
        ]);
        return {
            model: cpuData?.brand || 'CPU Desconhecido',
            cores: cpuData?.cores || 'N/A',
            speed: cpuData?.speed ? `${cpuData.speed}GHz` : 'N/A',
            temperature: temp?.main ? `${Math.round(temp.main)}°C` : '--°C',
            usage: load?.currentLoad ? `${Math.round(load.currentLoad)}%` : '--%'
        };
    } catch (error) {
        console.error('Erro ao obter info do CPU:', error);
        return getDefaultSystemInfo().cpu;
    }
}

async function getGPUInfo() {
    try {
        const graphics = await si.graphics().catch(() => null);
        if (!graphics || !graphics.controllers || graphics.controllers.length === 0) {
            return getDefaultSystemInfo().gpu;
        }
        const mainGPU = graphics.controllers[0];
        return {
            model: mainGPU.model || 'GPU Desconhecida',
            memory: mainGPU.vram ? `${Math.round(mainGPU.vram / 1024)}GB` : '--GB',
            temperature: mainGPU.temperatureGpu ? `${Math.round(mainGPU.temperatureGpu)}°C` : '--°C'
        };
    } catch (error) {
        console.error('Erro ao obter info da GPU:', error);
        return getDefaultSystemInfo().gpu;
    }
}

async function getMemoryInfo() {
    try {
        const mem = await si.mem().catch(() => null);
        if (!mem) return getDefaultSystemInfo().memory;
        return {
            total: `${Math.round(mem.total / 1024 / 1024 / 1024)}GB`,
            used: `${Math.round(mem.used / 1024 / 1024 / 1024)}GB`,
            available: `${Math.round(mem.available / 1024 / 1024 / 1024)}GB`,
            percentage: `${Math.round((mem.used / mem.total) * 100)}%`
        };
    } catch (error) {
        console.error('Erro ao obter info da memória:', error);
        return getDefaultSystemInfo().memory;
    }
}

async function getDiskInfoFormatted() {
    try {
        const disks = await getDiskInfo().catch(() => []);
        if (!Array.isArray(disks) || disks.length === 0) return [];
        return disks
            .filter(disk => disk && disk.blocks > 0)
            .map(disk => ({
                drive: disk.mounted || 'Disco',
                label: disk.filesystem || `Disco ${disk.mounted}`,
                total: `${Math.round(disk.blocks / 1024 / 1024 / 1024)}GB`,
                used: `${Math.round(disk.used / 1024 / 1024 / 1024)}GB`,
                available: `${Math.round(disk.available / 1024 / 1024 / 1024)}GB`,
                percentage: `${Math.round((disk.used / disk.blocks) * 100)}%`,
                type: disk.filesystem || 'NTFS'
            }));
    } catch (error) {
        console.error('Erro ao obter info dos discos:', error);
        return [];
    }
}

async function getNetworkInfo() {
    try {
        const interfaces = await si.networkInterfaces().catch(() => []);
        if (!Array.isArray(interfaces) || interfaces.length === 0) {
            return { status: 'Sem rede', type: 'Nenhuma', ip: 'N/A' };
        }
        const activeInterface = interfaces.find(iface =>
            iface && iface.operstate === 'up' && !iface.internal && iface.ip4
        );
        if (!activeInterface) {
            return { status: 'Desconectado', type: 'Nenhuma', ip: 'N/A' };
        }
        let connectionType = 'Ethernet';
        if (activeInterface.type === 'wireless' || activeInterface.iface?.toLowerCase().includes('wifi')) {
            connectionType = 'Wi-Fi';
        }
        return {
            status: 'Conectado',
            type: connectionType,
            ip: activeInterface.ip4 || 'N/A',
            interface: activeInterface.iface
        };
    } catch (error) {
        console.error('Erro ao obter info de rede:', error);
        return getDefaultSystemInfo().network;
    }
}

async function getAudioInfo() {
    try {
        let volume = '--%';
        if (process.platform === 'win32') {
            volume = await getWindowsVolume().catch(() => '--%');
        }
        return { device: 'Dispositivo de áudio padrão', volume };
    } catch (error) {
        console.error('Erro ao obter info de áudio:', error);
        return getDefaultSystemInfo().audio;
    }
}

function getWindowsVolume() {
    return new Promise((resolve) => {
        const cmd = 'powershell -Command "(Get-AudioDevice -PlaybackVolume).Volume"';
        exec(cmd, { timeout: 3000 }, (error, stdout) => {
            if (error) return resolve('--%');
            const volume = parseInt(stdout.trim());
            resolve(!isNaN(volume) && volume >= 0 && volume <= 100 ? `${volume}%` : '--%');
        });
    });
}

function getCurrentDateTime() {
    const now = new Date();
    return {
        date: now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        dayOfWeek: now.toLocaleDateString('pt-BR', { weekday: 'long' })
    };
}

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


// Função auxiliar para estatísticas (se não existir)
function getGameStatistics(games) {
  const stats = {};
  
  games.forEach(game => {
      let platform = 'other';
      
      if (game.path) {
          const path = game.path.toLowerCase();
          if (path.includes('steam')) {
              platform = 'steam';
          } else if (path.includes('epic') || path.includes('epicgames')) {
              platform = 'epic';
          }
      }
      
      stats[platform] = (stats[platform] || 0) + 1;
  });
  
  return stats;
}

// Função auxiliar para remover duplicatas (se não existir)
function removeDuplicateGamesByName(games) {
  const seen = new Set();
  const unique = [];
  
  games.forEach(game => {
      if (game && game.name) {
          const normalizedName = game.name.toLowerCase().trim();
          if (!seen.has(normalizedName)) {
              seen.add(normalizedName);
              unique.push(game);
          }
      }
  });
  
  return unique;
}

// Função de teste para debug
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

// Remove jogos duplicados baseado no nome
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
          // Se encontrou duplicata, mantém a que tem mais informações ou é de plataforma preferida
          const existingIndex = uniqueGames.findIndex(g => 
              g.name.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ') === normalizedName
          );
          
          if (existingIndex !== -1) {
              const existing = uniqueGames[existingIndex];
              
              // Prioridade: Steam > Epic Games > Local Games
              const platformPriority = {
                  'Steam': 3,
                  'Epic Games': 2,
                  'Local Games': 1
              };
              
              const currentPriority = platformPriority[game.platform] || 0;
              const existingPriority = platformPriority[existing.platform] || 0;
              
              // Substitui se a nova entrada tem prioridade maior
              if (currentPriority > existingPriority) {
                  uniqueGames[existingIndex] = game;
              }
          }
      }
  }
  
  return uniqueGames;
}

// Gera estatísticas dos jogos por plataforma
function getGameStatistics(games) {
  const stats = {};
  
  for (const game of games) {
      const platform = game.platform || 'Unknown';
      stats[platform] = (stats[platform] || 0) + 1;
  }
  
  return stats;
}

// Filtra jogos por plataforma específica
function getGamesByPlatform(games, platform) {
  return games.filter(game => 
      game.platform && game.platform.toLowerCase() === platform.toLowerCase()
  );
}

// Busca jogos por nome (busca parcial)
function searchGamesByName(games, searchTerm) {
  if (!searchTerm || searchTerm.trim().length === 0) {
      return games;
  }
  
  const term = searchTerm.toLowerCase().trim();
  return games.filter(game => 
      game.name && game.name.toLowerCase().includes(term)
  );
}

// Obtém informações resumidas dos jogos
function getGamesSummary(games) {
  const summary = {
      total: games.length,
      platforms: getGameStatistics(games),
      totalSize: '0GB',
      avgSize: '0MB'
  };
  
  // Calcula tamanho total (aproximado, pois nem todos têm tamanho)
  let totalSizeBytes = 0;
  let gamesWithSize = 0;
  
  for (const game of games) {
      if (game.size && game.size !== 'N/A') {
          const sizeMatch = game.size.match(/(\d+(?:\.\d+)?)(MB|GB)/);
          if (sizeMatch) {
              let bytes = parseFloat(sizeMatch[1]);
              if (sizeMatch[2] === 'GB') {
                  bytes *= 1024 * 1024 * 1024;
              } else {
                  bytes *= 1024 * 1024;
              }
              totalSizeBytes += bytes;
              gamesWithSize++;
          }
      }
  }
  
  if (totalSizeBytes > 0) {
      const totalGB = Math.round(totalSizeBytes / 1024 / 1024 / 1024 * 100) / 100;
      summary.totalSize = `${totalGB}GB`;
      
      if (gamesWithSize > 0) {
          const avgMB = Math.round((totalSizeBytes / gamesWithSize) / 1024 / 1024);
          summary.avgSize = `${avgMB}MB`;
      }
  }
  
  return summary;
}

// Função para executar um jogo
async function launchGame(game) {
  return new Promise((resolve, reject) => {
      if (!game || !game.path) {
          reject(new Error('Caminho do jogo não encontrado'));
          return;
      }
      
      // Para atalhos, usa o caminho do atalho diretamente
      // Para executáveis, usa o executável
      const pathToLaunch = game.path;
      
      console.log(`Iniciando jogo: ${game.name}`);
      console.log(`Caminho: ${pathToLaunch}`);
      
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

// Exporta as funções auxiliares também
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
  addGameToStartZone
};

async function getSteamGames() {
  try {
      const steamGames = [];
      
      // Possíveis caminhos da Steam
      const steamPaths = [
          path.join(os.homedir(), 'AppData', 'Local', 'Steam'),
          path.join('C:', 'Program Files (x86)', 'Steam'),
          path.join('C:', 'Program Files', 'Steam'),
          path.join('D:', 'Steam'),
          path.join('E:', 'Steam')
      ];

      let steamPath = null;
      
      // Encontra o caminho da Steam
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

      // Caminho para steamapps
      const steamappsPath = path.join(steamPath, 'steamapps');
      if (!fs.existsSync(steamappsPath)) {
          console.log('Pasta steamapps não encontrada');
          return [];
      }

      // Lê arquivos .acf (App Cache Files) que contêm info dos jogos
      const acfFiles = fs.readdirSync(steamappsPath)
          .filter(file => file.startsWith('appmanifest_') && file.endsWith('.acf'));

      for (const acfFile of acfFiles) {
          try {
              const acfPath = path.join(steamappsPath, acfFile);
              const acfContent = fs.readFileSync(acfPath, 'utf8');
              
              // Parse básico do formato ACF da Steam
              const gameInfo = parseSteamACF(acfContent);
              
              if (gameInfo && gameInfo.name && gameInfo.installdir) {
                  // Verifica se o jogo está realmente instalado
                  const gamePath = path.join(steamappsPath, 'common', gameInfo.installdir);
                  
                  if (fs.existsSync(gamePath)) {
                      // Procura pelo executável principal
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

      // Também verifica bibliotecas adicionais da Steam
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

// Função auxiliar para fazer parse dos arquivos ACF da Steam
function parseSteamACF(content) {
  try {
      const lines = content.split('\n');
      const gameInfo = {};
      
      for (const line of lines) {
          const trimmed = line.trim();
          
          // Extrai informações básicas
          if (trimmed.includes('"appid"')) {
              gameInfo.appid = extractValue(trimmed);
          } else if (trimmed.includes('"name"')) {
              gameInfo.name = extractValue(trimmed);
          } else if (trimmed.includes('"installdir"')) {
              gameInfo.installdir = extractValue(trimmed);
          }
      }
      
      return gameInfo;
  } catch (error) {
      console.error('Erro ao fazer parse do ACF:', error);
      return null;
  }
}

// Extrai valor entre aspas
function extractValue(line) {
  const matches = line.match(/"([^"]+)"\s+"([^"]+)"/);
  return matches ? matches[2] : null;
}

// Procura executável do jogo na pasta
function findGameExecutable(gamePath, gameName) {
  try {
      const files = fs.readdirSync(gamePath);
      
      // Prioriza executáveis com nome similar ao jogo
      const gameNameLower = gameName.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      for (const file of files) {
          if (file.toLowerCase().endsWith('.exe')) {
              const fileNameLower = file.toLowerCase().replace(/[^a-z0-9]/g, '');
              
              // Se o nome do arquivo é similar ao nome do jogo
              if (fileNameLower.includes(gameNameLower) || 
                  gameNameLower.includes(fileNameLower)) {
                  return path.join(gamePath, file);
              }
          }
      }
      
      // Se não encontrou, pega o primeiro .exe
      const exeFile = files.find(file => file.toLowerCase().endsWith('.exe'));
      return exeFile ? path.join(gamePath, exeFile) : null;
      
  } catch (error) {
      console.error('Erro ao procurar executável do jogo:', error);
      return null;
  }
}

// Calcula tamanho da pasta do jogo
async function getDirectorySize(dirPath) {
  return new Promise((resolve) => {
      if (process.platform === 'win32') {
          // Usa PowerShell para calcular tamanho no Windows
          const cmd = `powershell -Command "(Get-ChildItem -Path '${dirPath}' -Recurse | Measure-Object -Property Length -Sum).Sum"`;
          
          exec(cmd, { timeout: 10000 }, (error, stdout) => {
              if (error) {
                  resolve('N/A');
                  return;
              }
              
              const bytes = parseInt(stdout.trim());
              if (!isNaN(bytes)) {
                  const gb = Math.round(bytes / 1024 / 1024 / 1024 * 100) / 100;
                  resolve(`${gb}GB`);
              } else {
                  resolve('N/A');
              }
          });
      } else {
          resolve('N/A');
      }
  });
}

// Busca jogos em bibliotecas adicionais da Steam
async function getGamesFromAdditionalLibraries(libraryFoldersPath) {
  try {
      const content = fs.readFileSync(libraryFoldersPath, 'utf8');
      const additionalGames = [];
      
      // Parse básico do arquivo libraryfolders.vdf
      const lines = content.split('\n');
      const libraryPaths = [];
      
      for (const line of lines) {
          if (line.includes('"path"')) {
              const path = extractValue(line);
              if (path && fs.existsSync(path)) {
                  libraryPaths.push(path);
              }
          }
      }
      
      // Procura jogos em cada biblioteca adicional
      for (const libPath of libraryPaths) {
          const steamappsPath = path.join(libPath, 'steamapps');
          if (fs.existsSync(steamappsPath)) {
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
                              
                              additionalGames.push({
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
      
      // Caminhos onde a Epic Games Store armazena dados
      const epicPaths = [
          path.join(os.homedir(), 'AppData', 'Local', 'EpicGamesLauncher', 'Saved', 'Config', 'Windows'),
          path.join('C:', 'ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'),
          path.join('C:', 'ProgramData', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat')
      ];

      // Primeiro tenta ler o arquivo LauncherInstalled.dat
      const launcherInstalledPath = path.join('C:', 'ProgramData', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat');
      
      if (fs.existsSync(launcherInstalledPath)) {
          const launcherGames = await readLauncherInstalledFile(launcherInstalledPath);
          epicGames.push(...launcherGames);
      }

      // Também verifica manifests individuais
      const manifestsPath = path.join('C:', 'ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
      
      if (fs.existsSync(manifestsPath)) {
          const manifestGames = await readEpicManifests(manifestsPath);
          epicGames.push(...manifestGames);
      }

      // Remove duplicatas baseado no nome
      const uniqueGames = removeDuplicateGames(epicGames);

      console.log(`Encontrados ${uniqueGames.length} jogos da Epic Games`);
      return uniqueGames;

  } catch (error) {
      console.error('Erro ao buscar jogos da Epic Games:', error);
      return [];
  }
}

// Lê o arquivo LauncherInstalled.dat da Epic
async function readLauncherInstalledFile(filePath) {
  try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      const games = [];

      if (data.InstallationList && Array.isArray(data.InstallationList)) {
          for (const item of data.InstallationList) {
              try {
                  // Filtra apenas jogos (não ferramentas como Unreal Engine)
                  if (item.AppName && item.InstallLocation && 
                      !item.AppName.includes('UE_') && // Unreal Engine
                      !item.AppName.includes('UnrealEngine') &&
                      item.InstallLocation !== '') {
                      
                      // Verifica se o diretório ainda existe
                      if (fs.existsSync(item.InstallLocation)) {
                          const gameExe = await findEpicGameExecutable(item.InstallLocation, item.DisplayName || item.AppName);
                          
                          games.push({
                              name: item.DisplayName || item.AppName,
                              path: gameExe || item.InstallLocation,
                              appName: item.AppName,
                              installLocation: item.InstallLocation,
                              platform: 'Epic Games',
                              type: 'game',
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

// Lê manifests individuais da Epic Games
async function readEpicManifests(manifestsPath) {
  try {
      const games = [];
      const manifestFiles = fs.readdirSync(manifestsPath)
          .filter(file => file.endsWith('.item'));

      for (const manifestFile of manifestFiles) {
          try {
              const manifestPath = path.join(manifestsPath, manifestFile);
              const content = fs.readFileSync(manifestPath, 'utf8');
              const manifest = JSON.parse(content);

              if (manifest.DisplayName && manifest.InstallLocation && 
                  manifest.InstallLocation !== '' &&
                  !manifest.AppName?.includes('UE_') &&
                  !manifest.AppName?.includes('UnrealEngine')) {
                  
                  // Verifica se o diretório existe
                  if (fs.existsSync(manifest.InstallLocation)) {
                      const gameExe = await findEpicGameExecutable(manifest.InstallLocation, manifest.DisplayName);
                      
                      games.push({
                          name: manifest.DisplayName,
                          path: gameExe || manifest.InstallLocation,
                          appName: manifest.AppName || manifest.CatalogItemId,
                          installLocation: manifest.InstallLocation,
                          platform: 'Epic Games',
                          type: 'game',
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

// Procura executável de jogo da Epic Games
async function findEpicGameExecutable(gamePath, gameName) {
  try {
      // Verifica se há um arquivo .exe na raiz
      const rootFiles = fs.readdirSync(gamePath);
      
      // Prioriza executáveis com nome similar ao jogo
      const gameNameLower = gameName.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Primeiro procura na raiz
      for (const file of rootFiles) {
          if (file.toLowerCase().endsWith('.exe')) {
              const fileNameLower = file.toLowerCase().replace(/[^a-z0-9]/g, '');
              
              if (fileNameLower.includes(gameNameLower) || 
                  gameNameLower.includes(fileNameLower) ||
                  file.toLowerCase().includes('game') ||
                  file.toLowerCase().includes(gameName.toLowerCase().split(' ')[0])) {
                  return path.join(gamePath, file);
              }
          }
      }

      // Se não encontrou na raiz, procura em subpastas comuns
      const commonSubfolders = ['Binaries', 'Binaries/Win64', 'Bin', 'Bin/Win64', 'Game/Binaries/Win64'];
      
      for (const subfolder of commonSubfolders) {
          const subfolderPath = path.join(gamePath, subfolder);
          
          if (fs.existsSync(subfolderPath)) {
              const subFiles = fs.readdirSync(subfolderPath);
              
              for (const file of subFiles) {
                  if (file.toLowerCase().endsWith('.exe')) {
                      const fileNameLower = file.toLowerCase().replace(/[^a-z0-9]/g, '');
                      
                      if (fileNameLower.includes(gameNameLower) || 
                          gameNameLower.includes(fileNameLower) ||
                          file.toLowerCase().includes('game') ||
                          !file.toLowerCase().includes('crash') &&
                          !file.toLowerCase().includes('setup') &&
                          !file.toLowerCase().includes('uninstall')) {
                          return path.join(subfolderPath, file);
                      }
                  }
              }
          }
      }

      // Se ainda não encontrou, pega o primeiro .exe válido da raiz
      const validExe = rootFiles.find(file => 
          file.toLowerCase().endsWith('.exe') &&
          !file.toLowerCase().includes('crash') &&
          !file.toLowerCase().includes('setup') &&
          !file.toLowerCase().includes('uninstall') &&
          !file.toLowerCase().includes('prerequisite')
      );
      
      return validExe ? path.join(gamePath, validExe) : null;
      
  } catch (error) {
      console.error('Erro ao procurar executável da Epic Games:', error);
      return null;
  }
}

// Remove jogos duplicados
function removeDuplicateGames(games) {
  const seen = new Set();
  return games.filter(game => {
      const key = game.name.toLowerCase().trim();
      if (seen.has(key)) {
          return false;
      }
      seen.add(key);
      return true;
  });
}

// Função auxiliar para buscar jogos em registro (alternativa)
async function getEpicGamesFromRegistry() {
  return new Promise((resolve) => {
      if (process.platform !== 'win32') {
          resolve([]);
          return;
      }

      const cmd = `powershell -Command "Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Epic Games\\*' -ErrorAction SilentlyContinue | Where-Object { $_.InstallLocation -ne $null } | Select-Object PSChildName, InstallLocation | ConvertTo-Json -Compress"`;

      exec(cmd, { timeout: 10000 }, (error, stdout) => {
          if (error) {
              resolve([]);
              return;
          }

          try {
              const games = [];
              if (stdout.trim()) {
                  const registryEntries = JSON.parse(stdout);
                  const entries = Array.isArray(registryEntries) ? registryEntries : [registryEntries];

                  for (const entry of entries) {
                      if (entry.InstallLocation && fs.existsSync(entry.InstallLocation)) {
                          games.push({
                              name: entry.PSChildName || 'Unknown Epic Game',
                              path: entry.InstallLocation,
                              platform: 'Epic Games',
                              type: 'game',
                              source: 'registry'
                          });
                      }
                  }
              }
              resolve(games);
          } catch (parseError) {
              console.error('Erro ao parsear registro da Epic:', parseError);
              resolve([]);
          }
      });
  });
}

async function getLocalGames() {
  try {
      const localGames = [];
      const startZonePath = path.join('C:', 'StartZone Games');
      
      // Verifica se a pasta StartZone Games existe
      if (!fs.existsSync(startZonePath)) {
          console.log('Pasta StartZone Games não encontrada em C:\\StartZone Games');
          return [];
      }

      console.log('Buscando jogos locais em:', startZonePath);
      
      // Lê todos os arquivos da pasta
      const files = fs.readdirSync(startZonePath);
      
      for (const file of files) {
          try {
              const filePath = path.join(startZonePath, file);
              const stats = fs.statSync(filePath);
              
              // Verifica se é um arquivo (não pasta)
              if (stats.isFile()) {
                  const fileExt = path.extname(file).toLowerCase();
                  
                  // Processa atalhos (.lnk)
                  if (fileExt === '.lnk') {
                      const shortcutInfo = await processShortcut(filePath, file);
                      if (shortcutInfo) {
                          localGames.push(shortcutInfo);
                      }
                  }
                  // Processa executáveis (.exe)
                  else if (fileExt === '.exe') {
                      const exeInfo = await processExecutable(filePath, file);
                      if (exeInfo) {
                          localGames.push(exeInfo);
                      }
                  }
              }
              // Se for uma pasta, verifica se há executáveis dentro
              else if (stats.isDirectory()) {
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

// Processa atalhos (.lnk)
async function processShortcut(shortcutPath, fileName) {
  try {
      // Remove extensão .lnk do nome
      const gameName = path.basename(fileName, '.lnk');
      
      // Usa PowerShell para ler informações do atalho
      const shortcutTarget = await getShortcutTarget(shortcutPath);
      
      if (shortcutTarget && fs.existsSync(shortcutTarget)) {
          return {
              name: gameName,
              path: shortcutPath, // Usa o atalho como caminho principal
              targetPath: shortcutTarget, // Caminho real do executável  
              platform: 'Local Games',
              type: 'game',
              source: 'shortcut',
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

// Processa executáveis (.exe)
async function processExecutable(exePath, fileName) {
  try {
      // Remove extensão .exe do nome
      const gameName = path.basename(fileName, '.exe');
      
      // Verifica se o arquivo existe e é executável
      if (fs.existsSync(exePath)) {
          return {
              name: gameName,
              path: exePath,
              platform: 'Local Games',
              type: 'game',
              source: 'executable',
              size: await getFileSize(exePath).catch(() => 'N/A')
          };
      }
      
      return null;
      
  } catch (error) {
      console.error(`Erro ao processar executável ${fileName}:`, error);
      return null;
  }
}

// Processa pastas que podem conter jogos
async function processGameFolder(folderPath, folderName) {
  try {
      const games = [];
      const files = fs.readdirSync(folderPath);
      
      // Procura por executáveis na pasta
      const executables = files.filter(file => 
          file.toLowerCase().endsWith('.exe') &&
          !file.toLowerCase().includes('uninstall') &&
          !file.toLowerCase().includes('setup') &&
          !file.toLowerCase().includes('installer')
      );
      
      // Se encontrou apenas um executável, provavelmente é o jogo principal
      if (executables.length === 1) {
          const exePath = path.join(folderPath, executables[0]);
          games.push({
              name: folderName,
              path: exePath,
              platform: 'Local Games',
              type: 'game',
              source: 'folder',
              size: await getDirectorySize(folderPath).catch(() => 'N/A')
          });
      }
      // Se há múltiplos executáveis, tenta identificar o principal
      else if (executables.length > 1) {
          const mainExe = findMainExecutable(executables, folderName);
          if (mainExe) {
              const exePath = path.join(folderPath, mainExe);
              games.push({
                  name: folderName,
                  path: exePath,
                  platform: 'Local Games',
                  type: 'game',
                  source: 'folder',
                  size: await getDirectorySize(folderPath).catch(() => 'N/A')
              });
          }
      }
      
      return games;
      
  } catch (error) {
      console.error(`Erro ao processar pasta ${folderName}:`, error);
      return [];
  }
}

// Obtém o destino de um atalho usando PowerShell
async function getShortcutTarget(shortcutPath) {
  return new Promise((resolve) => {
      const cmd = `powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('${shortcutPath}'); $Shortcut.TargetPath"`;
      
      exec(cmd, { timeout: 5000 }, (error, stdout) => {
          if (error) {
              console.error('Erro ao ler atalho:', error);
              resolve(null);
              return;
          }
          
          const targetPath = stdout.trim();
          resolve(targetPath || null);
      });
  });
}

// Identifica o executável principal entre vários
function findMainExecutable(executables, folderName) {
  const folderNameLower = folderName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Primeiro, procura executável com nome similar à pasta
  for (const exe of executables) {
      const exeNameLower = exe.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (exeNameLower.includes(folderNameLower) || folderNameLower.includes(exeNameLower)) {
          return exe;
      }
  }
  
  // Procura por nomes comuns de jogos
  const gameKeywords = ['game', 'play', 'start', 'launch', 'main'];
  for (const keyword of gameKeywords) {
      const found = executables.find(exe => 
          exe.toLowerCase().includes(keyword)
      );
      if (found) return found;
  }
  
  // Se não encontrou, retorna o primeiro executável
  return executables[0];
}

// Obtém tamanho de um arquivo
async function getFileSize(filePath) {
  try {
      const stats = fs.statSync(filePath);
      const sizeInMB = Math.round(stats.size / 1024 / 1024 * 100) / 100;
      return `${sizeInMB}MB`;
  } catch (error) {
      return 'N/A';
  }
}

// Cria a pasta StartZone Games se não existir
async function ensureStartZoneGamesFolder() {
  try {
      const startZonePath = path.join('C:', 'StartZone Games');
      
      if (!fs.existsSync(startZonePath)) {
          fs.mkdirSync(startZonePath, { recursive: true });
          console.log('Pasta StartZone Games criada em:', startZonePath);
          
          // Cria um arquivo README explicativo
          const readmePath = path.join(startZonePath, 'README.txt');
          const readmeContent = `StartZone Games - Pasta de Jogos Locais
==========================================

Esta pasta é utilizada pelo StartZone para organizar seus jogos locais.

Você pode colocar aqui:
- Atalhos (.lnk) para seus jogos favoritos
- Executáveis (.exe) de jogos portáteis
- Pastas contendo jogos

O StartZone irá detectar automaticamente todos os jogos colocados nesta pasta.

Criado automaticamente pelo StartZone System Info
Data: ${new Date().toLocaleString('pt-BR')}`;
          
          fs.writeFileSync(readmePath, readmeContent, 'utf8');
      }
      
      return startZonePath;
  } catch (error) {
      console.error('Erro ao criar pasta StartZone Games:', error);
      return null;
  }
}

// Adiciona um jogo à pasta StartZone Games (função auxiliar)
async function addGameToStartZone(gameName, gamePath) {
  try {
      const startZonePath = await ensureStartZoneGamesFolder();
      if (!startZonePath) return false;
      
      const shortcutName = `${gameName}.lnk`;
      const shortcutPath = path.join(startZonePath, shortcutName);
      
      // Cria atalho usando PowerShell
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

function findExecutableInFolder(folderPath) {
    if (!folderPath || !fs.existsSync(folderPath)) return null;
    const files = fs.readdirSync(folderPath);
    const exeFile = files.find(file => file.toLowerCase().endsWith('.exe'));
    return exeFile ? path.join(folderPath, exeFile) : null;
}

async function getInstalledPrograms() {
    const programs = [];
    try {
        if (process.platform === 'win32') {
            const winPrograms = await getWindowsPrograms().catch(() => []);
            programs.push(...winPrograms);
        }
        return programs.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error('Erro ao obter programas:', error);
        return [];
    }
}

async function getWindowsPrograms() {
  return new Promise((resolve) => {
    const cmd = `powershell -Command "Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Where-Object { $_.DisplayName -ne $null } | Select-Object DisplayName, InstallLocation, Publisher, DisplayVersion, InstallDate, EstimatedSize | ConvertTo-Json -Compress"`;

    exec(cmd, { timeout: 20000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Erro ao obter programas:', error);
        resolve([]);
        return;
      }

      try {
        let programs = [];
        if (stdout.trim()) {
          programs = JSON.parse(stdout);
        }

        
if (stdout.trim()) {
    programs = JSON.parse(stdout);
    // Aqui você imprime todos os nomes dos programas encontrados
    console.log('Lista de programas encontrados (antes da filtragem):');
    if (Array.isArray(programs)) {
      programs.forEach(p => console.log(p.DisplayName));
    } else {
      console.log(programs.DisplayName); // Caso seja um único objeto
    }
  }
  

        const blacklist = [
          '.net', 'redistributable', 'update', 'driver', 'security',
          'visual c++', 'microsoft edge webview', 'hotfix', 'framework',
          'assistant', 'support', 'tool', 'runtime', 'package',
          'help viewer', 'helper', 'nativepush'
        ];

        const formatted = programs
          .filter(p => {
            const name = (p.DisplayName ?? '').toLowerCase();
            const installPath = p.InstallLocation ?? '';
            const exePath = findExecutableInFolder(installPath);
            return (
              name &&
              exePath &&
              !blacklist.some(term => name.includes(term))
            );
          })
          .map(p => {
            const installPath = p.InstallLocation ?? '';
            const exePath = findExecutableInFolder(installPath);
            
            // Limpeza mais robusta do nome do programa
            let cleanName = p.DisplayName ?? 'Unknown';
            
            // Remove variações de "program" (case insensitive)
            cleanName = cleanName
                .replace(/\bprogram\b/gi, '')           // Remove "program" como palavra completa
                .replace(/\bprograma\b/gi, '')          // Remove "programa" em português
                .replace(/\bapplication\b/gi, '')       // Remove "application"
                .replace(/\bapp\b/gi, '')               // Remove "app"
                .replace(/\bsoftware\b/gi, '')          // Remove "software"
                .replace(/\btool\b/gi, '')              // Remove "tool"
                .replace(/\butility\b/gi, '')           // Remove "utility"
                .replace(/\s+/g, ' ')                   // Remove espaços extras
                .trim();                                // Remove espaços no início e fim
            
            // Se o nome ficou vazio após a limpeza, usa o nome original
            if (!cleanName || cleanName.length < 2) {
                cleanName = p.DisplayName ?? 'Unknown';
            }
            
            return {
                name: cleanName,
                path: exePath ?? installPath,
                publisher: p.Publisher ?? 'Unknown',
                version: p.DisplayVersion ?? 'N/A',
                installDate: p.InstallDate ?? 'N/A',
                size: p.EstimatedSize ? `${Math.round(p.EstimatedSize / 1024)}MB` : 'N/A',
                type: 'program'
            };
        });

        resolve(formatted);
      } catch (parseError) {
        console.error('Erro ao parsear programas:', parseError);
        resolve([]);
      }
    });
  });
}




function findExecutableInFolder(folderPath) {
    if (!folderPath || !fs.existsSync(folderPath)) return null;

    try {
        const files = fs.readdirSync(folderPath);
        const exeFile = files.find(file => file.toLowerCase().endsWith('.exe'));
        return exeFile ? path.join(folderPath, exeFile) : null;
    } catch (err) {
        console.error('Erro ao procurar executável na pasta:', err);
        return null;
    }
}

module.exports = {
    getAllSystemInfo,
    getCPUInfo,
    getGPUInfo,
    getMemoryInfo,
    getDiskInfoFormatted,
    getNetworkInfo,
    getAudioInfo,
    getCurrentDateTime,
    getInstalledGames,
    getInstalledPrograms
};
