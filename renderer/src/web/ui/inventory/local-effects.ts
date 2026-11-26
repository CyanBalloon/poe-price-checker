import { shallowRef } from "vue";
import type { EffectStatus } from "@ipc/local-effects";

export const effectSource = shallowRef<EffectStatus>({ supported: false });
let pending: Promise<void> | undefined;
let checked = 0;
export function refreshEffects(force = false) {
  if (!window.localItemEffects || (!force && Date.now() - checked < 5000)) return;
  pending ??= window.localItemEffects.status().then(status => {
    effectSource.value = status;
    checked = Date.now();
  }).catch(() => {}).finally(() => { pending = undefined; });
  return pending;
}
export async function chooseEffectsFolder() {
  await pending;
  if (window.localItemEffects) effectSource.value = await window.localItemEffects.chooseFolder();
}
export async function resource(revision: string, name: string) {
  const bytes = await window.localItemEffects?.resource(revision, name);
  if (!bytes?.length || revision !== effectSource.value.revision) throw Error("Local item effect unavailable");
  return bytes;
}
export async function frameId(values: unknown[]) {
  const bytes = new TextEncoder().encode(JSON.stringify(values));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}
