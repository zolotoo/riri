// Vercel Serverless Function - sync Instagram reels for project analytics
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, count = 12 } = req.body;

  if (!username) return res.status(400).json({ error: 'username is required' });

  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '959a088626msh74020d3fb11ad19p1e067bjsnb273d9fac830';
  const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();

  // Determine how many API pages to fetch (each page returns ~12 reels)
  const pagesNeeded = Math.ceil(Math.min(count, 36) / 12);

  console.log(`Fetching ${count} reels (${pagesNeeded} pages) for @${cleanUsername}`);

  const allReels = [];
  let nextCursor = null;

  for (let page = 0; page < pagesNeeded; page++) {
    try {
      let apiUrl = `https://instagram-scraper-20251.p.rapidapi.com/userreels/?username_or_id=${cleanUsername}&url_embed_safe=true`;
      if (nextCursor) apiUrl += `&next_cursor=${encodeURIComponent(nextCursor)}`;

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'x-rapidapi-host': 'instagram-scraper-20251.p.rapidapi.com',
          'x-rapidapi-key': RAPIDAPI_KEY,
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Page ${page + 1} API error ${response.status}:`, errText.slice(0, 200));
        break;
      }

      const data = await response.json();

      // Extract items (try multiple response shapes)
      let items = data?.data?.items || data?.items || data?.data || data?.reels;
      if (!items || !Array.isArray(items)) {
        if (data?.data?.user?.edge_owner_to_timeline_media?.edges) {
          items = data.data.user.edge_owner_to_timeline_media.edges.map(e => e.node);
        }
      }

      if (!items || !Array.isArray(items) || items.length === 0) {
        console.log(`No items on page ${page + 1}, stopping`);
        break;
      }

      // Filter pinned/highlight reels
      const filteredItems = items.filter(item =>
        !item.is_pinned && !item.pinned && !item.is_highlight && !item.highlight &&
        !item.is_featured && !item.featured && !item.pinned_reel && !item.highlight_reel
      );

      const reels = filteredItems
        .map(item => ({
          id: item.id || item.pk,
          shortcode: item.code || item.shortcode,
          url: `https://www.instagram.com/reel/${item.code || item.shortcode}/`,
          thumbnail_url: item.image_versions2?.candidates?.[0]?.url || item.thumbnail_url || item.display_url || item.thumbnail_src,
          caption: (item.caption?.text || item.edge_media_to_caption?.edges?.[0]?.node?.text || '').slice(0, 500),
          view_count: item.play_count || item.view_count || item.video_view_count || 0,
          like_count: item.like_count || item.edge_liked_by?.count || 0,
          comment_count: item.comment_count || item.edge_media_to_comment?.count || 0,
          taken_at: item.taken_at || item.taken_at_timestamp,
        }))
        .filter(r => r.shortcode);

      allReels.push(...reels);

      // Try to get next cursor for pagination
      nextCursor = data?.data?.next_cursor || data?.next_cursor || data?.pagination_token || null;

      if (!nextCursor) {
        console.log(`No next_cursor after page ${page + 1}, stopping pagination`);
        break;
      }

      // Small delay to avoid rate limiting
      if (page < pagesNeeded - 1) await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.error(`Error on page ${page + 1}:`, e.message);
      break;
    }
  }

  // Deduplicate by shortcode
  const seen = new Set();
  const uniqueReels = allReels.filter(r => {
    if (seen.has(r.shortcode)) return false;
    seen.add(r.shortcode);
    return true;
  });

  console.log(`Total unique reels fetched: ${uniqueReels.length}`);

  return res.status(200).json({
    success: uniqueReels.length > 0,
    username: cleanUsername,
    reels: uniqueReels,
    count: uniqueReels.length,
  });
}
