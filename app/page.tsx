import { getPublicSupabaseClient, type ParkingRow } from "@/lib/supabaseClient";
import MapClientWrapper from "@/components/MapClientWrapper";
import ParkingList from "@/components/ParkingList";

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
        <h1>Бесплатные парковки Москвы</h1>
        <p>Собирается автоматически из телеграм-канала · {parkings.length} мест на карте</p>
      </header>
      <main>
        <div className="map-wrapper">
          <MapClientWrapper parkings={parkings} />
        </div>
        <div className="list-wrapper">
          <ParkingList parkings={parkings} />
        </div>
      </main>
    </>
  );
}
