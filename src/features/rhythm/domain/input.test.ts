import { expect, it } from "vitest";
import { isGameplayKey } from "./input";
const event = { code:"KeyA",repeat:false,ctrlKey:false,altKey:false,metaKey:false,shiftKey:false };
it.each(["KeyA","KeyZ","Space","Digit3","Numpad1","Semicolon","Slash"])("accepts %s", code => {
  expect(isGameplayKey({...event,code})).toBe(true);
});
it.each(["Escape","Tab","Enter","ShiftLeft","ArrowLeft","F5"])("ignores %s", code => {
  expect(isGameplayKey({...event,code})).toBe(false);
});
it.each(["repeat","ctrlKey","altKey","metaKey","shiftKey"])("ignores %s", flag => {
  expect(isGameplayKey({...event,[flag]:true})).toBe(false);
});
