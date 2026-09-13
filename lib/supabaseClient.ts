import { createClient } from "@supabase/supabase-js";

/**
 * Публичный клиент — используется во фронтенде для чтения опубликованных
 * парковок. Работает с анонимным ключом, который ограничен RLS-политикой
 * в supabase/schema.sql (только select, только is_published = true).
 */
export function getPublicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Не заданы NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  return createClient(url, anonKey);
}

/**
 * Серверный клиент с service_role ключом — обходит RLS, может писать в таблицу.
 * Используется ТОЛЬКО в серверных route handler'ах (например telegram-webhook),
 * никогда не должен попадать в код, который выполняется в браузере.
 */
export function getServiceSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Не заданы NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

export type ParkingRow = {
  id: number;
  address: string;
  lat: number | null;
  lng: number | null;
  source_url: string | null;
  telegram_post_id: number | null;
  is_published: boolean;
  created_at: string;
};
