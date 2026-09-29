import { createHashRouter, Navigate, RouterProvider } from "react-router";
import { HomeScreen } from "../features/home/components/HomeScreen";
import { RhythmScreen } from "../features/rhythm/RhythmScreen";
import { EditorScreen } from "../features/editor/components/EditorScreen";
import { MapBrowser } from "../features/maps/components/MapBrowser";
import { lazy, Suspense } from "react";

const AccountScreen = lazy(() => import("../features/accounts/components/AccountScreen").then(module => ({ default: module.AccountScreen })));
const PublicProfileScreen = lazy(() => import("../features/accounts/components/PublicProfileScreen").then(module => ({ default: module.PublicProfileScreen })));
const DeleteAccountScreen = lazy(() => import("../features/accounts/components/DeleteAccountScreen").then(module => ({ default: module.DeleteAccountScreen })));

const router = createHashRouter([
  { path: "/", element: <HomeScreen /> },
  { path: "/rhythm", element: <RhythmScreen /> },
  { path: "/editor", element: <EditorScreen /> },
  { path: "/browse", element: <MapBrowser /> },
  { path: "/account", element: <Suspense fallback={<main className="app"><p role="status">Loading account…</p></main>}><AccountScreen /></Suspense> },
  { path: "/account/delete", element: <Suspense fallback={<main className="app"><p role="status">Loading account…</p></main>}><DeleteAccountScreen /></Suspense> },
  { path: "/players/:username?", element: <Suspense fallback={<main className="app"><p role="status">Loading player…</p></main>}><PublicProfileScreen /></Suspense> },
  { path: "*", element: <Navigate to="/" replace /> },
]);
export function App() { return <RouterProvider router={router} />; }
