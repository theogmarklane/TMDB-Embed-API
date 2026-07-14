const NOTORRENT_API = 'https://addon-osvh.onrender.com';

function cleanText(str) {
  if (!str) return '';
  return str.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, '').trim();
}

function extractQuality(titleText) {
  const raw = titleText || '';
  const match = raw.match(/(\d{3,4}p)/i);
  if (match) return match[0];
  if (raw.toUpperCase().includes('FREE')) return 'Auto';
  return 'Unknown';
}

function getTmdbApiKey(env) {
  const raw = env.TMDB_API_KEYS || env.TMDB_API_KEY || '';
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      return parsed[Math.floor(Math.random() * parsed.length)];
    }
  } catch {
    // fall through
  }
  const keys = raw.split(',').map((value) => value.trim()).filter(Boolean);
  if (!keys.length) return null;
  return keys[Math.floor(Math.random() * keys.length)];
}

export async function getNotorrentStreams({ tmdbId, mediaType = 'movie', season, episode, env }) {
  const tmdbKey = getTmdbApiKey(env);
  if (!tmdbKey) return [];

  const type = mediaType === 'tv' ? 'tv' : 'movie';
  const tmdbUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${encodeURIComponent(tmdbKey)}&append_to_response=external_ids`;
  const tmdbResponse = await fetch(tmdbUrl);
  if (!tmdbResponse.ok) return [];

  const tmdbData = await tmdbResponse.json();
  const imdbId = tmdbData?.external_ids?.imdb_id || null;
  if (!imdbId) return [];

  const apiUrl = mediaType === 'tv' && season != null
    ? `${NOTORRENT_API}/stream/series/${imdbId}:${season}:${episode}.json`
    : `${NOTORRENT_API}/stream/movie/${imdbId}.json`;

  const response = await fetch(apiUrl);
  if (!response.ok) return [];

  const data = await response.json();
  const rawList = Array.isArray(data?.streams) ? data.streams : [];
  const streams = [];

  for (const item of rawList) {
    if (!item || item.externalUrl || !item.url) continue;
    if (item.url.includes('github.com') || item.url.includes('googleusercontent')) continue;

    const cleanTitleStr = cleanText(item.title || '');
    const quality = extractQuality(cleanTitleStr);

    let language = 'Default';
    const langMatch = cleanTitleStr.match(/\(([^)]+)\)/);
    if (langMatch) {
      language = langMatch[1].charAt(0).toUpperCase() + langMatch[1].slice(1).toLowerCase();
    }

    const proxyHeaders = item.behaviorHints?.proxyHeaders?.request || {};
    const headers = { ...(item.behaviorHints?.headers || {}), ...proxyHeaders };
    const nameParts = ['NoTorrent', language !== 'Default' ? language : ''].filter((value) => value.trim() !== '');

    streams.push({
      name: nameParts.join(' • '),
      title: quality,
      url: item.url,
      quality,
      provider: 'notorrent',
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    });
  }

  return streams;
}
