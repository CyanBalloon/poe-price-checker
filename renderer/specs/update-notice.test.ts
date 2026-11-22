import { effectScope, nextTick, shallowRef } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateInfo } from "@ipc/types";
import { Host } from "@/web/background/IPC";
import { useUpdateNotice } from "@/web/settings/updates";

describe("update notice", () => {
  let scope: ReturnType<typeof effectScope>;
  beforeEach(() => {
    vi.useFakeTimers();
    scope = effectScope();
    Host.updateInfo = shallowRef<UpdateInfo>({ state: "initial" });
  });
  afterEach(() => {
    scope.stop();
    vi.useRealTimers();
  });

  it("times out after 15 seconds across progress and ready events", async () => {
    const notice = scope.run(useUpdateNotice)!;
    expect(notice.visible.value).toBe(false);
    Host.updateInfo.value = { state: "update-available", version: "2.0.0" };
    await nextTick();
    expect(notice.visible.value).toBe(true);
    vi.advanceTimersByTime(10_000);
    Host.updateInfo.value = { state: "downloading", version: "2.0.0", percent: 60 };
    await nextTick();
    Host.updateInfo.value = { state: "update-downloaded", version: "2.0.0" };
    await nextTick();
    expect(notice.label.value).toContain("ready to install");
    vi.advanceTimersByTime(4_999);
    expect(notice.visible.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(notice.visible.value).toBe(false);
  });

  it("dismisses an existing update and only announces a newer version again", async () => {
    Host.updateInfo.value = { state: "update-downloaded", version: "2.0.0" };
    const notice = scope.run(useUpdateNotice)!;
    expect(notice.visible.value).toBe(true);
    notice.dismiss();
    Host.updateInfo.value = { state: "checking-for-update" };
    await nextTick();
    Host.updateInfo.value = { state: "update-available", version: "2.0.0" };
    await nextTick();
    expect(notice.visible.value).toBe(false);
    Host.updateInfo.value = { state: "update-available", version: "2.0.1" };
    await nextTick();
    expect(notice.visible.value).toBe(true);
    scope.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
