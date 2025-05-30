const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const axios = require('axios');

// ADICIONE AQUI A SUA NOVA API KEY DA STEAMGRIDDB
const STEAMGRIDDB_API_KEY = 'e061130ba2c6029b242e4d6541f0c744';

const COVERS_CACHE_DIR = path.join(app.getPath('userData'), 'covers');

async function ensureCacheDirExists() {
    try {
        await fs.mkdir(COVERS_CACHE_DIR, { recursive: true });
    } catch (error) {
        console.error('Erro ao criar diretório de cache para capas:', error);
    }
}

function sanitizeGameNameForFilename(gameName) {
    return gameName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        + '.jpg';
}

/**
 * Busca a capa de um jogo na API da SteamGridDB.
 * Este processo tem duas etapas:
 * 1. Buscar o ID do jogo pelo nome.
 * 2. Buscar as capas (grids) usando o ID do jogo.
 * @param {string} gameName O nome do jogo.
 * @returns {Promise<string|null>} A URL da imagem da capa ou null.
 */
async function getCoverUrlFromApi(gameName) {
    const config = {
        headers: {
            'Authorization': `Bearer ${STEAMGRIDDB_API_KEY}`
        }
    };

    try {
        // Etapa 1: Buscar o ID do jogo
        const encodedGameName = encodeURIComponent(gameName);
        const searchUrl = `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodedGameName}`;
        const searchResponse = await axios.get(searchUrl, config);

        if (!searchResponse.data.success || searchResponse.data.data.length === 0) {
            console.warn(`[SteamGridDB] Jogo "${gameName}" não encontrado na busca.`);
            return null;
        }

        const gameId = searchResponse.data.data[0].id;

        // Etapa 2: Buscar as capas (grids) para o ID do jogo
        // Estamos buscando por '600x900' que é a dimensão de pôster mais comum
        const gridsUrl = `https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=600x900`;
        const gridsResponse = await axios.get(gridsUrl, config);

        if (!gridsResponse.data.success || gridsResponse.data.data.length === 0) {
            console.warn(`[SteamGridDB] Nenhuma capa (grid) encontrada para o jogo "${gameName}" (ID: ${gameId}).`);
            return null;
        }

        // Retorna a URL da primeira capa encontrada
        return gridsResponse.data.data[0].url;

    } catch (error) {
        console.error(`[SteamGridDB] Erro na comunicação com a API para "${gameName}":`, error.message);
        return null;
    }
}


/**
 * Função principal que baixa e salva a capa, agora usando a SteamGridDB.
 * @param {string} gameName O nome do jogo para buscar.
 * @returns {Promise<string|null>} O caminho local para a imagem da capa ou null.
 */
async function fetchAndCacheCover(gameName) {
    if (!gameName || !STEAMGRIDDB_API_KEY || STEAMGRIDDB_API_KEY === 'SUA_CHAVE_API_AQUI') {
        if (STEAMGRIDDB_API_KEY === 'SUA_CHAVE_API_AQUI') {
            console.error("A API Key da SteamGridDB não foi definida em games-covers.js!");
        }
        return null;
    }

    await ensureCacheDirExists();
    const fileName = sanitizeGameNameForFilename(gameName);
    const localCoverPath = path.join(COVERS_CACHE_DIR, fileName);

    try {
        await fs.access(localCoverPath);
        return localCoverPath;
    } catch (error) {
        console.log(`Buscando na API SteamGridDB para "${gameName}"...`);
        const imageUrl = await getCoverUrlFromApi(gameName);

        if (!imageUrl) {
            return null;
        }

        try {
            const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            await fs.writeFile(localCoverPath, imageResponse.data);
            console.log(`Capa para "${gameName}" salva em: ${localCoverPath}`);
            return localCoverPath;
        } catch (downloadError) {
            console.error(`Erro ao baixar a imagem de "${imageUrl}":`, downloadError.message);
            return null;
        }
    }
}

module.exports = {
    fetchAndCacheCover
};