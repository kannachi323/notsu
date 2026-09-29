import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptIdentity } from "../../accounts/accountStore";
import { resetPresence, usePresenceStore } from "../presenceStore";
import type { OwnPresence, Visibility } from "../domain/presence";
import { startPresenceHeartbeat } from "./heartbeat";
import { saveVisibility } from "./settings";
const mock = vi.hoisted(() => ({ renew: vi.fn(), setting: vi.fn() }));
vi.mock("./presence", () => ({ renewPresence: mock.renew, setVisibility: mock.setting }));
const owner = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
describe("app presence lifetime", () => {
  beforeEach(() => { vi.useFakeTimers(); acceptIdentity({ id: owner, email: "local@example.test" }); resetPresence(owner); mock.renew.mockResolvedValue({ visibility: "friends", validForMs: 89000 }); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.resetAllMocks(); acceptIdentity(null); resetPresence(null); });
  it("renews visible windows every 30 seconds and gives each instance independent ordering", async () => {
    const first = startPresenceHeartbeat(owner, () => true), second = startPresenceHeartbeat(owner, () => true);
    await vi.advanceTimersByTimeAsync(30000);
    expect(mock.renew).toHaveBeenCalledTimes(4);
    const inputs = mock.renew.mock.calls.map(call => call[1]);
    expect(inputs[0].clientId).not.toBe(inputs[1].clientId); expect(inputs.map(input => input.sequence)).toEqual([1, 1, 2, 2]);
    first.stop(); second.stop();
  });
  it("releases immediately on hiding, ignores late online acknowledgements and stops renewing", async () => {
    const delayed = deferred<OwnPresence>(); mock.renew.mockReturnValueOnce(delayed.promise).mockResolvedValue({ visibility: "friends", validForMs: 0 });
    let visible = true; const heartbeat = startPresenceHeartbeat(owner, () => visible);
    visible = false; heartbeat.release(); await vi.advanceTimersByTimeAsync(0);
    delayed.resolve({ visibility: "friends", validForMs: 89000 }); await vi.advanceTimersByTimeAsync(60000);
    expect(usePresenceStore.getState().connected).toBe(false); expect(mock.renew).toHaveBeenCalledTimes(2);
    expect(mock.renew.mock.calls[1]).toMatchObject([owner, { sequence: 2, visible: false }, true]);
    heartbeat.stop(); await vi.advanceTimersByTimeAsync(60000); expect(mock.renew).toHaveBeenCalledTimes(3);
  });
  it("does not overlap routine pulses but permits a forced setting refresh", () => {
    mock.renew.mockReturnValue(new Promise(() => {})); const heartbeat = startPresenceHeartbeat(owner, () => true);
    heartbeat.pulse(); expect(mock.renew).toHaveBeenCalledTimes(1);
    heartbeat.pulse(true); expect(mock.renew).toHaveBeenCalledTimes(2); heartbeat.stop();
  });
  it("cannot restore a prior account after identity changes", async () => {
    const pending = deferred<OwnPresence>(); mock.renew.mockReturnValueOnce(pending.promise);
    const heartbeat = startPresenceHeartbeat(owner, () => true);
    acceptIdentity({ id: other, email: "other@example.test" }); resetPresence(other); heartbeat.stop();
    pending.resolve({ visibility: "friends", validForMs: 89000 }); await vi.advanceTimersByTimeAsync(60000);
    expect(usePresenceStore.getState()).toMatchObject({ userId: other, visibility: null, connected: false }); expect(mock.renew).toHaveBeenCalledOnce();
  });
  it("retains the confirmed preference during a failed save and rejects an old heartbeat response", async () => {
    usePresenceStore.setState({ visibility: "friends" });
    const old = deferred<OwnPresence>(); mock.renew.mockReturnValueOnce(old.promise); const heartbeat = startPresenceHeartbeat(owner, () => true);
    mock.setting.mockRejectedValueOnce(new Error("offline")); await saveVisibility("hidden");
    old.resolve({ visibility: "hidden", validForMs: 0 }); await vi.advanceTimersByTimeAsync(0);
    expect(usePresenceStore.getState()).toMatchObject({ visibility: "friends", saving: false, error: "offline", refresh: 1 }); heartbeat.stop();
  });
  it("waits for setting confirmation, suppresses duplicate writes and refreshes after saving", async () => {
    usePresenceStore.setState({ visibility: "hidden" }); const setting = deferred<Visibility>(); mock.setting.mockReturnValueOnce(setting.promise);
    const save = saveVisibility("friends"); await saveVisibility("friends");
    expect(mock.setting).toHaveBeenCalledOnce(); expect(usePresenceStore.getState()).toMatchObject({ visibility: "hidden", saving: true });
    setting.resolve("friends"); await save;
    expect(usePresenceStore.getState()).toMatchObject({ visibility: "friends", saving: false, connected: false, generation: 2, refresh: 1 });
  });
  it("discards a pending visibility save after changing account", async () => {
    const setting = deferred<Visibility>(); mock.setting.mockReturnValueOnce(setting.promise); const save = saveVisibility("friends");
    acceptIdentity({ id: other, email: "other@example.test" }); resetPresence(other); setting.resolve("friends"); await save;
    expect(usePresenceStore.getState()).toMatchObject({ userId: other, visibility: null, refresh: 0 });
  });
});
