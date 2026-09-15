"use client";

import { useState } from "react";

// Кнопка "Поделиться" на карточке парковки: на телефоне открывает системное
// меню шеринга (Web Share API), на десктопе (где его чаще всего нет) —
// копирует ссылку в буфер обмена и на секунду показывает галочку.
export default function ShareButton({
  address,
  url,
}: {
  address: string;
  url: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const shareText = `Бесплатная парковка: ${address}`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Бесплатная парковка", text: shareText, url: url ?? undefined });
        return;
      } catch {
        // пользователь закрыл системное меню шеринга — тогда просто выходим,
        // копировать в этом случае не нужно
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url ? `${shareText}\n${url}` : shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // буфер обмена недоступен (старый браузер, нет разрешения) — молча ничего не делаем
    }
  }

  return (
    <button
      type="button"
      className="share-btn"
      onClick={handleShare}
      aria-label={copied ? "Ссылка скопирована" : "Поделиться этой парковкой"}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3.5 8.5 6.5 11.5 12.5 4.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="12.5" cy="3.5" r="1.75" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="3.5" cy="8" r="1.75" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="12.5" cy="12.5" r="1.75" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5.1 7.1 11 4.3M5.1 8.9l5.9 2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
