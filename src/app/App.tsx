import { HashRouter, Navigate, Route, Routes } from "react-router";
import { HomeScreen } from "../features/home/components/HomeScreen";
import { RhythmScreen } from "../features/rhythm/RhythmScreen";

export function App() {
  return <HashRouter>
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/rhythm" element={<RhythmScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </HashRouter>;
}
