// Vercel Serverless Function — единый Instagram-прокси (reel-info + user-reels + reels-search)
// Собрано в один файл, чтобы уложиться в лимит 12 serverless-функций Vercel Hobby.
// Маршрутизация через vercel.json rewrites: _op=reel-info | user-reels | reels-search
import { logApiCall } from '../lib/logApiCall.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '959a088626msh74020d3fb11ad19p1e067bjsnb273d9fac830';
const RAPIDAPI_HOST = 'instagram-scraper-20251.p.rapidapi.com';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Определяем операцию: через query _op (из rewrite), либо по пути.
  const op = req.query?._op
    || (req.url?.includes('/reel-info') ? 'reel-info'
      : req.url?.includes('/user-reels') ? 'user-reels'
      : req.url?.includes('/reels-search') ? 'reels-search'
      : null);

  try {
    if (op === 'reel-info') return await reelInfo(req, res);
    if (op === 'user-reels') return await userReels(req, res);
    if (op === 'reels-search') return await reelsSearch(req, res);
    return res.status(400).json({ error: 'Unknown operation', op });
  } catch (e) {
    console.error('[instagram] handler error:', e);
    return res.status(500).json({ error: 'Internal error', details: e.message });
  }
}

// ────────────────────────────── reel-info ──────────────────────────────
async function reelInfo(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, shortcode, userId, projectId, source } = req.body || {};
  if (!url && !shortcode) return res.status(400).json({ error: 'url or shortcode is required' });

  let code = shortcode;
  if (!code && url) {
    const match = url.match(/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
    code = match ? match[1] : null;
  }
  if (!code) return res.status(400).json({ error: 'Could not extract shortcode from URL' });

  console.log('Fetching reel info for shortcode:', code);

  try {
    const apiUrl = `https://${RAPIDAPI_HOST}/postdetail/?code_or_url=${code}`;
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': RAPIDAPI_KEY,
      },
    });

    if (response.ok) {
      const data = await response.json();
      const media = data?.data || data?.items?.[0] || data;

      if (media) {
        const metrics = media.metrics || {};
        const viewCount = metrics.play_count || metrics.ig_play_count || metrics.view_count ||
          media.play_count || media.video_view_count || 0;
        const likeCount = metrics.like_count || media.like_count || 0;
        const commentCount = metrics.comment_count || media.comment_count || 0;

        const carouselMedia = media.carousel_media || (media.carousel_media_count && media.children?.items) || media.edge_sidecar_to_children?.edges;
        let carousel_slides = [];
        const getImageUrl = (item) => {
          return item.image_versions2?.candidates?.[0]?.url
            || item.image_versions?.candidates?.[0]?.url
            || item.image_versions?.items?.[0]?.url
            || item.image_versions2?.items?.[0]?.url
            || item.display_url
            || item.images?.standard_resolution?.url
            || item.images?.low_resolution?.url
            || item.thumbnail_src
            || item.url
            || (item.video_versions?.[0]?.url ? item.video_versions[0].url : null);
        };
        if (Array.isArray(carouselMedia) && carouselMedia.length > 0) {
          carousel_slides = carouselMedia.map((item, i) => {
            const u = getImageUrl(item);
            return { url: u || '', index: i };
          }).filter(s => s.url);
        } else if (Array.isArray(media.children?.items)) {
          carousel_slides = media.children.items.map((item, i) => ({
            url: getImageUrl(item) || '',
            index: i,
          })).filter(s => s.url);
        }
        const is_carousel = carousel_slides.length > 1;

        const candidates = media.image_versions2?.candidates || media.image_versions?.candidates || [];
        const cdnUrl = candidates.find((c) => {
          const u = c?.url || '';
          return u.includes('cdninstagram.com') || u.includes('fbcdn.net') || u.includes('scontent.');
        })?.url;
        const fallbackThumb = media.thumbnail_url
          || candidates[0]?.url
          || media.display_url
          || media.display_resources?.[0]?.src
          || media.thumbnail_src
          || media.image_versions?.items?.[0]?.url
          || carousel_slides[0]?.url
          || '';

        const result = {
          success: true,
          shortcode: code,
          url: url || (is_carousel ? `https://www.instagram.com/p/${code}/` : `https://www.instagram.com/reel/${code}/`),
          thumbnail_url: cdnUrl || fallbackThumb,
          video_url: media.video_url || media.video_versions?.[0]?.url || '',
          caption: media.caption?.text || (typeof media.caption === 'string' ? media.caption : '') || '',
          view_count: viewCount,
          like_count: likeCount,
          comment_count: commentCount,
          taken_at: media.taken_at || media.taken_at_ts,
          owner: {
            username: media.user?.username || '',
            full_name: media.user?.full_name || '',
          },
          is_video: media.is_video || media.media_type === 2 || !!media.video_url,
          is_carousel,
          carousel_slides: is_carousel ? carousel_slides.map(s => s.url) : undefined,
          slide_count: is_carousel ? carousel_slides.length : undefined,
          api_used: 'instagram-scraper-20251',
        };

        if (result.view_count || result.like_count || result.thumbnail_url || result.owner.username || result.is_carousel) {
          logApiCall({ apiName: 'rapidapi', action: 'reel-info', userId, projectId, metadata: { shortcode: code, owner: result.owner.username, source } });
          return res.status(200).json(result);
        }
      }
    } else {
      const errorText = await response.text();
      console.log('reel-info API error:', response.status, errorText);
    }
  } catch (e) {
    console.error('reel-info exception:', e.message);
  }

  return res.status(200).json({
    success: false,
    shortcode: code,
    url: url || `https://www.instagram.com/reel/${code}/`,
    error: 'Could not fetch reel info',
  });
}

// ────────────────────────────── user-reels ──────────────────────────────
async function userReels(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, count, userId, projectId, source } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username is required' });

  const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();

  const parseItems = (data) => {
    let items = data?.data?.items || data?.items || data?.data || data?.reels;
    if (!items || !Array.isArray(items)) {
      if (data?.data?.user?.edge_owner_to_timeline_media?.edges) {
        items = data.data.user.edge_owner_to_timeline_media.edges.map(e => e.node);
      }
    }
    return Array.isArray(items) ? items : [];
  };

  const isTrialReel = (item) => {
    const pt = item.product_type || item.media_type_label || '';
    if (pt === 'trial_reels' || pt === 'trial') return true;
    if (item.is_trial_reel === true) return true;
    if (item.audience_category === 'only_non_followers') return true;
    return false;
  };

  const mapReel = (item) => ({
    id: item.id || item.pk,
    shortcode: item.code || item.shortcode,
    url: `https://www.instagram.com/reel/${item.code || item.shortcode}/`,
    thumbnail_url: item.image_versions2?.candidates?.[0]?.url || item.thumbnail_url || item.display_url || item.thumbnail_src,
    caption: (item.caption?.text || item.edge_media_to_caption?.edges?.[0]?.node?.text || '').slice(0, 500),
    view_count: item.play_count || item.view_count || item.video_view_count || 0,
    like_count: item.like_count || item.edge_liked_by?.count || 0,
    comment_count: item.comment_count || item.edge_media_to_comment?.count || 0,
    taken_at: item.taken_at || item.taken_at_timestamp,
    owner: { username: cleanUsername },
    product_type: item.product_type || 'clips',
    is_trial: isTrialReel(item),
  });

  const filterPinned = (item) =>
    !item.is_pinned && !item.pinned && !item.is_highlight && !item.highlight &&
    !item.is_featured && !item.featured && !item.pinned_reel && !item.highlight_reel;

  const targetCount = count ? Math.min(Number(count), 60) : 12;
  const MAX_PAGES = Math.ceil(targetCount / 12);

  console.log(`Fetching reels for @${cleanUsername}, target=${targetCount}, max_pages=${MAX_PAGES}`);

  const allReels = [];
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    try {
      let apiUrl = `https://${RAPIDAPI_HOST}/userreels/?username_or_id=${cleanUsername}&url_embed_safe=true`;
      if (cursor) apiUrl += `&pagination_token=${encodeURIComponent(cursor)}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      let response;
      try {
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'x-rapidapi-host': RAPIDAPI_HOST,
            'x-rapidapi-key': RAPIDAPI_KEY,
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        console.error(`Page ${page + 1} HTTP error:`, response.status);
        break;
      }

      const data = await response.json();
      const items = parseItems(data);

      if (items.length === 0) break;

      const reels = items.filter(filterPinned).map(mapReel).filter(r => r.shortcode);
      allReels.push(...reels);

      cursor =
        data?.pagination_token ||
        data?.data?.next_cursor ||
        data?.data?.next_max_id ||
        data?.data?.end_cursor ||
        data?.next_cursor ||
        data?.next_max_id ||
        null;

      if (!cursor) break;
      if (allReels.length >= targetCount) break;

      if (page < MAX_PAGES - 1) await new Promise(r => setTimeout(r, 400));
    } catch (e) {
      console.error(`Page ${page + 1} exception:`, e.message);
      break;
    }
  }

  const seen = new Set();
  const uniqueReels = allReels.filter(r => {
    if (seen.has(r.shortcode)) return false;
    seen.add(r.shortcode);
    return true;
  });

  const pagesUsed = allReels.length > 0 ? Math.ceil(allReels.length / 12) : 1;
  logApiCall({ apiName: 'rapidapi', action: 'user-reels', callsCount: pagesUsed, userId, projectId, metadata: { username: cleanUsername, reelsCount: uniqueReels.length, requestedCount: targetCount, source } });

  if (uniqueReels.length > 0) {
    return res.status(200).json({
      success: true,
      username: cleanUsername,
      reels: uniqueReels,
      count: uniqueReels.length,
      api_used: 'instagram-scraper-20251',
    });
  }

  return res.status(200).json({
    success: false,
    username: cleanUsername,
    reels: [],
    count: 0,
    message: 'Could not fetch user reels',
  });
}

// ────────────────────────────── reels-search ──────────────────────────────
async function reelsSearch(req, res) {
  const { type, keyword, hashtag, userId, projectId } = req.query;
  const headers = { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': RAPIDAPI_HOST };

  try {
    let url;
    let action;

    if (type === 'hashtag' || hashtag) {
      const tag = hashtag || keyword;
      if (!tag) return res.status(400).json({ error: 'hashtag is required' });
      url = `https://${RAPIDAPI_HOST}/hashtag/${encodeURIComponent(tag)}/?count=50`;
      action = 'hashtag';
    } else {
      if (!keyword) return res.status(400).json({ error: 'keyword is required' });
      url = `https://${RAPIDAPI_HOST}/searchreels/?keyword=${encodeURIComponent(keyword)}&url_embed_safe=true&count=50`;
      action = 'search';
    }

    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      return res.status(response.status).json({ error: `${action} API error`, status: response.status });
    }

    const data = await response.json();
    logApiCall({ apiName: 'rapidapi', action, userId, projectId, metadata: { keyword: keyword || hashtag } });
    return res.status(200).json(data);
  } catch (error) {
    console.error('reels-search error:', error);
    return res.status(500).json({ error: 'Failed to fetch reels', details: error.message });
  }
}
