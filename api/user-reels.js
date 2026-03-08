// Vercel Serverless Function - получение видео пользователя по username
// Поддерживает count (12/24/36) для постраничной загрузки (аналитика)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, count } = req.body;
  if (!username) return res.status(400).json({ error: 'username is required' });

  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '959a088626msh74020d3fb11ad19p1e067bjsnb273d9fac830';
  const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();

  // Helper: parse items from API response
  const parseItems = (data) => {
    let items = data?.data?.items || data?.items || data?.data || data?.reels;
    if (!items || !Array.isArray(items)) {
      if (data?.data?.user?.edge_owner_to_timeline_media?.edges) {
        items = data.data.user.edge_owner_to_timeline_media.edges.map(e => e.node);
      }
    }
    return Array.isArray(items) ? items : [];
  };

  // Helper: map raw item → reel object
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
  });

  // Helper: filter pinned/highlighted reels
  const filterPinned = (item) =>
    !item.is_pinned && !item.pinned && !item.is_highlight && !item.highlight &&
    !item.is_featured && !item.featured && !item.pinned_reel && !item.highlight_reel;

  const targetCount = count ? Math.min(Number(count), 36) : 12;

  console.log(`Fetching reels for @${cleanUsername}, target=${targetCount}`);

  const allReels = [];

  // ── Strategy 1: pass count directly (same approach as /hashtag/ and /searchreels/) ──
  try {
    const apiUrl = `https://instagram-scraper-20251.p.rapidapi.com/userreels/?username_or_id=${cleanUsername}&url_embed_safe=true&count=${targetCount}`;
    console.log('Strategy 1 (count param):', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'instagram-scraper-20251.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY,
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log('S1 top-level keys:', Object.keys(data));
      if (data?.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
        console.log('S1 data keys:', Object.keys(data.data));
      }

      const items = parseItems(data);
      console.log('S1 items count:', items.length);

      if (items.length >= targetCount || items.length >= 24) {
        // count param worked — use this result
        const reels = items.filter(filterPinned).map(mapReel).filter(r => r.shortcode);
        allReels.push(...reels);
        console.log('S1 success, using direct count result');
      } else if (items.length > 0) {
        // Got fewer than requested — need pagination
        const reels = items.filter(filterPinned).map(mapReel).filter(r => r.shortcode);
        allReels.push(...reels);

        // Extract cursor — check every known path
        const rawCursor =
          data?.data?.next_cursor ||
          data?.data?.next_max_id ||
          data?.data?.end_cursor ||
          data?.data?.page_info?.end_cursor ||
          data?.data?.paging_info?.max_id ||
          data?.data?.user?.edge_owner_to_timeline_media?.page_info?.end_cursor ||
          data?.next_cursor ||
          data?.next_max_id ||
          data?.pagination_token ||
          data?.cursor ||
          null;

        console.log('S1 cursor found:', rawCursor);

        // Log structure to help debug for future
        console.log('S1 full response (first 1200 chars):', JSON.stringify(data).slice(0, 1200));

        if (rawCursor && allReels.length < targetCount) {
          // ── Strategy 2: paginate with cursor ──
          const pagesNeeded = Math.ceil((targetCount - allReels.length) / 12);

          for (let page = 0; page < pagesNeeded; page++) {
            await new Promise(r => setTimeout(r, 400));

            // Try both max_id and next_cursor as param names
            const cursorParam = encodeURIComponent(rawCursor);
            const pageUrl = `https://instagram-scraper-20251.p.rapidapi.com/userreels/?username_or_id=${cleanUsername}&url_embed_safe=true&max_id=${cursorParam}`;
            console.log(`S2 page ${page + 1}:`, pageUrl);

            const pageResp = await fetch(pageUrl, {
              method: 'GET',
              headers: {
                'x-rapidapi-host': 'instagram-scraper-20251.p.rapidapi.com',
                'x-rapidapi-key': RAPIDAPI_KEY,
              },
            });

            if (!pageResp.ok) { console.log('S2 page error:', pageResp.status); break; }

            const pageData = await pageResp.json();
            const pageItems = parseItems(pageData);
            console.log(`S2 page ${page + 1} items:`, pageItems.length);
            if (pageItems.length === 0) break;

            const pageReels = pageItems.filter(filterPinned).map(mapReel).filter(r => r.shortcode);
            allReels.push(...pageReels);
            if (allReels.length >= targetCount) break;
          }
        }
      }
    } else {
      console.error('S1 HTTP error:', response.status);
    }
  } catch (e) {
    console.error('S1 exception:', e.message);
  }

  // Deduplicate
  const seen = new Set();
  const uniqueReels = allReels.filter(r => {
    if (seen.has(r.shortcode)) return false;
    seen.add(r.shortcode);
    return true;
  });

  console.log(`Total unique reels: ${uniqueReels.length}`);

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
