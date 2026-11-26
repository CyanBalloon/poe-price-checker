<template>
  <div v-if="supported" class="local-effects">
    <div class="settings-row">
      <div class="effects-heading">
        <strong id="item-animations-label">PoE 1 item animations</strong>
        <span class="effects-help" @mouseenter="helpOpen = true" @mouseleave="leaveHelp"
          @focusin="helpOpen = true" @focusout="helpOpen = false" @keydown.esc.stop="helpOpen = false">
          <button type="button" class="info-button" aria-label="About PoE 1 item animations"
            aria-describedby="item-animations-help" @click="helpOpen = true">i</button>
          <span v-show="helpOpen" id="item-animations-help" role="tooltip" class="effects-tooltip">
            Shows in-game effects on items such as influenced gear and fractured items. The first preview indexes your local PoE 1 files. Later checks reuse the encrypted index. Turn this off for static item art.
          </span>
        </span>
      </div>
      <button type="button" role="switch" class="settings-switch" aria-labelledby="item-animations-label"
        :aria-checked="modelValue" @click="$emit('update:modelValue', !modelValue)"></button>
    </div>
    <div v-if="modelValue" class="effects-folder">
      <span class="folder-location"><small>Game folder</small>
        <span role="status" :title="effectSource.folder">{{ message || effectSource.folder || 'Choose your PoE 1 installation.' }}</span>
      </span>
      <button class="ui-button" type="button" :disabled="choosing" @click="choose">Choose folder</button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import { chooseEffectsFolder, effectSource, refreshEffects } from "../ui/inventory/local-effects";
const props = defineProps<{ modelValue: boolean }>();
defineEmits<{ (event: "update:modelValue", enabled: boolean): void }>();
const supported = Boolean(window.localItemEffects);
const choosing = ref(false);
const message = ref("");
const helpOpen = ref(false);
watch(() => props.modelValue, enabled => {
  if (supported && enabled) refreshEffects(true);
}, { immediate: true });
function leaveHelp(event: MouseEvent) {
  if (!(event.currentTarget as HTMLElement).matches(":focus-within")) helpOpen.value = false;
}
async function choose() {
  choosing.value = true;
  message.value = "";
  try { await chooseEffectsFolder(); }
  catch { message.value = "Choose the PoE 1 folder containing the game executable."; }
  finally { choosing.value = false; }
}
</script>
<style scoped>
.effects-heading, .effects-help { display: flex; align-items: center; }
.effects-heading { position: relative; gap: .35rem; }
.info-button { display: grid; place-items: center; width: 1.6rem; height: 1.6rem; color: var(--muted); font: italic 600 .8rem Georgia, serif; }
.info-button::before { content: ""; position: absolute; width: 1rem; height: 1rem; border: 1px solid currentColor; border-radius: 50%; }
.info-button:hover, .info-button:focus-visible { color: var(--accent); }
.effects-tooltip { position: absolute; inset: 100% auto auto 0; z-index: 4; width: min(18rem, 72vw); padding: .8rem 1rem;
  border-radius: .55rem; background: var(--raised); color: var(--ink); box-shadow: 0 5px 22px #0007, 0 0 0 1px var(--line-strong); font-size: .82rem; line-height: 1.55; }
.effects-folder { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: .6rem 1rem;
  padding: .75rem .85rem; margin-bottom: .15rem; border-radius: .45rem; background: color-mix(in srgb, var(--surface) 75%, transparent); }
.folder-location { flex: 1 1 11rem; min-width: 0; color: var(--muted); font-size: .79rem; line-height: 1.4; overflow-wrap: anywhere; }
.folder-location small { display: block; margin-bottom: .15rem; font-weight: 600; color: var(--ink); font-size: .8rem; }
</style>
