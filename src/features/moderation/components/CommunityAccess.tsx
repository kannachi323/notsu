import type { useModerationAccess } from "../useModerationAccess";
import { Button, ButtonLink, Cluster, Notice, Panel } from "../../../shared/components";
export function CommunityAccess({ access }: { access: ReturnType<typeof useModerationAccess> }) {
  return <Panel title="Community" description="Reports you submit stay private between you and authorized reviewers.">
    {access.error && <Notice tone="danger" role="alert" actions={<Button size="sm" onClick={access.refresh}>Retry</Button>}>{access.error}</Notice>}
    {access.value?.restriction && <Notice tone="warning" role="status" title="Community access is temporarily restricted">
      <p>{access.value.restriction.note}</p>
      <p>Until {new Date(access.value.restriction.until).toLocaleString()}. Your public profile, profile edits, friendships, messaging and online status are unavailable. Local play, reports and account deletion remain available.</p>
    </Notice>}
    <Cluster><ButtonLink size="sm" to="/reports">Your reports</ButtonLink>{access.value?.moderator && <ButtonLink size="sm" to="/moderation">Review reports</ButtonLink>}</Cluster>
  </Panel>;
}
