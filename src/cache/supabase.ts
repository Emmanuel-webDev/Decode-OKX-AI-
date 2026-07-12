import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Address } from "viem";
import { config, features } from "../config.js";
import { logger } from "../logger.js";
import type { Assessment } from "../analyzer/pipeline.js";

/**
 * Two tables (create in Supabase Studio):
 *
 * create table assessments (
 *   id uuid primary key default gen_random_uuid(),
 *   cache_key text unique not null,
 *   proxy text not null,
 *   payload jsonb not null,
 *   created_at timestamptz default now()
 * );
 * create index assessments_proxy_idx on assessments (proxy, created_at desc);
 *
 * create table subscribers (
 *   id uuid primary key default gen_random_uuid(),
 *   telegram_chat_id bigint not null,
 *   proxy text not null,
 *   created_at timestamptz default now(),
 *   unique (telegram_chat_id, proxy)
 * );
 */

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (!features.supabase) return null;
  if (!client) {
    client = createClient(
      config.SUPABASE_URL!,
      config.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return client;
}

// In-memory fallback (for dev + demo when Supabase isn't wired yet)
const memAssessments = new Map<string, Assessment>();

export const cache = {
  async get(key: string): Promise<Assessment | null> {
    const c = getClient();
    if (!c) return memAssessments.get(key) ?? null;
    const { data, error } = await c
      .from("assessments")
      .select("payload")
      .eq("cache_key", key)
      .maybeSingle();
    if (error) {
      logger.warn({ err: error.message }, "Supabase get failed");
      return null;
    }
    return (data?.payload as Assessment) ?? null;
  },

  async set(key: string, assessment: Assessment): Promise<void> {
    const c = getClient();
    if (!c) {
      memAssessments.set(key, assessment);
      return;
    }
    const { error } = await c.from("assessments").upsert(
      {
        cache_key: key,
        proxy: assessment.proxy.toLowerCase(),
        payload: assessment,
      },
      { onConflict: "cache_key" }
    );
    if (error) logger.warn({ err: error.message }, "Supabase set failed");
  },

  async latestByProxy(proxy: Address): Promise<Assessment | null> {
    const c = getClient();
    if (!c) {
      const candidates = [...memAssessments.values()].filter(
        (a) => a.proxy.toLowerCase() === proxy.toLowerCase()
      );
      candidates.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return candidates[0] ?? null;
    }
    const { data, error } = await c
      .from("assessments")
      .select("payload")
      .eq("proxy", proxy.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      logger.warn({ err: error.message }, "Supabase latestByProxy failed");
      return null;
    }
    return (data?.payload as Assessment) ?? null;
  },
};

export const subscribers = {
  async add(chatId: number, proxy: string): Promise<void> {
    const c = getClient();
    if (!c) return;
    const { error } = await c
      .from("subscribers")
      .upsert(
        { telegram_chat_id: chatId, proxy: proxy.toLowerCase() },
        { onConflict: "telegram_chat_id,proxy" }
      );
    if (error) logger.warn({ err: error.message }, "subscribers.add failed");
  },

  async remove(chatId: number, proxy: string): Promise<void> {
    const c = getClient();
    if (!c) return;
    const { error } = await c
      .from("subscribers")
      .delete()
      .eq("telegram_chat_id", chatId)
      .eq("proxy", proxy.toLowerCase());
    if (error) logger.warn({ err: error.message }, "subscribers.remove failed");
  },

  async forChat(chatId: number): Promise<string[]> {
    const c = getClient();
    if (!c) return [];
    const { data, error } = await c
      .from("subscribers")
      .select("proxy")
      .eq("telegram_chat_id", chatId)
      .order("created_at", { ascending: false });
    if (error) {
      logger.warn({ err: error.message }, "subscribers.forChat failed");
      return [];
    }
    return (data ?? []).map((r) => r.proxy as string);
  },

  async chatsForProxy(proxy: string): Promise<number[]> {
    const c = getClient();
    if (!c) return [];
    const { data, error } = await c
      .from("subscribers")
      .select("telegram_chat_id")
      .eq("proxy", proxy.toLowerCase());
    if (error) {
      logger.warn({ err: error.message }, "chatsForProxy failed");
      return [];
    }
    return (data ?? []).map((r) => Number(r.telegram_chat_id));
  },
};
