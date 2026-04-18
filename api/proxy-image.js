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
    const infoRes = await fetch(`https://instagram-scraper-20251.p.rapidapi.com/api/reel-info?shortcode=${shortcode}`, {
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'instagram-scraper-20251.p.rapidapi.com'
      }
    });

    if (!infoRes.ok) {
      throw new Error(`Instagram API failed with status ${infoRes.status}`);
    }

    const infoData = await infoRes.json();
    const freshThumbUrl = infoData.thumbnail_url || infoData.carousel_slides?.[0];

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
             // Обновляем ссылку в таблице videos для консистентности
             const { data: urlData } = supabase.storage.from('thumbnails').getPublicUrl(path);
             supabase.from('videos').update({ thumbnail_url: urlData.publicUrl }).eq('shortcode', shortcode).then();
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
