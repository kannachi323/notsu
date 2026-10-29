import { createHashRouter, Navigate, RouterProvider } from "react-router";
import { HomeScreen } from "../features/home/components/HomeScreen";
import { PreferencesScreen } from "../features/rhythm/components/PreferencesScreen";
import { EditorScreen } from "../features/editor/components/EditorScreen";
import { MapBrowser } from "../features/maps/components/MapBrowser";
import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { useAccountStore } from "../features/accounts/accountStore";
import { Loading } from "../shared/components";
import { onlineAvailable } from "../features/accounts/data/availability";

const PublishScreen = lazy(() => import("../features/maps/components/PublishScreen").then(module => ({ default: module.PublishScreen })));
const AccountScreen = lazy(() => import("../features/accounts/components/AccountScreen").then(module => ({ default: module.AccountScreen })));
const PublicProfileScreen = lazy(() => import("../features/accounts/components/PublicProfileScreen").then(module => ({ default: module.PublicProfileScreen })));
const DeleteAccountScreen = lazy(() => import("../features/accounts/components/DeleteAccountScreen").then(module => ({ default: module.DeleteAccountScreen })));
const FriendsScreen = lazy(() => import("../features/friends/components/FriendsScreen").then(module => ({ default: module.FriendsScreen })));
const MessagesScreen = lazy(() => import("../features/messages/components/MessagesScreen").then(module => ({ default: module.MessagesScreen })));
const PresenceSession = lazy(() => import("../features/presence/components/PresenceSession").then(module => ({ default: module.PresenceSession })));
const ReportScreen = lazy(() => import("../features/moderation/components/ReportScreen").then(module => ({ default: module.ReportScreen })));
const ReportsScreen = lazy(() => import("../features/moderation/components/ReportsScreen").then(module => ({ default: module.ReportsScreen })));
const ReviewScreen = lazy(() => import("../features/moderation/components/ReviewScreen").then(module => ({ default: module.ReviewScreen })));

const ComponentSheet = import.meta.env.DEV ? lazy(() => import("./ComponentSheet").then(module => ({ default: module.ComponentSheet }))) : null;

// Offline builds send online-only routes home instead of showing dead ends.
const online = (element: ReactNode) => onlineAvailable ? element : <Navigate to="/" replace />;
const loading = (label: string) => <main className="ui-page"><Loading>{label}</Loading></main>;

const router = createHashRouter([
  { path: "/", element: <HomeScreen /> },
  { path: "/rhythm", element: <MapBrowser key="select" view="select" /> },
  { path: "/settings", element: <PreferencesScreen /> },
  { path: "/how-to-play", element: <PreferencesScreen help /> },
  { path: "/editor", element: <EditorScreen /> },
  { path: "/browse", element: <MapBrowser key="browse" view="browse" /> },
  { path: "/publish", element: online(<Suspense fallback={loading("Loading publishing…")}><PublishScreen /></Suspense>) },
  { path: "/account", element: online(<Suspense fallback={loading("Loading account…")}><AccountScreen /></Suspense>) },
  { path: "/account/delete", element: online(<Suspense fallback={loading("Loading account…")}><DeleteAccountScreen /></Suspense>) },
  { path: "/players/:username?", element: online(<Suspense fallback={loading("Loading player…")}><PublicProfileScreen /></Suspense>) },
  { path: "/friends", element: online(<Suspense fallback={loading("Loading friends…")}><FriendsScreen /></Suspense>) },
  { path: "/messages/:username?", element: online(<Suspense fallback={loading("Loading messages…")}><MessagesScreen /></Suspense>) },
  { path: "/report/:target/:message?", element: online(<Suspense fallback={loading("Loading report…")}><ReportScreen /></Suspense>) },
  { path: "/reports", element: online(<Suspense fallback={loading("Loading reports…")}><ReportsScreen /></Suspense>) },
  { path: "/moderation", element: online(<Suspense fallback={loading("Loading reviews…")}><ReportsScreen review /></Suspense>) },
  { path: "/moderation/:id", element: online(<Suspense fallback={loading("Loading review…")}><ReviewScreen /></Suspense>) },
  ...(ComponentSheet ? [{ path: "/ui", element: <Suspense fallback={loading("Loading interface sheet…")}><ComponentSheet /></Suspense> }] : []),
  { path: "*", element: <Navigate to="/" replace /> },
]);
export function App() {
  const id = useAccountStore(state => state.identity?.id);
  return <><RouterProvider router={router} />{id && <Suspense fallback={null}><PresenceSession key={id} userId={id} /></Suspense>}</>;
}
