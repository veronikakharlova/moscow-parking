"use client";

import type { ParkingRow } from "@/lib/supabaseClient";
import ShareButton from "./ShareButton";

// Человеко-понятная дата вместо голой временной метки: "сегодня", "вчера",
// "N дней назад" — так проще на глаз оценить, насколько свежая парковка
function formatAddedAt(iso: string): string {
  const created = new Date(iso);
  const days = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));

  if (days <= 0) return "добавлено сегодня";
  if (days === 1) return "добавлено вчера";
  if (days < 7) return `добавлено ${days} дн. назад`;

  return `добавлено ${created.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`;
}

// Единый список без карточек — строки разделены тонкой линией; поиском и
// состоянием "выбрано" управляет ParkingExplorer, этот компонент просто рисует ряды
export default function ParkingList({
  parkings,
  selectedId = null,
  onSelect,
}: {
  parkings: ParkingRow[];
  selectedId?: number | null;
  onSelect?: (id: number | null) => void;
}) {
  if (parkings.length === 0) {
    return (
      <p className="empty-state">
        Пока нет ни одной парковки — как только в канале появится новый пост, он придёт сюда автоматически.
      </p>
    );
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {parkings.map((p) => {
        const isActive = p.id === selectedId;
        return (
          <li
            key={p.id}
            className={`row${isActive ? " is-active" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelect?.(isActive ? null : p.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.(isActive ? null : p.id);
              }
            }}
          >
            <span className="icon">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8Z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <div className="body">
              <div className="address">{p.address}</div>
              <div className="meta">Москва · {formatAddedAt(p.created_at)}</div>
            </div>
            <div className="row-actions" onClick={(e) => e.stopPropagation()}>
              <ShareButton address={p.address} url={p.source_url} />
              {p.source_url && (
                <a
                  className="icon-btn"
                  href={p.source_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Открыть на карте"
                >
                  <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path
                      d="M2 10 10 2M10 2H4M10 2v6"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
