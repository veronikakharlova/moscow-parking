"use client";

import dynamic from "next/dynamic";
import type { ParkingRow } from "@/lib/supabaseClient";

// Leaflet работает только в браузере (использует window), поэтому карту
// подключаем без серверного рендеринга (ssr: false можно вызывать только
// внутри клиентского компонента — отсюда и этот отдельный файл-обёртка).
const ParkingMap = dynamic(() => import("./ParkingMap"), {
  ssr: false,
  loading: () => <div className="map-container" style={{ background: "#f6f4f1" }} />,
});

export default function MapClientWrapper({ parkings }: { parkings: ParkingRow[] }) {
  return <ParkingMap parkings={parkings} />;
}
