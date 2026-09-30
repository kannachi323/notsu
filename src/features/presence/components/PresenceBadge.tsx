import "../presence.css";
export function PresenceBadge({ online }: { online: boolean | null }) {
  return <span className={`presence-badge${online ? " presence-online" : ""}`}><i aria-hidden="true" />{online === null ? "Status unavailable" : online ? "Online" : "Offline"}</span>;
}
