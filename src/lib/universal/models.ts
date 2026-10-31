import { adapterFor } from "@/lib/universal/chat";
import { enabledProviders, type ProviderSpec } from "@/lib/universal/providers";

/**
 * The model catalogue behind GET /v1/models: each enabled provider's declared
 * and default models, plus its live list where the provider publishes one.
 * Live lists are cached per isolate; a provider that fails to answer still
 * contributes its declared models.
 */

export interface ModelEntry {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

const CACHE_MS = 5 * 60_000;
const LIVE_TIMEOUT_MS = 5_000;
const liveCache = new Map<string, { at: number; ids: string[] }>();

async function liveModels(provider: ProviderSpec): Promise<string[]> {
  if (!provider.listModels) return [];
  const cached = liveCache.get(provider.id);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.ids;
  try {
    const ids = await adapterFor(provider).listModels(provider, AbortSignal.timeout(LIVE_TIMEOUT_MS));
    liveCache.set(provider.id, { at: Date.now(), ids });
    return ids;
  } catch {
    // Unlisted is not unusable: the declared models still work.
    return cached?.ids ?? [];
  }
}

export async function listModels({ live = true } = {}): Promise<ModelEntry[]> {
  const providers = enabledProviders();
  const lists = await Promise.all(providers.map((p) => (live ? liveModels(p) : Promise.resolve([]))));
  const out: ModelEntry[] = [];
  const seen = new Set<string>();
  providers.forEach((provider, i) => {
    const ids = [provider.defaultModel, ...provider.models.map((m) => m.id), ...lists[i]].filter((id): id is string => Boolean(id));
    for (const model of ids) {
      const id = `${provider.id}/${model}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, object: "model", created: 0, owned_by: provider.id });
    }
  });
  return out;
}
