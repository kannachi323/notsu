export function emailAddress(value: string) {
  const email = value.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  return email;
}
export function newPassword(value: string, confirmation: string) {
  if (value.length < 12 || value.length > 128) throw new Error("Use a password of 12–128 characters.");
  if (value !== confirmation) throw new Error("The passwords do not match.");
  return value;
}
export function emailCode(value: string) {
  const code = value.trim();
  if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit code from your email.");
  return code;
}
