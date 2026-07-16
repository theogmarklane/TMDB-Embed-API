const axios = require('axios');

const VIXSRC_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'Referer': 'https://vixsrc.cobratv.cloud'
};

async function getVidlinkStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[Vixsrc] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);
    
    try {
        // Build the API URL
        let apiUrl = `https://vixsrc.cobratv.cloud/api?id=${tmdbId}`;
        
        if (mediaType === 'tv' && seasonNum && episodeNum) {
            apiUrl += `&s=${seasonNum}&e=${episodeNum}`;
        }

        const apiRes = await axios.get(apiUrl, { 
            headers: VIXSRC_HEADERS, 
            timeout: 8000 
        });

        const data = apiRes.data;

        if (!data?.url) {
            console.log('[Vixsrc] No stream URL returned.');
            return [];
        }

        console.log(`[Vixsrc] Got stream.`);

        return [{
            name: 'Vixsrc',
            title: 'Vixsrc',
            url: data.url,
            quality: 'Auto',
            provider: 'Vixsrc',
            headers: { 'Referer': 'https://vixsrc.cobratv.cloud' }
        }];

    } catch (err) {
        console.error(`[Vixsrc] Error: ${err.message}`);
        if (err.response) {
            console.error(`Status: ${err.response.status}`);
        }
        return [];
    }
}

module.exports = { getVidlinkStreams };
