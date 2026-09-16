import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabaseClient";
import { parseParkingPost } from "@/lib/parse";
import { callTelegramApi, sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";

type TelegramUpdate = {
  channel_post?: {
    message_id: number;
    text?: string;
    caption?: string;
    chat: { id: number; title?: string };
  };
  // Личное сообщение боту — используем, чтобы понять, что переслали
  // (форвардом) неактуальный пост из канала и хотят его удалить с карты
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number };
    forward_from_chat?: { id: number; type: string };
    forward_from_message_id?: number;
  };
  // Нажатие на кнопку "Да, удалить" / "Отмена" под сообщением-подтверждением
  callback_query?: {
    id: string;
    data?: string;
    from?: { id: number };
    message?: {
      message_id: number;
      chat: { id: number };
    };
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

  // Нажатие на кнопку подтверждения удаления
  if (update.callback_query) {
    await handleDeleteCallback(update.callback_query);
    return NextResponse.json({ ok: true });
  }

  // Новый пост в канале — существующая логика добавления парковки
  const post = update.channel_post;
  if (post) {
    return handleChannelPost(post);
  }

  // Личное сообщение боту — если это пересланный пост из канала, предлагаем удалить
  if (update.message) {
    await handleForwardedPost(update.message);
    return NextResponse.json({ ok: true });
  }

  // Telegram шлёт вебхук на любые апдейты бота — если это не то, что мы обрабатываем,
  // просто отвечаем 200 и ничего не делаем.
  return NextResponse.json({ ok: true, skipped: "unhandled update" });
}

async function handleChannelPost(post: NonNullable<TelegramUpdate["channel_post"]>) {
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

// Проверяет, что писал именно администратор (если задан TELEGRAM_ADMIN_ID) —
// иначе (переменная не задана) пропускает любого, кто знает бота, как и раньше
// работала проверка канала по TELEGRAM_CHANNEL_ID
function isAllowedAdmin(userId: number | undefined) {
  const adminId = process.env.TELEGRAM_ADMIN_ID;
  if (!adminId) return true;
  return String(userId) === adminId;
}

// Пересланный в личку боту пост из канала — считаем, что это запрос на удаление
// неактуальной парковки, и просим подтверждение перед тем, как правда её убрать
async function handleForwardedPost(message: NonNullable<TelegramUpdate["message"]>) {
  const chatId = message.chat.id;
  const forwardChatId = message.forward_from_chat?.id;
  const forwardMessageId = message.forward_from_message_id;

  if (!forwardChatId || !forwardMessageId) {
    // Обычное сообщение боту, не пересланный пост — отвечаем подсказкой
    await sendTelegramMessage(
      chatId,
      "Чтобы удалить парковку с карты, перешлите мне (форвардом) её пост из канала."
    );
    return;
  }

  if (!isAllowedAdmin(message.from?.id)) {
    // Молчим — не подтверждаем посторонним, что бот вообще что-то умеет удалять
    return;
  }

  const allowedChannelId = process.env.TELEGRAM_CHANNEL_ID;
  if (allowedChannelId && String(forwardChatId) !== allowedChannelId) {
    await sendTelegramMessage(chatId, "Этот пост не из нашего канала парковок — ничего не делаю.");
    return;
  }

  const supabase = getServiceSupabaseClient();
  const { data: parking, error } = await supabase
    .from("parkings")
    .select("id, address, is_published")
    .eq("telegram_post_id", forwardMessageId)
    .maybeSingle();

  if (error) {
    console.error("Ошибка поиска парковки для удаления", error);
    await sendTelegramMessage(chatId, "Не получилось найти запись в базе — попробуйте ещё раз чуть позже.");
    return;
  }

  if (!parking) {
    await sendTelegramMessage(
      chatId,
      "Не нашла в базе парковку с этим постом — возможно, при публикации не распознался адрес."
    );
    return;
  }

  if (!parking.is_published) {
    await sendTelegramMessage(chatId, `Парковка «${parking.address}» уже снята с публикации.`);
    return;
  }

  await callTelegramApi("sendMessage", {
    chat_id: chatId,
    text: `Удалить парковку «${parking.address}» с карты?`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Да, удалить", callback_data: `delete_yes:${parking.id}` },
          { text: "Отмена", callback_data: `delete_no:${parking.id}` },
        ],
      ],
    },
  });
}

// Нажатие на "Да, удалить" / "Отмена" под сообщением-подтверждением
async function handleDeleteCallback(query: NonNullable<TelegramUpdate["callback_query"]>) {
  const data = query.data ?? "";
  const [action, idStr] = data.split(":");
  const id = Number(idStr);
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;

  if (!chatId || !messageId || Number.isNaN(id) || !isAllowedAdmin(query.from?.id)) {
    await callTelegramApi("answerCallbackQuery", { callback_query_id: query.id });
    return;
  }

  if (action === "delete_no") {
    await callTelegramApi("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: "Отменено, парковка осталась на карте.",
    });
    await callTelegramApi("answerCallbackQuery", { callback_query_id: query.id });
    return;
  }

  if (action === "delete_yes") {
    const supabase = getServiceSupabaseClient();
    // Мягкое удаление — снимаем с публикации, а не стираем запись насовсем,
    // чтобы можно было откатить ошибочное удаление прямо в базе
    const { data: parking, error } = await supabase
      .from("parkings")
      .update({ is_published: false })
      .eq("id", id)
      .select("address")
      .maybeSingle();

    if (error) {
      console.error("Ошибка снятия парковки с публикации", error);
      await callTelegramApi("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "Не получилось удалить, попробуйте ещё раз",
        show_alert: true,
      });
      return;
    }

    await callTelegramApi("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: parking ? `Удалено: «${parking.address}» больше не на карте.` : "Удалено с карты.",
    });
    await callTelegramApi("answerCallbackQuery", { callback_query_id: query.id });
    return;
  }

  await callTelegramApi("answerCallbackQuery", { callback_query_id: query.id });
}

// Telegram иногда делает GET-запрос на URL вебхука при проверке — отвечаем понятным сообщением
export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "Это эндпоинт для Telegram-вебхука, используйте POST.",
  });
}
