import { Link } from "react-router";
import type { useModerationAccess } from "../useModerationAccess";
export function CommunityAccess({ access }: { access: ReturnType<typeof useModerationAccess> }) {
  return <section className="account-panel community-access" aria-label="Community access"><h2>Community</h2>
    {access.error && <p role="alert" className="account-error">{access.error} <button onClick={access.refresh}>Retry</button></p>}
    {access.value?.restriction && <div className="account-notice" role="status"><h3>Community access is temporarily restricted</h3><p>{access.value.restriction.note}</p><p>Until {new Date(access.value.restriction.until).toLocaleString()}. Your public profile, profile edits, friendships, messaging and online status are unavailable. Local play, reports and account deletion remain available.</p></div>}
    <div className="account-actions"><Link className="account-guest" to="/reports">Your reports →</Link>{access.value?.moderator && <Link className="account-guest" to="/moderation">Review reports →</Link>}</div>
  </section>;
}
