/**
 * Разбор поста из телеграм-канала вида "адрес + ссылка на карту".
 *
 * Формат постов в канале простой (только ссылка + адрес, без пояснений),
 * поэтому здесь используются обычные правила (regex), без обращения к ИИ.
 * Если однажды формат станет разнообразнее и разбор начнёт часто давать
 * промах — это то место, куда можно добавить fallback через Claude API.
 */

const URL_REGEX = /https?:\/\/[^\s]+/i;

export type ParsedPost = {
  address: string;
  sourceUrl: string | null;
  lat: number | null;
  lng: number | null;
};

/** Достаёт первую ссылку из текста поста. */
function extractUrl(text: string): string | null {
  const match = text.match(URL_REGEX);
  return match ? match[0].replace(/[),.]+$/, "") : null;
}

/** Пытается достать координаты прямо из URL карт (без обращения к сети). */
function extractCoordsFromUrl(url: string): { lat: number; lng: number } | null {
  try {
    const u = new URL(url);

    // Яндекс.Карты: ...?ll=LON,LAT&...
    const ll = u.searchParams.get("ll");
    if (ll) {
      const [lon, lat] = ll.split(",").map(Number);
      if (isFinite(lat) && isFinite(lon)) return { lat, lng: lon };
    }

    // Google Maps: .../@LAT,LNG,...z
    const atMatch = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      const lat = Number(atMatch[1]);
      const lng = Number(atMatch[2]);
      if (isFinite(lat) && isFinite(lng)) return { lat, lng };
    }

    // Google Maps: ?q=LAT,LNG
    const q = u.searchParams.get("q");
    if (q && /^-?\d+\.\d+,-?\d+\.\d+$/.test(q)) {
      const [lat, lng] = q.split(",").map(Number);
      return { lat, lng };
    }

    // OpenStreetMap: ?mlat=LAT&mlon=LON
    const mlat = u.searchParams.get("mlat");
    const mlon = u.searchParams.get("mlon");
    if (mlat && mlon) {
      const lat = Number(mlat);
      const lng = Number(mlon);
      if (isFinite(lat) && isFinite(lng)) return { lat, lng };
    }
  } catch {
    // некорректный URL — просто не смогли распарсить
  }
  return null;
}

/**
 * Короткие ссылки (например yandex.ru/maps/-/xxxxx) не содержат координат —
 * их нужно "раскрыть", перейдя по редиректу, и уже там поискать ll=.
 * Делаем это только для доменов карт, с таймаутом, без падения при ошибке.
 */
async function resolveShortMapUrl(url: string): Promise<string> {
  try {
    const host = new URL(url).host;
    const isMapHost = /yandex\.|goo\.gl|maps\.app\.goo\.gl|2gis\./i.test(host);
    if (!isMapHost) return url;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MoscowParkingBot/1.0)" },
    });
    clearTimeout(timeout);
    return res.url || url;
  } catch {
    return url;
  }
}

/** Геокодирование адреса через бесплатный Nominatim (OpenStreetMap), без API-ключа. */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const query = encodeURIComponent(`${address}, Москва`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`,
      {
        signal: controller.signal,
        // Nominatim просит указывать User-Agent с контактом — правило их публичного сервиса
        headers: { "User-Agent": "MoscowParkingBot/1.0 (veronika.kharlova@gmail.com)" },
      }
    );
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;

    return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
  } catch {
    return null;
  }
}

/**
 * Главная функция: принимает сырой текст поста, возвращает структурированные
 * данные о парковке или null, если даже адрес выделить не получилось.
 */
export async function parseParkingPost(rawText: string): Promise<ParsedPost | null> {
  const text = rawText.trim();
  if (!text) return null;

  const url = extractUrl(text);
  const address = (url ? text.replace(url, "") : text)
    .replace(/\s+/g, " ")
    .trim();

  if (!address) return null;

  let coords: { lat: number; lng: number } | null = null;

  if (url) {
    coords = extractCoordsFromUrl(url);
    if (!coords) {
      const resolvedUrl = await resolveShortMapUrl(url);
      if (resolvedUrl !== url) coords = extractCoordsFromUrl(resolvedUrl);
    }
  }

  if (!coords) {
    coords = await geocodeAddress(address);
  }

  return {
    address,
    sourceUrl: url,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
  };
}
