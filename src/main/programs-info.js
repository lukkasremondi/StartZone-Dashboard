const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

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

    exec(cmd, { timeout: 20000, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Erro ao obter programas:', error);
        resolve([]);
        return;
      }

      try {
        let programs = [];
        if (stdout.trim()) {
          const parsed = JSON.parse(stdout);
          programs = Array.isArray(parsed) ? parsed : [parsed];
        }

        const blacklist = [
          '.net', 'redistributable', 'update', 'driver', 'security',
          'visual c++', 'microsoft edge webview', 'hotfix', 'framework',
          'assistant', 'support', 'tool', 'runtime', 'package',
          'help viewer', 'helper', 'nativepush'
        ];

        const seen = new Set();
        const formatted = programs
          .filter(p => {
            const name = (p.DisplayName ?? '').toLowerCase();
            if (!name || seen.has(name) || blacklist.some(term => name.includes(term))) {
                return false;
            }
            
            const installPath = p.InstallLocation ?? '';
            const exePath = findExecutableInFolder(installPath);
            
            if(exePath) {
                seen.add(name);
                return true;
            }
            return false;
          })
          .map(p => {
            const installPath = p.InstallLocation ?? '';
            const exePath = findExecutableInFolder(installPath);
            
            let cleanName = p.DisplayName ?? 'Unknown';
            cleanName = cleanName
                .replace(/\bprogram\b/gi, '')
                .replace(/\bprograma\b/gi, '')
                .replace(/\bapplication\b/gi, '')
                .replace(/\bapp\b/gi, '')
                .replace(/\bsoftware\b/gi, '')
                .replace(/\btool\b/gi, '')
                .replace(/\butility\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            
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
        console.log("Saída bruta que causou o erro:", stdout);
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
        // console.error('Erro ao procurar executável na pasta:', err);
        return null;
    }
}

module.exports = {
    getInstalledPrograms,
    findExecutableInFolder
};