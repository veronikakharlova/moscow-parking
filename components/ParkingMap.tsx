"use client";

import { useEffect, useRef } from "react";
import type { ParkingRow } from "@/lib/supabaseClient";

// Leaflet подключается обычным script/link тегом (как раньше ymaps),
// а не через npm-пакет — это избавляет от возни со сборкой картинок-маркеров
// в Next.js и не требует никакого API-ключа.
declare global {
  interface Window {
    L?: any;
  }
}

const LEAFLET_VERSION = "1.9.4";
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;

let leafletLoadingPromise: Promise<void> | null = null;

function loadLeaflet(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.L) return Promise.resolve();
  if (leafletLoadingPromise) return leafletLoadingPromise;

  leafletLoadingPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Не удалось загрузить Leaflet"));
    document.head.appendChild(script);
  });

  return leafletLoadingPromise;
}

export default function ParkingMap({ parkings }: { parkings: ParkingRow[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  const withCoords = parkings.filter(
    (p): p is ParkingRow & { lat: number; lng: number } => p.lat !== null && p.lng !== null
  );
  const hasCoords = withCoords.length > 0;

  useEffect(() => {
    let cancelled = false;

    // Пока в базе нет ни одной парковки с координатами — показывать нечего,
    // и загружать Leaflet с его тайлами тоже смысла нет
    if (!hasCoords) return;

    loadLeaflet()
      .then(() => {
        if (cancelled || !containerRef.current || !window.L) return;

        const L = window.L;

        // Дефолтные иконки-маркеры Leaflet ссылаются на локальные файлы,
        // которых у нас нет в сборке — подставляем те же картинки с CDN.
        const icon = L.icon({
          iconUrl: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/marker-icon.png`,
          iconRetinaUrl: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/marker-icon-2x.png`,
          shadowUrl: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/marker-shadow.png`,
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41],
        });

        const center: [number, number] = [withCoords[0].lat, withCoords[0].lng];

        // attributionControl: false — убираем дефолтную подпись "Leaflet",
        // ниже добавляем свою (только обязательная по правилам OpenStreetMap)
        const map = L.map(containerRef.current, { attributionControl: false }).setView(
          center,
          11
        );
        mapRef.current = map;
        L.control.attribution({ prefix: false }).addTo(map);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        withCoords.forEach((p) => {
          const popupHtml = p.source_url
            ? `<b>${escapeHtml(p.address)}</b><br/><a href="${p.source_url}" target="_blank" rel="noreferrer">Открыть на карте →</a>`
            : `<b>${escapeHtml(p.address)}</b>`;

          L.marker([p.lat, p.lng], { icon }).addTo(map).bindPopup(popupHtml);
        });
      })
      .catch((err) => console.error(err));

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkings, hasCoords]);

  if (!hasCoords) {
    return (
      <div className="map-empty">
        <span className="icon">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8Z"
              fill="currentColor"
            />
          </svg>
        </span>
        <p>
          Пока нет парковок с координатами.
          <br />
          Как только в канале появится пост с адресом, здесь появится карта.
        </p>
      </div>
    );
  }

  return <div ref={containerRef} className="map-container" />;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
