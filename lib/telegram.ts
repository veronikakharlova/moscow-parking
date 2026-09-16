// Небольшая обёртка над Telegram Bot API — используется вебхуком, чтобы
// отвечать пользователю (запрос подтверждения удаления, результат и т.д.)

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

export async function callTelegramApi(
  method: string,
  payload: Record<string, unknown>
): Promise<any> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error(`Нет TELEGRAM_BOT_TOKEN — не могу вызвать ${method}`);
    return null;
  }

  const res = await fetch(`${TELEGRAM_API_BASE}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API ${method} вернул ошибку`, data);
  }
  return data;
}

export function sendTelegramMessage(
  chatId: number,
  text: string,
  extra: Record<string, unknown> = {}
) {
  return callTelegramApi("sendMessage", { chat_id: chatId, text, ...extra });
}
