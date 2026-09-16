// Разовая настройка: говорит Telegram, куда присылать новые посты из канала.
// Запускать один раз после деплоя на Vercel (и повторно, если поменяли домен):
//   npm run set-webhook
//
// Нужны переменные окружения (можно положить в .env.local в корне проекта):
//   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, SITE_URL

import { readFileSync, existsSync } from "node:fs";

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  const content = readFileSync(".env.local", "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, SITE_URL } = process.env;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET || !SITE_URL) {
  console.error(
    "Не хватает переменных окружения. Нужны: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, SITE_URL " +
      "(положите их в .env.local или экспортируйте в терминале перед запуском)."
  );
  process.exit(1);
}

const webhookUrl = `${SITE_URL.replace(/\/$/, "")}/api/telegram-webhook`;
const apiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;

const res = await fetch(apiUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: TELEGRAM_WEBHOOK_SECRET,
    // channel_post — новые посты в канале; message — личные сообщения боту
    // (пересланный пост = запрос на удаление парковки); callback_query — нажатия
    // на кнопки "Да, удалить" / "Отмена"
    allowed_updates: ["channel_post", "message", "callback_query"],
  }),
});

const data = await res.json();
console.log(data);

if (data.ok) {
  console.log(`\nГотово! Telegram будет слать посты на ${webhookUrl}`);
} else {
  console.error("\nTelegram вернул ошибку — проверьте токен бота и SITE_URL.");
  process.exit(1);
}
