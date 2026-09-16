/**
 * Разбор поста из телеграм-канала вида "адрес + ссылка на карту".
 *
 * Формат постов в канале простой (только ссылка + адрес, без пояснений),
 * поэтому здесь используются обычные правила (regex), без обращения к ИИ.
 * Если однажды формат станет разнообразнее и разбор начнёт часто давать
 * промах — это то место, куда можно добавить fallback через Claude API.
 */

const URL_REGEX = /https?:\/\/[^\s]+/i;

// Хост собственного сайта — посты, которые просто анонсируют/упоминают сайт
// (даже без "https://" перед ссылкой, как бывает при скрытой telegram-ссылке,
// когда в тексте виден только текст, а сама ссылка — в entity, которую сюда
// не передают), это точно не адрес парковки, а не просто "ссылка не на карту".
const FALLBACK_OWN_SITE_HOST = "moscow-parking-five.vercel.app";

function getOwnSiteHost(): string | null {
  const raw = process.env.SITE_URL;
  if (!raw) return FALLBACK_OWN_SITE_HOST;
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return FALLBACK_OWN_SITE_HOST;
  }
}

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

// Если в посте есть ссылка, но она ведёт не на карту (например форма
// обратной связи, анонс с любой другой ссылкой) — это точно не пост с
// парковкой, парсер такое пропускает (см. isMapUrl ниже), даже если рядом
// есть какой-то текст.
//
// На голом google.com / yandex.ru живёт много другого — формы, диск,
// документы, — поэтому их засчитываем картой только если путь ведёт в
// раздел /maps (docs.google.com/forms/... не должен пройти как карта).
const MAP_ONLY_HOSTS = [
  "goo.gl",
  "maps.app.goo.gl",
  "2gis.ru",
  "2gis.com",
  "openstreetmap.org",
  "osm.org",
];
const MAPS_SECTION_HOSTS = ["google.com", "google.ru", "yandex.ru"];

/** Похож ли ссылка на сервис карт (Яндекс/Google/2ГИС/OSM). */
function isMapUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.host.toLowerCase();
    const path = u.pathname.toLowerCase();

    if (MAP_ONLY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true;

    // поддомен maps.* — однозначно карта (maps.yandex.ru, maps.google.com)
    if (host.startsWith("maps.")) return true;

    // корневой домен — только если это именно раздел /maps
    if (
      MAPS_SECTION_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) &&
      path.startsWith("/maps")
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
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
 * Страницы организаций на Яндекс.Картах (yandex.ru/maps/org/.../ID) не кладут
 * координаты ни в саму ссылку, ни в её редирект — только внутрь HTML, в
 * служебную ссылку на "настройки" (retpath со старым центром карты). Ищем
 * "ll=<lon>,<lat>" прямо в тексте страницы, независимо от уровня
 * URL-кодирования (там попадается и "%2C", и "%252C").
 */
async function extractCoordsFromPage(url: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MoscowParkingBot/1.0)" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();
    const match = html.match(/ll(?:=|%3D|%253D)(-?\d+\.\d+)(?:,|%2C|%252C)(-?\d+\.\d+)/i);
    if (match) {
      const lng = Number(match[1]);
      const lat = Number(match[2]);
      if (isFinite(lat) && isFinite(lng)) return { lat, lng };
    }
  } catch {
    // страница не открылась / без нужного паттерна — не страшно, ниже есть geocode-фолбэк
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

  // Пост про сам сайт (анонс, апдейт, что угодно с упоминанием домена) —
  // не парковка, пропускаем до попытки выделить адрес и ссылку
  const ownHost = getOwnSiteHost();
  if (ownHost && text.toLowerCase().includes(ownHost)) return null;

  const url = extractUrl(text);

  // Ссылка есть, но ведёт не на карту — значит это не пост с парковкой
  // (форма, анонс, что угодно ещё), пропускаем, не пытаясь ничего добавить
  if (url && !isMapUrl(url)) return null;

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
    // Ни в самой ссылке, ни в редиректе координат нет (типично для страниц
    // организаций/мест на Яндекс.Картах) — пробуем достать их из HTML страницы
    if (!coords) {
      coords = await extractCoordsFromPage(url);
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
