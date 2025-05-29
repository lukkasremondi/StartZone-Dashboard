const { app, BrowserWindow, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, execFile } = require('child_process');

// AJUSTE: Importar os novos módulos separados
const systemInfo = require('./system-info');
const gamesInfo = require('./games-info.js');
const programsInfo = require('./programs-info.js');

let mainWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    frame: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../../assets/icons/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow.setFullScreen(true);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// IPC Handlers para informações do sistema
ipcMain.handle('get-system-info', async () => {
  try {
    // Nenhuma alteração aqui, a função continua em system-info
    const info = await systemInfo.getAllSystemInfo();
    console.log('Informações do sistema obtidas com sucesso');
    return info;
  } catch (error) {
    console.error('Erro ao obter informações do sistema:', error);
    return systemInfo.getDefaultSystemInfo();
  }
});

// IPC Handlers para programas
ipcMain.handle('launch-program', async (event, programPath) => {
  if (!programPath) {
    console.error('Caminho do programa não fornecido');
    return false;
  }

  try {
    execFile(programPath, [], { shell: true }, (error) => {
      if (error) {
        console.error('Erro ao executar programa:', error);
        exec(`start "" "${programPath}"`, (error) => {
          if (error) console.error('Erro no método alternativo:', error);
        });
      }
    });
    return true;
  } catch (error) {
    console.error('Erro ao executar programa:', error);
    return false;
  }
});

ipcMain.handle('get-installed-programs', async () => {
  try {
    console.log('Obtendo programas instalados...');
    // AJUSTE: Chamar a função do módulo 'programs-info'
    const programs = await programsInfo.getInstalledPrograms();
    console.log(`Total de programas encontrados: ${programs.length}`);
    
    const filteredPrograms = programs.filter(program => 
      program && program.name && program.name.trim() !== ''
    );
    
    console.log(`Programas após filtro: ${filteredPrograms.length}`);
    return filteredPrograms;
  } catch (error) {
    console.error('Erro ao obter programas:', error);
    return [];
  }
});

// IPC Handlers para jogos
ipcMain.handle('get-installed-games', async () => {
  try {
    // AJUSTE: Chamar a função do módulo 'games-info'
    const games = await gamesInfo.getInstalledGames();
    console.log(`Jogos encontrados: ${games.length}`);
    return games;
  } catch (error) {
    console.error('Erro ao obter jogos:', error);
    return [];
  }
});

ipcMain.handle('launch-game', async (event, gamePath) => {
  try {
    if (!gamePath) {
      throw new Error('Caminho do jogo não fornecido');
    }

    console.log(`Iniciando jogo: ${gamePath}`);
    // AJUSTE: Chamar a função do módulo 'games-info'
    const result = await gamesInfo.launchGame({ path: gamePath });
    return { success: true, message: 'Jogo iniciado com sucesso', result };
  } catch (error) {
    console.error('Erro ao iniciar jogo:', error);
    return { success: false, message: error.message || 'Falha ao iniciar jogo' };
  }
});

ipcMain.handle('get-games-summary', async () => {
  try {
    // AJUSTE: Chamar as funções do módulo 'games-info'
    const games = await gamesInfo.getInstalledGames();
    const summary = gamesInfo.getGamesSummary(games);
    return summary;
  } catch (error) {
    console.error('Erro ao obter resumo de jogos:', error);
    return {
      total: 0,
      platforms: {},
      totalSize: '0GB',
      avgSize: '0MB'
    };
  }
});

ipcMain.handle('search-games', async (event, searchTerm) => {
  try {
    // AJUSTE: Chamar as funções do módulo 'games-info'
    const games = await gamesInfo.getInstalledGames();
    const filteredGames = gamesInfo.searchGamesByName(games, searchTerm);
    return filteredGames;
  } catch (error) {
    console.error('Erro ao buscar jogos:', error);
    return [];
  }
});

ipcMain.handle('get-games-by-platform', async (event, platform) => {
  try {
    // AJUSTE: Chamar as funções do módulo 'games-info'
    const games = await gamesInfo.getInstalledGames();
    const platformGames = gamesInfo.getGamesByPlatform(games, platform);
    return platformGames;
  } catch (error) {
    console.error('Erro ao filtrar jogos por plataforma:', error);
    return [];
  }
});

ipcMain.handle('add-game-to-startzone', async (event, { name, path: gamePath }) => {
  try {
    // AJUSTE: Chamar a função do módulo 'games-info'
    const success = await gamesInfo.addGameToStartZone(name, gamePath);
    return { success, message: success ? 'Jogo adicionado à StartZone' : 'Falha ao adicionar jogo' };
  } catch (error) {
    console.error('Erro ao adicionar jogo à StartZone:', error);
    return { success: false, message: error.message || 'Erro ao adicionar jogo' };
  }
});

ipcMain.handle('ensure-startzone-folder', async () => {
  try {
    // AJUSTE: Chamar a função do módulo 'games-info'
    const folderPath = await gamesInfo.ensureStartZoneGamesFolder();
    return { success: !!folderPath, path: folderPath };
  } catch (error) {
    console.error('Erro ao verificar pasta StartZone:', error);
    return { success: false, path: null };
  }
});

// Handlers de energia
ipcMain.handle('shutdown-computer', async () => {
  try {
    if (process.platform === 'win32') {
      exec('shutdown /s /t 0');
    }
    return true;
  } catch (error) {
    console.error('Erro ao desligar computador:', error);
    return false;
  }
});

ipcMain.handle('restart-computer', async () => {
  try {
    if (process.platform === 'win32') {
      exec('shutdown /r /t 0');
    }
    return true;
  } catch (error) {
    console.error('Erro ao reiniciar computador:', error);
    return false;
  }
});

// Handlers de aplicação
ipcMain.handle('exit-startzone', () => {
  app.quit();
});

ipcMain.handle('minimize-startzone', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(false);
    mainWindow.minimize();
  }
});

// Função para extrair ícones
function extractIcon(exePath, size = 32) {
  return new Promise((resolve) => {
    if (!exePath || !fs.existsSync(exePath)) {
      return resolve(null);
    }

    const tempIconPath = path.join(os.tmpdir(), `temp_icon_${Date.now()}.ico`);
    const cmd = `powershell -Command "$src='${exePath}'; $dst='${tempIconPath}'; Add-Type -AssemblyName System.Drawing; [System.Drawing.Icon]::ExtractAssociatedIcon($src).ToBitmap().Save($dst)"`;

    exec(cmd, { timeout: 5000 }, (error) => {
      if (error) {
        console.error('Erro ao extrair ícone:', error);
        return resolve(null);
      }

      try {
        if (fs.existsSync(tempIconPath)) {
          const icon = nativeImage.createFromPath(tempIconPath);
          fs.unlinkSync(tempIconPath); // Remove o arquivo temporário
          resolve(icon.resize({ width: size, height: size }));
        } else {
          resolve(null);
        }
      } catch (err) {
        console.error('Erro ao processar ícone:', err);
        resolve(null);
      }
    });
  });
}

ipcMain.handle('get-program-icon', async (event, exePath) => {
  try {
    if (!exePath) return null;
    
    const icon = await extractIcon(exePath);
    return icon ? icon.toDataURL() : null;
  } catch (error) {
    console.error('Erro ao extrair ícone:', error);
    return null;
  }
});

ipcMain.handle('get-game-icon', async (event, exePath) => {
  try {
    if (!exePath) return null;
    
    const icon = await extractIcon(exePath, 64); // Ícone maior para jogos
    return icon ? icon.toDataURL() : null;
  } catch (error) {
    console.error('Erro ao extrair ícone do jogo:', error);
    return null;
  }
});

// Inicialização da aplicação
app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

  if (process.platform === 'win32') {
    app.setLoginItemSettings({
      openAtLogin: false,
      path: process.execPath
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Gerenciamento de instância única
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Segurança de navegação
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.origin !== 'file://') {
      event.preventDefault();
    }
  });
});

console.log('StartZone iniciado - Versão:', app.getVersion());
console.log('Plataforma:', process.platform);
console.log('Arquitetura:', process.arch);