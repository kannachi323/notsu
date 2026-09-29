import { createHashRouter, Navigate, RouterProvider } from "react-router";
import { HomeScreen } from "../features/home/components/HomeScreen";
import { RhythmScreen } from "../features/rhythm/RhythmScreen";
import { EditorScreen } from "../features/editor/components/EditorScreen";
import { MapBrowser } from "../features/maps/components/MapBrowser";
import { lazy, Suspense } from "react";
import { useAccountStore } from "../features/accounts/accountStore";

const AccountScreen = lazy(() => import("../features/accounts/components/AccountScreen").then(module => ({ default: module.AccountScreen })));
const PublicProfileScreen = lazy(() => import("../features/accounts/components/PublicProfileScreen").then(module => ({ default: module.PublicProfileScreen })));
const DeleteAccountScreen = lazy(() => import("../features/accounts/components/DeleteAccountScreen").then(module => ({ default: module.DeleteAccountScreen })));
const FriendsScreen = lazy(() => import("../features/friends/components/FriendsScreen").then(module => ({ default: module.FriendsScreen })));
const MessagesScreen = lazy(() => import("../features/messages/components/MessagesScreen").then(module => ({ default: module.MessagesScreen })));
const PresenceSession = lazy(() => import("../features/presence/components/PresenceSession").then(module => ({ default: module.PresenceSession })));
const ReportScreen = lazy(() => import("../features/moderation/components/ReportScreen").then(module => ({ default: module.ReportScreen })));
const ReportsScreen = lazy(() => import("../features/moderation/components/ReportsScreen").then(module => ({ default: module.ReportsScreen })));
const ReviewScreen = lazy(() => import("../features/moderation/components/ReviewScreen").then(module => ({ default: module.ReviewScreen })));

const router = createHashRouter([
  { path: "/", element: <HomeScreen /> },
  { path: "/rhythm", element: <RhythmScreen /> },
  { path: "/editor", element: <EditorScreen /> },
  { path: "/browse", element: <MapBrowser /> },
  { path: "/account", element: <Suspense fallback={<main className="app"><p role="status">Loading account…</p></main>}><AccountScreen /></Suspense> },
  { path: "/account/delete", element: <Suspense fallback={<main className="app"><p role="status">Loading account…</p></main>}><DeleteAccountScreen /></Suspense> },
  { path: "/players/:username?", element: <Suspense fallback={<main className="app"><p role="status">Loading player…</p></main>}><PublicProfileScreen /></Suspense> },
  { path: "/friends", element: <Suspense fallback={<main className="app"><p role="status">Loading friends…</p></main>}><FriendsScreen /></Suspense> },
  { path: "/messages/:username?", element: <Suspense fallback={<main className="app"><p role="status">Loading messages…</p></main>}><MessagesScreen /></Suspense> },
  { path: "/report/:target/:message?", element: <Suspense fallback={<main className="app"><p role="status">Loading report…</p></main>}><ReportScreen /></Suspense> },
  { path: "/reports", element: <Suspense fallback={<main className="app"><p role="status">Loading reports…</p></main>}><ReportsScreen /></Suspense> },
  { path: "/moderation", element: <Suspense fallback={<main className="app"><p role="status">Loading reviews…</p></main>}><ReportsScreen review /></Suspense> },
  { path: "/moderation/:id", element: <Suspense fallback={<main className="app"><p role="status">Loading review…</p></main>}><ReviewScreen /></Suspense> },
  { path: "*", element: <Navigate to="/" replace /> },
]);
export function App() {
  const id = useAccountStore(state => state.identity?.id);
  return <><RouterProvider router={router} />{id && <Suspense fallback={null}><PresenceSession key={id} userId={id} /></Suspense>}</>;
}
