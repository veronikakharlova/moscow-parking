"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

// Высота свёрнутой шторки на мобильном — под неё же подстраивается
// положение зум-контрола карты (см. globals.css)
const SHEET_PEEK_HEIGHT = 220;
// Насколько ниже верхнего края экрана останавливается развёрнутая шторка,
// чтобы сверху оставалась видна полоска карты
const SHEET_FULL_MARGIN = 110;

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
}

function getSheetFullHeight() {
  if (typeof window === "undefined") return 600;
  return window.innerHeight - SHEET_FULL_MARGIN;
}

// Общий "родитель" для карты и списка: держит, какая парковка сейчас выбрана
// (клик по карточке подсвечивает маркер, клик по маркеру — карточку) и
// строку поиска — по ней список превращается в блок с результатами.
export default function ParkingExplorer({ parkings }: { parkings: ParkingRow[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  // Мобильная шторка со списком: "peek" — свёрнута (видно поиск и
  // примерно полтора адреса, карта открыта), "full" — развёрнута почти
  // на весь экран. На десктопе эти состояния ни на что не влияют —
  // .side-panel там позиционируется как обычно, высоту задаёт CSS.
  const [sheetState, setSheetState] = useState<"peek" | "full">("peek");
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  function applySheetHeight(state: "peek" | "full") {
    const el = sheetRef.current;
    if (!el) return;
    if (!isMobileViewport()) {
      el.style.height = ""; // на десктопе высоту задаёт CSS (top/bottom)
      return;
    }
    el.style.height = `${state === "full" ? getSheetFullHeight() : SHEET_PEEK_HEIGHT}px`;
  }

  useEffect(() => {
    applySheetHeight(sheetState);
    function handleResize() {
      applySheetHeight(sheetState);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetState]);

  function snapSheetTo(state: "peek" | "full") {
    setSheetDragging(false);
    setSheetState(state);
    applySheetHeight(state);
  }

  function handleHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!isMobileViewport() || !sheetRef.current) return;
    dragRef.current = {
      startY: e.clientY,
      startHeight: sheetRef.current.getBoundingClientRect().height,
    };
    setSheetDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !sheetRef.current) return;
    const dy = dragRef.current.startY - e.clientY;
    const full = getSheetFullHeight();
    const next = Math.min(full, Math.max(SHEET_PEEK_HEIGHT, dragRef.current.startHeight + dy));
    sheetRef.current.style.height = `${next}px`;
  }

  function handleHandlePointerUp() {
    if (!dragRef.current || !sheetRef.current) return;
    const current = sheetRef.current.getBoundingClientRect().height;
    const full = getSheetFullHeight();
    const mid = (SHEET_PEEK_HEIGHT + full) / 2;
    dragRef.current = null;
    snapSheetTo(current > mid ? "full" : "peek");
  }

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

      <div
        ref={sheetRef}
        className={`side-panel${sheetDragging ? " is-dragging" : ""}`}
        data-sheet={sheetState}
      >
        <div
          className="sheet-handle"
          onPointerDown={handleHandlePointerDown}
          onPointerMove={handleHandlePointerMove}
          onPointerUp={handleHandlePointerUp}
          onPointerCancel={handleHandlePointerUp}
        >
          <span className="bar" />
          <button
            type="button"
            className="sheet-chevron"
            onClick={() => snapSheetTo(sheetState === "full" ? "peek" : "full")}
            aria-label={sheetState === "full" ? "Свернуть список" : "Развернуть список"}
          >
            <svg viewBox="0 0 22 14" fill="none" aria-hidden="true">
              <path
                d="M2 12 11 3 20 12"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className="sheet-body">
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
      </div>
    </>
  );
}
