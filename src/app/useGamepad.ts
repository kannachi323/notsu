import { useEffect } from "react";

// Standard-mapping buttons. Gameplay keys are distinct codes so that two held
// buttons own two holds, exactly like two keyboard keys.
const GAMEPLAY_CODES: Record<number, string> = { 0: "KeyJ", 1: "KeyK", 2: "KeyF", 3: "KeyD", 4: "KeyS", 5: "KeyL", 6: "KeyA", 7: "Semicolon" };
const MENU = { confirm: 0, back: 1, start: 9, up: 12, down: 13, left: 14, right: 15 } as const;
const FOCUSABLE = "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

/** Buttons that went from released to pressed (or the reverse) since the last poll. */
export function buttonEdges(previous: readonly boolean[], current: readonly boolean[]) {
  const pressed: number[] = [], released: number[] = [];
  current.forEach((down, index) => {
    if (down && !previous[index]) pressed.push(index);
    else if (!down && previous[index]) released.push(index);
  });
  return { pressed, released };
}

const key = (type: "keydown" | "keyup", code: string, target: EventTarget = window) => {
  const name = code.startsWith("Key") ? code.slice(3).toLowerCase() : code;
  return target.dispatchEvent(new KeyboardEvent(type, { code, key: name, bubbles: true, cancelable: true }));
};

function moveFocus(step: 1 | -1) {
  const items = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(item => item.offsetParent !== null);
  const index = items.indexOf(document.activeElement as HTMLElement);
  items[(index + step + items.length) % items.length]?.focus();
}

function menuPress(button: number) {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  if (button === MENU.confirm) { if (active !== document.body) active.click(); return; }
  if (button === MENU.back) { key("keydown", "Escape", active); return; }
  if (button === MENU.start) { key("keydown", "Enter", active); return; }
  const arrow = { [MENU.up]: "ArrowUp", [MENU.down]: "ArrowDown", [MENU.left]: "ArrowLeft", [MENU.right]: "ArrowRight" }[button];
  if (!arrow) return;
  // Let lists such as the song carousel handle arrows; otherwise move focus.
  const handled = !key("keydown", arrow, active);
  if (!handled && (button === MENU.up || button === MENU.down)) moveFocus(button === MENU.down ? 1 : -1);
}

/** Controller navigation and play, active only while a gamepad is connected. */
export function useGamepad() {
  useEffect(() => {
    let frame = 0;
    const previous = new Map<number, boolean[]>();
    const poll = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const playing = !!document.querySelector(".rhythm-player.is-gameplay");
      for (const pad of pads) {
        if (!pad || pad.mapping !== "standard") continue;
        const current = pad.buttons.map(button => button.pressed);
        const { pressed, released } = buttonEdges(previous.get(pad.index) ?? [], current);
        previous.set(pad.index, current);
        for (const button of pressed) {
          if (playing && GAMEPLAY_CODES[button]) key("keydown", GAMEPLAY_CODES[button]);
          else if (playing && button === MENU.start) key("keydown", "Escape");
          else if (!playing) menuPress(button);
        }
        for (const button of released) if (GAMEPLAY_CODES[button]) key("keyup", GAMEPLAY_CODES[button]);
      }
      frame = pads.some(Boolean) ? requestAnimationFrame(poll) : 0;
    };
    const connected = () => { if (!frame) frame = requestAnimationFrame(poll); };
    window.addEventListener("gamepadconnected", connected);
    if ((navigator.getGamepads?.() ?? []).some(Boolean)) connected();
    return () => { window.removeEventListener("gamepadconnected", connected); cancelAnimationFrame(frame); };
  }, []);
}
