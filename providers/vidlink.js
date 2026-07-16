const axios = require('axios');

const VIDLINK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'Origin': 'https://vidlink.pro',
    'Referer': 'https://vidlink.pro/'
};

const API_BASE = 'https://enc-dec.app/api';

function validate(data, path) {
    if (!data || data.status !== 200) {
        console.error(`\n${'-'.repeat(25)} API ERROR ${'-'.repeat(25)}\n`);
        console.error(`Path: ${path}`);
        console.error(`Status Code: ${data && data.status}`);
        console.error(`Error: ${(data && data.error) || 'unknown'}`);
        throw new Error('Vidlink API error');
    }
    return data.result;
}

async function getVidlinkStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[Vidlink] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);

    try {
        const encUrl = `${API_BASE}/enc-vidlink?text=${encodeURIComponent(String(tmdbId))}`;
        const encRes = await axios.get(encUrl, { headers: VIDLINK_HEADERS, timeout: 8000 });
        const encodedTmdb = validate(encRes.data, encUrl);
        if (!encodedTmdb) {
            console.log('[Vidlink] Encryption step returned no result.');
            return [];
        }

        const type = mediaType === 'tv' ? 'tv' : 'movie';
        const apiUrl = type === 'tv'
            ? `https://vidlink.pro/api/b/tv/${encodedTmdb}/${seasonNum || ''}/${episodeNum || ''}`
            : `https://vidlink.pro/api/b/movie/${encodedTmdb}`;

        const apiRes = await axios.get(apiUrl, { headers: VIDLINK_HEADERS, timeout: 8000 });
        const data = apiRes.data && apiRes.data.stream ? apiRes.data.stream : apiRes.data;

        const playlist = data && (data.playlist || data.url || (Array.isArray(data) && data[0] && (data[0].playlist || data[0].url)));
        if (!playlist) {
            console.log('[Vidlink] No playlist URL in response.');
            return [];
        }

        console.log(`[Vidlink] Got stream.`);
        return [{
            name: 'Vidlink',
            title: 'Vidlink',
            url: playlist,
            quality: 'Auto',
            provider: 'Vidlink',
            headers: VIDLINK_HEADERS
        }];
    } catch (err) {
        console.error(`[Vidlink] Error: ${err.message}`);
        return [];
    }
}

module.exports = { getVidlinkStreams };
