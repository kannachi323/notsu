export const mapDuration = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
export function mapHue(id: string) { return [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3; }
