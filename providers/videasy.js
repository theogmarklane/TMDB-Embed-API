const axios = require('axios');
const { getTmdbApiKey } = require('../utils/tmdbKey');

const VIDEASY_HEADERS = {
    Accept: '*/*',
    Origin: 'https://player.videasy.to',
    Referer: 'https://player.videasy.to/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
};

const API_BASE = 'https://enc-dec.app/api';
const DECRYPT_URL = `${API_BASE}/dec-videasy`;
const SEED_URL = 'https://api.wingsdatabase.com/seed';

const SERVERS = [
    { name: 'Jett', server: 'jett' },
    { name: 'Yoru', server: 'cdn', moviesOnly: true },
    { name: 'Tejo', server: 'tejo' },
    { name: 'Neon', server: 'neon2' },
    { name: 'Sage', server: 'ym' },
    { name: 'Cypher', server: 'downloader2' },
    { name: 'Breach', server: 'm4uhd' },
    { name: 'Vyse', server: 'hdmovie', languageFilter: 'English' },
    { name: 'Killjoy', server: 'meine', language: 'german' },
    { name: 'Fade', server: 'hdmovie', languageFilter: 'Hindi' },
    { name: 'Omen', server: 'lamovie' },
    { name: 'Raze', server: 'superflix' }
];

function validate(data, path) {
    if (!data || data.status !== 200) {
        console.error(`\n${'-'.repeat(25)} API ERROR ${'-'.repeat(25)}\n`);
        console.error(`Path: ${path}`);
        console.error(`Status Code: ${data && data.status}`);
        console.error(`Error: ${(data && data.error) || 'unknown'}`);
        throw new Error('Videasy API error');
    }
    return data.result;
}

function doubleEncodeTitle(title) {
    return encodeURIComponent(encodeURIComponent(title));
}

async function getTmdbDetails(tmdbId, mediaType) {
    const tmdbKey = getTmdbApiKey();
    if (!tmdbKey) {
        console.error('[Videasy] No TMDB API key configured.');
        return null;
    }

    try {
        const type = mediaType === 'tv' ? 'tv' : 'movie';
        const { data } = await axios.get(
            `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${tmdbKey}&append_to_response=external_ids`,
            { timeout: 8000 }
        );

        return {
            title: data.title || data.name || '',
            year: String((data.release_date || data.first_air_date || '').split('-')[0] || ''),
            imdbId: (data.external_ids && data.external_ids.imdb_id) || '',
            type
        };
    } catch (err) {
        console.error(`[Videasy] TMDB lookup failed: ${err.message}`);
        return null;
    }
}

async function getSeed(tmdbId) {
    const response = await axios.get(SEED_URL, {
        params: { mediaId: tmdbId },
        headers: VIDEASY_HEADERS,
        timeout: 8000
    });

    if (!response.data || typeof response.data.seed === 'undefined') {
        throw new Error('missing seed');
    }

    return response.data.seed;
}

async function decryptPayload(encryptedText, tmdbId, seed) {
    const { data } = await axios.post(
        DECRYPT_URL,
        { text: encryptedText, id: String(tmdbId), seed },
        {
            headers: {
                ...VIDEASY_HEADERS,
                'Content-Type': 'application/json'
            },
            timeout: 8000
        }
    );

    return validate(data, DECRYPT_URL);
}

function extractSources(decrypted) {
    if (Array.isArray(decrypted)) return decrypted;
    if (decrypted && Array.isArray(decrypted.sources)) return decrypted.sources;
    if (decrypted && decrypted.result && Array.isArray(decrypted.result.sources)) return decrypted.result.sources;
    return [];
}

async function fetchServerSources(serverDef, details, tmdbId, seasonNum, episodeNum, seed) {
    const queryParts = [
        `title=${doubleEncodeTitle(details.title)}`,
        `mediaType=${encodeURIComponent(details.type)}`,
        `year=${encodeURIComponent(details.year)}`,
        `tmdbId=${encodeURIComponent(String(tmdbId))}`,
        `imdbId=${encodeURIComponent(details.imdbId || '')}`,
        `enc=2`,
        `seed=${encodeURIComponent(String(seed))}`
    ];

    if (details.type === 'tv') {
        queryParts.push(`episodeId=${encodeURIComponent(String(episodeNum || ''))}`);
        queryParts.push(`seasonId=${encodeURIComponent(String(seasonNum || ''))}`);
    }

    if (serverDef.language) queryParts.push(`language=${encodeURIComponent(serverDef.language)}`);

    const url = `https://api.wingsdatabase.com/${serverDef.server}/sources-with-title?${queryParts.join('&')}`;
    const { data } = await axios.get(url, {
        headers: VIDEASY_HEADERS,
        timeout: 8000,
        responseType: 'text'
    });

    const encryptedText = typeof data === 'string' ? data : JSON.stringify(data);
    if (!encryptedText || encryptedText.length < 20 || encryptedText.startsWith('<')) {
        return null;
    }

    const decrypted = await decryptPayload(encryptedText, tmdbId, seed);
    return { sources: Array.isArray(decrypted && decrypted.sources) ? decrypted.sources : [], decrypted };
}

async function getVideasyStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[Videasy] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);

    const details = await getTmdbDetails(tmdbId, mediaType);
    if (!details || !details.title) {
        console.error('[Videasy] No title returned from TMDB.');
        return [];
    }

    let seed;
    try {
        seed = await getSeed(tmdbId);
    } catch (err) {
        console.error(`[Videasy] Seed lookup failed: ${err.message}`);
        return [];
    }

    const allStreams = [];
    const seen = new Set();

    await Promise.all(SERVERS.map(async (serverDef) => {
        if (serverDef.moviesOnly && mediaType === 'tv') return;

        try {
            const result = await fetchServerSources(serverDef, details, tmdbId, seasonNum, episodeNum, seed);
            const sources = extractSources(result);
            if (!sources.length) return;

            for (const source of sources) {
                if (!source || !source.url || seen.has(source.url)) continue;
                seen.add(source.url);
                allStreams.push({
                    name: `Videasy ${serverDef.name}`,
                    title: `Videasy ${serverDef.name} - ${source.quality || 'Auto'}`,
                    url: source.url,
                    quality: source.quality || 'Auto',
                    provider: 'Videasy',
                    headers: {
                        Referer: VIDEASY_HEADERS.Referer,
                        Origin: VIDEASY_HEADERS.Origin,
                        'User-Agent': VIDEASY_HEADERS['User-Agent']
                    }
                });
            }

            console.log(`[Videasy] Server ${serverDef.name}: ${sources.length} source(s)`);
        } catch (err) {
            console.log(`[Videasy] Server ${serverDef.name} skipped: ${err.message}`);
        }
    }));

    console.log(`[Videasy] Total streams: ${allStreams.length}`);
    return allStreams;
}

module.exports = { getVideasyStreams };
