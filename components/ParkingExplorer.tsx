"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { ParkingRow } from "@/lib/supabaseClient";
import ParkingList from "./ParkingList";

// Leaflet работает только в браузере (использует window), поэтому карту
// подключаем без серверного рендеринга (ssr: false можно вызывать только
// внутри клиентского компонента — отсюда этот компонент и клиентский).
const ParkingMap = dynamic(() => import("./ParkingMap"), {
  ssr: false,
  loading: () => <div className="map-container" style={{ background: "#f6f4f1" }} />,
});

// Общий "родитель" для карты и списка: держит, какая парковка сейчас выбрана,
// и передаёт это в оба компонента — клик по карточке подсвечивает маркер,
// клик по маркеру подсвечивает карточку. Без автопрокрутки в обе стороны.
export default function ParkingExplorer({ parkings }: { parkings: ParkingRow[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <>
      <div className="map-wrapper">
        <ParkingMap parkings={parkings} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className="list-wrapper">
        <div className="list-head">
          <h2>Список мест</h2>
          <span className="sort">Сначала новые</span>
        </div>
        <ParkingList parkings={parkings} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
    </>
  );
}
