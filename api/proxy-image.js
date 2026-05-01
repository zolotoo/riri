import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '959a088626msh74020d3fb11ad19p1e067bjsnb273d9fac830';

export default async function handler(req, res) {
  const { shortcode } = req.query;

  if (!shortcode) {
    return res.status(400).send('Shortcode required');
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).send('Supabase not configured');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // 1. Проверяем кэш в Storage
    const path = `${shortcode}.jpg`;
    const { data: existingFile } = await supabase.storage.from('thumbnails').list('', {
      search: path
    });

    if (existingFile && existingFile.length > 0) {
      const { data: urlData } = supabase.storage.from('thumbnails').getPublicUrl(path);
      return res.redirect(urlData.publicUrl);
    }

    // 2. Если в кэше нет — получаем свежий URL через RapidAPI
    console.log(`[Proxy] Cache miss for ${shortcode}, fetching from Instagram...`);
    const RAPIDAPI_HOST = 'instagram-scraper-20251.p.rapidapi.com';
    const infoRes = await fetch(`https://${RAPIDAPI_HOST}/postdetail/?code_or_url=${shortcode}`, {
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
      }
    });

    if (!infoRes.ok) {
      const text = await infoRes.text().catch(() => '');
      throw new Error(`Instagram API failed: ${infoRes.status} ${text.slice(0, 200)}`);
    }

    const infoData = await infoRes.json();
    const media = infoData?.data || infoData?.items?.[0] || infoData;
    const candidates = media?.image_versions2?.candidates || media?.image_versions?.candidates || [];
    const carouselMedia = media?.carousel_media || media?.children?.items || [];
    const firstCarouselThumb = Array.isArray(carouselMedia) && carouselMedia[0]
      ? (carouselMedia[0].image_versions2?.candidates?.[0]?.url
        || carouselMedia[0].image_versions?.candidates?.[0]?.url
        || carouselMedia[0].display_url)
      : null;
    const freshThumbUrl = candidates[0]?.url
      || media?.thumbnail_url
      || media?.display_url
      || media?.thumbnail_src
      || firstCarouselThumb;

    if (!freshThumbUrl) {
      return res.status(404).send('Thumbnail not found in Instagram');
    }

    // 3. Скачиваем картинку
    const imgRes = await fetch(freshThumbUrl, {
        headers: { 'Referer': 'https://www.instagram.com/' }
    });
    
    if (!imgRes.ok) {
      return res.redirect(freshThumbUrl); // Если не смогли скачать, пробуем отдать прямую ссылку как fallback
    }

    const buffer = Buffer.from(await imgRes.arrayBuffer());
    
    // 4. Сохраняем в Storage (фоном, не дожидаясь конца для ускорения ответа)
    supabase.storage.from('thumbnails').upload(path, buffer, {
      contentType: 'image/jpeg',
      upsert: true
    }).then(({ error }) => {
        if (!error) {
             const { data: urlData } = supabase.storage.from('thumbnails').getPublicUrl(path);
             const publicUrl = urlData.publicUrl;
             supabase.from('videos').update({ thumbnail_url: publicUrl }).eq('shortcode', shortcode).then();
             supabase.from('saved_carousels').update({ thumbnail_url: publicUrl }).eq('shortcode', shortcode).then();
        }
    });

    // 5. Отдаем картинку сразу
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);

  } catch (err) {
    console.error('[Proxy Error]', err);
    return res.status(500).send('Proxy error');
  }
}
