import type { ReactNode } from "react";
import { AppScreen } from "../../home/components/AppScreen";
import { Page, PageHeader } from "../../../shared/components";
import "../moderation.css";

export function ModerationLayout({ title, description, back = { to: "/account", label: "Your account" }, actions, children }: {
  title: string; description?: ReactNode; back?: { to: string; label: string }; actions?: ReactNode; children: ReactNode;
}) {
  return <AppScreen><Page>
    <PageHeader back={back} icon="flag" title={title} description={description} actions={actions} />
    {children}
  </Page></AppScreen>;
}
