import { createHashRouter, Navigate, RouterProvider } from "react-router";
import { HomeScreen } from "../features/home/components/HomeScreen";
import { RhythmScreen } from "../features/rhythm/RhythmScreen";
import { EditorScreen } from "../features/editor/components/EditorScreen";

const router = createHashRouter([
  { path: "/", element: <HomeScreen /> },
  { path: "/rhythm", element: <RhythmScreen /> },
  { path: "/editor", element: <EditorScreen /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);
export function App() { return <RouterProvider router={router} />; }
