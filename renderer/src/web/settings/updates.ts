import { computed } from "vue";
import { Host } from "@/web/background/IPC";
import type { UpdateAction, UpdateInfo } from "@ipc/types";

function describe(info: UpdateInfo): { status: string; label?: string; action?: UpdateAction } {
  switch (info.state) {
    case "initial": return { status: "", label: "Check for updates", action: "check-for-update" };
    case "checking-for-update": return { status: "Checking for updates…" };
    case "update-not-available": return { status: "You’re up to date.", label: "Check again", action: "check-for-update" };
    case "update-available": return { status: `Version ${info.version} is available.`, label: "Download update", action: "download-update" };
    case "downloading": return { status: `Downloading v${info.version} · ${info.percent}%` };
    case "update-downloaded": return { status: `Version ${info.version} is ready.`, label: "Restart to update", action: "update-and-restart" };
    case "installing": return { status: "Restarting to install the update…" };
    case "error": return { status: "Update failed. Check your connection and that the app folder is writable.", label: "Retry", action: "check-for-update" };
    case "unavailable": return { status: {
      development: "Updates are available in release builds.",
      disabled: "Updates are disabled for this launch.",
      unsupported: "In-app updates are unavailable for this build.",
    }[info.reason] };
  }
}

export function useUpdateControl() {
  const control = computed(() => describe(Host.updateInfo.value));
  function run() {
    const action = control.value.action;
    if (action) Host.sendEvent({ name: "CLIENT->MAIN::user-action", payload: { action } });
  }
  return { control, run };
}
