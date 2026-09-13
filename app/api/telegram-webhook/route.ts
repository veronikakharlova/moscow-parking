import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabaseClient";
import { parseParkingPost } from "@/lib/parse";

export const runtime = "nodejs";

type TelegramUpdate = {
  channel_post?: {
    message_id: number;
    text?: string;
    caption?: string;
    chat: { id: number; title?: string };
  };
};

export async function POST(req: NextRequest) {
  // 1. Проверяем, что запрос действительно от Telegram, а не от кого-то постороннего,
  // кто угадал адрес вебхука. Telegram присылает этот заголовок, если при setWebhook
  // был передан secret_token (см. scripts/set-webhook.mjs).
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const update = (await req.json()) as TelegramUpdate;
  const post = update.channel_post;

  // Telegram шлёт вебхук на любые апдейты бота (не только новые посты в канале) —
  // если это не пост канала, просто отвечаем 200 и ничего не делаем.
  if (!post) {
    return NextResponse.json({ ok: true, skipped: "not a channel post" });
  }

  // Если бот вдруг состоит не только в вашем канале — обрабатываем только нужный
  const allowedChannelId = process.env.TELEGRAM_CHANNEL_ID;
  if (allowedChannelId && String(post.chat.id) !== allowedChannelId) {
    return NextResponse.json({ ok: true, skipped: "different channel" });
  }

  const text = post.text ?? post.caption ?? "";
  const parsed = await parseParkingPost(text);

  if (!parsed) {
    // Не смогли выделить даже адрес — не страшно, просто пропускаем этот пост.
    // Логируется в Vercel Logs, чтобы можно было потом посмотреть, что пошло не так.
    console.warn("Не удалось распарсить пост", { messageId: post.message_id, text });
    return NextResponse.json({ ok: true, skipped: "unparsable" });
  }

  const supabase = getServiceSupabaseClient();
  const { error } = await supabase.from("parkings").upsert(
    {
      address: parsed.address,
      lat: parsed.lat,
      lng: parsed.lng,
      source_url: parsed.sourceUrl,
      telegram_post_id: post.message_id,
      is_published: true,
    },
    { onConflict: "telegram_post_id" }
  );

  if (error) {
    console.error("Ошибка записи в Supabase", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// Telegram иногда делает GET-запрос на URL вебхука при проверке — отвечаем понятным сообщением
export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "Это эндпоинт для Telegram-вебхука, используйте POST.",
  });
}
