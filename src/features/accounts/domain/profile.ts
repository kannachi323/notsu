export interface ProfileInput {
  username: string;
  displayName: string;
  bio: string;
}

export interface Profile extends ProfileInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export function parseUsername(value: unknown): string {
  if (typeof value !== "string") throw new Error("Enter a username.");
  const name = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,19}$/.test(name)) {
    throw new Error("Use 3–20 letters, numbers or underscores, starting with a letter.");
  }
  return name;
}

/** Used by clients and the API. The database also constrains direct data access. */
export function parseProfileInput(value: unknown): ProfileInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Enter your profile details.");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["username", "displayName", "bio"].includes(key))) {
    throw new Error("Only username, display name and bio can be changed.");
  }
  const username = parseUsername(input.username);
  if (typeof input.displayName !== "string" || typeof input.bio !== "string") {
    throw new Error("Enter a display name and bio.");
  }
  const displayName = input.displayName.trim();
  const bio = input.bio.trim();
  if (!displayName || [...displayName].length > 40 || /\p{Cc}/u.test(displayName)) {
    throw new Error("Use a display name of 1–40 characters without control characters.");
  }
  if ([...bio].length > 280 || /\p{Cc}/u.test(bio.replaceAll("\n", ""))) {
    throw new Error("Use up to 280 characters in your bio, with only ordinary line breaks.");
  }
  return { username, displayName, bio };
}
