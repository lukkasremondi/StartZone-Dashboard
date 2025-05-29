const si = require('systeminformation');
const { getDiskInfo } = require('node-disk-info');
const { exec } = require('child_process');

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

module.exports = {
    getAllSystemInfo,
    getCPUInfo,
    getGPUInfo,
    getMemoryInfo,
    getDiskInfoFormatted,
    getNetworkInfo,
    getAudioInfo,
    getCurrentDateTime
};