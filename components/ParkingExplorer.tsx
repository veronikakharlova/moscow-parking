"use client";

import { useMemo, useState } from "react";
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

// Общий "родитель" для карты и списка: держит, какая парковка сейчас выбрана
// (клик по карточке подсвечивает маркер, клик по маркеру — карточку) и
// строку поиска — по ней список превращается в блок с результатами.
export default function ParkingExplorer({ parkings }: { parkings: ParkingRow[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parkings;
    return parkings.filter((p) => p.address.toLowerCase().includes(q));
  }, [parkings, query]);

  const isSearching = query.trim().length > 0;

  return (
    <>
      <div className="map-layer">
        <ParkingMap parkings={parkings} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      <div className="side-panel">
        <div className="search-box">
          <svg className="search-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по адресу"
            aria-label="Поиск по адресу"
          />
          {isSearching && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setQuery("")}
              aria-label="Очистить поиск"
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4 12 12M12 4 4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {isSearching ? (
          <div className="search-results">
            <div className="found-label">
              {filtered.length === 0 ? "Ничего не найдено" : `Найдено: ${filtered.length}`}
            </div>
            {filtered.length > 0 && (
              <div className="rows">
                <ParkingList parkings={filtered} selectedId={selectedId} onSelect={setSelectedId} />
              </div>
            )}
          </div>
        ) : (
          <div className="rows">
            <ParkingList parkings={parkings} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        )}
      </div>
    </>
  );
}
