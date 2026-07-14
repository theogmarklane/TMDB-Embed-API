const BASE_URL = 'https://vixsrc.to';
const VIXSRC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: BASE_URL,
  Origin: BASE_URL,
};

async function fetchApi(url) {
  try {
    const response = await fetch(url, { headers: VIXSRC_HEADERS });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchEmbedPage(suburl) {
  try {
    const response = await fetch(`${BASE_URL}${suburl}`, {
      headers: { ...VIXSRC_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*' },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function extractTokenData(html) {
  const token = html.match(/token["']\s*:\s*["']([^"']+)/)?.[1];
  const expires = html.match(/expires["']\s*:\s*["']([^"']+)/)?.[1];
  const playlist = html.match(/url\s*:\s*["']([^"']+)/)?.[1];

  if (!token || !expires || !playlist) return null;
  if (Number(expires) * 1000 - 60_000 < Date.now()) return null;
  return { token, expires, playlist };
}

function buildMasterUrl(tokenData) {
  const { token, expires, playlist } = tokenData;
  const separator = playlist.includes('?') ? '&' : '?';
  return `${playlist}${separator}token=${token}&expires=${expires}&h=1`;
}

async function fetchPlaylist(masterUrl, pageApiUrl) {
  try {
    const response = await fetch(masterUrl, {
      headers: { ...VIXSRC_HEADERS, Referer: pageApiUrl },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function parsePlaylist(content, masterUrl, pageApiUrl) {
  const sources = [];
  const lines = content.split('\n');

  let bestResolution = 0;
  for (const line of lines) {
    const match = line.match(/RESOLUTION=\d+x(\d+)/);
    if (match) {
      const resolution = Number(match[1]);
      if (resolution > bestResolution) bestResolution = resolution;
    }
  }

  if (bestResolution === 0) return [];

  sources.push({
    name: `Vixsrc - ${bestResolution}p`,
    title: `Vixsrc - ${bestResolution}p`,
    url: masterUrl,
    quality: `${bestResolution}p`,
    provider: 'vixsrc',
    headers: {
      Referer: pageApiUrl,
      'User-Agent': VIXSRC_HEADERS['User-Agent'],
    },
  });

  return sources;
}

export async function getVixsrcStreams({ tmdbId, mediaType = 'movie', season, episode }) {
  const apiUrl = mediaType === 'movie'
    ? `${BASE_URL}/api/movie/${tmdbId}`
    : `${BASE_URL}/api/tv/${tmdbId}/${season}/${episode}`;

  const apiData = await fetchApi(apiUrl);
  if (!apiData?.src) return [];

  const html = await fetchEmbedPage(apiData.src);
  if (!html) return [];

  const tokenData = extractTokenData(html);
  if (!tokenData) return [];

  const masterUrl = buildMasterUrl(tokenData);
  const playlistContent = await fetchPlaylist(masterUrl, apiUrl);
  if (!playlistContent) return [];

  return parsePlaylist(playlistContent, masterUrl, apiUrl);
}
