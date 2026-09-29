const gameplayCodes = /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Space|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|IntlBackslash|NumpadDecimal|NumpadAdd|NumpadSubtract|NumpadMultiply|NumpadDivide)$/;

export function isGameplayKey(event: {
  code: string; repeat: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean;
}): boolean {
  return gameplayCodes.test(event.code) && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
}
