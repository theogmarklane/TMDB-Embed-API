import { getNotorrentStreams } from './providers/notorrent.js';
import { getVixsrcStreams } from './providers/vixsrc.js';

const PROVIDERS = {
  notorrent: getNotorrentStreams,
  vixsrc: getVixsrcStreams,
};

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type, authorization');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function parseTmdbKeys(env) {
  const raw = env.TMDB_API_KEYS || env.TMDB_API_KEY || '';
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {
    // fall through to comma-separated parsing
  }
  return raw.split(',').map((value) => value.trim()).filter(Boolean);
}

function pickTmdbKey(env) {
  const keys = parseTmdbKeys(env);
  if (!keys.length) return null;
  return keys[Math.floor(Math.random() * keys.length)];
}

async function resolveImdbId(tmdbId, mediaType, env) {
  const key = pickTmdbKey(env);
  if (!key) return null;

  const type = mediaType === 'tv' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${encodeURIComponent(key)}&append_to_response=external_ids`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  return data?.external_ids?.imdb_id || null;
}

function normalizeProviderName(providerName) {
  return String(providerName || '').toLowerCase();
}

function parseRequestUrl(url) {
  const requestUrl = new URL(url);
  const segments = requestUrl.pathname.split('/').filter(Boolean);
  return { requestUrl, segments };
}

async function handleHealth() {
  return json({ ok: true, service: 'tmdb-embed-api-worker' });
}

async function handleProviders() {
  return json({
    success: true,
    providers: Object.keys(PROVIDERS).map((name) => ({ name, enabled: true })),
  });
}

async function handleAggregateStream(request, env, tmdbId, mediaType, season, episode) {
  const providers = Object.entries(PROVIDERS);
  const results = await Promise.all(
    providers.map(async ([name, fetchStreams]) => {
      const streams = await fetchStreams({ tmdbId, mediaType, season, episode, env, request });
      return streams.map((stream) => ({ ...stream, provider: stream.provider || name }));
    }),
  );

  const streams = results.flat();
  return json({ success: true, tmdbId, count: streams.length, streams });
}

async function handleProviderStream(request, env, providerName, mediaType, tmdbId, season, episode) {
  const fetchStreams = PROVIDERS[normalizeProviderName(providerName)];
  if (!fetchStreams) {
    return json({ success: false, error: 'PROVIDER_NOT_FOUND' }, { status: 404 });
  }

  const streams = await fetchStreams({ tmdbId, mediaType, season, episode, env, request });
  return json({
    success: true,
    provider: normalizeProviderName(providerName),
    tmdbId,
    count: streams.length,
    streams,
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'content-type, authorization',
        },
      });
    }

    const { requestUrl, segments } = parseRequestUrl(request.url);

    if (segments.length === 0) {
      return json({
        success: true,
        message: 'API only. Use /api/health, /api/providers, /api/streams/:type/:tmdbId, or /api/streams/:provider/:type/:tmdbId.',
      });
    }

    if (requestUrl.pathname === '/api/health') {
      return handleHealth();
    }

    if (requestUrl.pathname === '/api/providers') {
      return handleProviders();
    }

    if (segments[0] !== 'api' || segments[1] !== 'streams') {
      return json({ success: false, error: 'NOT_FOUND' }, { status: 404 });
    }

    const query = requestUrl.searchParams;
    const maybeProvider = segments[2];

    if (segments.length === 5) {
      const providerName = maybeProvider;
      const mediaType = segments[3];
      const tmdbId = segments[4];
      const season = query.get('season');
      const episode = query.get('episode');

      if (!['movie', 'series'].includes(mediaType)) {
        return json({ success: false, error: 'INVALID_TYPE' }, { status: 400 });
      }

      return handleProviderStream(
        request,
        env,
        providerName,
        mediaType,
        tmdbId,
        season ? Number(season) : null,
        episode ? Number(episode) : null,
      );
    }

    if (segments.length === 4) {
      const mediaType = maybeProvider;
      const tmdbId = segments[3];
      const season = query.get('season');
      const episode = query.get('episode');

      if (!['movie', 'series'].includes(mediaType)) {
        return json({ success: false, error: 'INVALID_TYPE' }, { status: 400 });
      }

      return handleAggregateStream(
        request,
        env,
        tmdbId,
        mediaType,
        season ? Number(season) : null,
        episode ? Number(episode) : null,
      );
    }

    return json({ success: false, error: 'NOT_FOUND' }, { status: 404 });
  },
};
