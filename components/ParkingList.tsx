"use client";

import { useMemo, useState } from "react";
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

export default function ParkingList({
  parkings,
  selectedId = null,
  onSelect,
}: {
  parkings: ParkingRow[];
  selectedId?: number | null;
  onSelect?: (id: number | null) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parkings;
    return parkings.filter((p) => p.address.toLowerCase().includes(q));
  }, [parkings, query]);

  if (parkings.length === 0) {
    return (
      <p className="empty-state">
        Пока нет ни одной парковки — как только в канале появится новый пост, он придёт сюда автоматически.
      </p>
    );
  }

  return (
    <>
      <div className="search-box">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
        {query && (
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

      {filtered.length === 0 ? (
        <p className="empty-state">Ничего не нашлось по запросу «{query}».</p>
      ) : (
        <ul className="parking-list">
          {filtered.map((p) => {
            const isActive = p.id === selectedId;
            return (
              <li
                key={p.id}
                className={`parking-item${isActive ? " is-active" : ""}`}
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
                <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                  <ShareButton address={p.address} url={p.source_url} />
                  {p.source_url && (
                    <a className="source-link" href={p.source_url} target="_blank" rel="noreferrer">
                      Карта
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
      )}
    </>
  );
}
