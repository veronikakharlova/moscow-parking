import { getPublicSupabaseClient, type ParkingRow } from "@/lib/supabaseClient";
import ParkingExplorer from "@/components/ParkingExplorer";

// Обновляем список при каждом заходе, не кэшируем — данные меняются, когда
// в канале появляется новый пост
export const revalidate = 0;

async function getParkings(): Promise<ParkingRow[]> {
  try {
    const supabase = getPublicSupabaseClient();
    const { data, error } = await supabase
      .from("parkings")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Ошибка чтения из Supabase", error);
      return [];
    }
    return data ?? [];
  } catch (e) {
    // Если переменные окружения ещё не настроены (например, при первом деплое) —
    // не роняем страницу, а показываем пустой список
    console.error(e);
    return [];
  }
}

export default async function HomePage() {
  const parkings = await getParkings();

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <div className="brand">
            <span className="mark">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8Z"
                  fill="#FAFAFA"
                />
                <circle cx="12" cy="10" r="3" fill="#B4573C" />
              </svg>
            </span>
            <div>
              <h1>Бесплатные парковки Москвы</h1>
              <p>Собирается автоматически из телеграм-канала</p>
            </div>
          </div>
          <span className="count-pill">
            <span className="dot" />
            {parkings.length} мест на карте
          </span>
        </div>
      </header>
      <main>
        <ParkingExplorer parkings={parkings} />
        <a
          className="site-credit"
          href="https://t.me/Nika_Kharlova"
          target="_blank"
          rel="noreferrer"
        >
          by Вероника Харлова
        </a>
      </main>
    </>
  );
}
