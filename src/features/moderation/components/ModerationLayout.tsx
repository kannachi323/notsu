import type { ReactNode } from "react";
import { Link } from "react-router";
import { HomeHeader } from "../../home/components/HomeHeader";
import "../../accounts/accounts.css";
import "../moderation.css";
export function ModerationLayout({ title, children }: { title: string; children: ReactNode }) {
  return <div className="notsu-home account-screen"><HomeHeader/><main className="account-main moderation-main">
    <header className="account-heading"><Link to="/account">← Your account</Link><h1>{title}</h1></header>{children}
  </main><footer className="notsu-footer">Unofficial community project · Not affiliated with ppy</footer></div>;
}
