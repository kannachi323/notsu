# Project conventions

- Keep README.md focused on this project. Never name or reference other apps
  used as internal design or architecture inspiration in the README.
- Use Tauri 2 with React, TypeScript, HTML/CSS, and Vite. Use Rust for the desktop
  host and native functionality as needed. Do not add a C#/.NET or osu!framework
  dependency.
- The approved public beta targets Windows, macOS, Linux, and desktop browsers.
  Isolate platform-specific behavior and verify each target before claiming support.
- Start from the official Tauri React/TypeScript template. Preserve its standard
  startup/configuration structure and apply feature-first organization inside it.
  See `docs/setup.md`.
- Put screens, hooks, components, and state under `src/features/<feature>/`.
  Keep UI in `components/`, pure business rules in `domain/`, and external data
  loading/mapping/persistence adapters in `data/` within the owning feature.
- Keep application composition in `src/app/` and native code in `src-tauri/src/`.
- Use `src/shared/` only for code with a real shared responsibility.
- Use `notsu` for display and `notsu` for package/project names and Rust identifiers.
- Keep React components, hooks, and functions small and focused. Around 500 lines
  is a signal to review responsibilities, not an exact maximum.
- Keep domain rules independent of React, Tauri, browser storage, and API response
  objects. Do not duplicate those rules in TypeScript and Rust.
- Use narrow native commands or supported plugins for OS access. Validate inputs,
  use the minimum required capability scope, and avoid blocking UI work.
- Keep CSS and component conventions simple. Do not introduce speculative state
  libraries, interfaces, layers, dependencies, or feature folders.
- React Router and Zustand are the approved baseline for routing and shared UI
  state. Keep feature stores small and domain rules independent of both.
- Preserve semantic HTML, keyboard navigation, accessible labels, visible focus,
  and reduced-motion behavior.
- Colocate TypeScript tests with the code they exercise when tests are introduced.
  Add Rust tests alongside native behavior when needed.
- Commit one JavaScript package manager lockfile and the application's Cargo.lock.
- The approved public-beta scope includes Rhythm, skins, the manual editor, map
  library/publishing, settings, accounts, friends, private messaging, and rankings.
  Follow docs/public-beta.md and preserve the separate Trivia placeholders.
- Do not install toolchains or dependencies, compile, or run builds/tests in this
  environment unless the user explicitly requests it.
- Preserve the Moku-iOS design reference notes in `docs/direction.md`. Confirm
  current references before substantial UI work; do not copy official osu! UI.
- Trivia remains a planned casual feature of the broader companion. Preserve its
  feature boundary; do not create a general game framework.
- Accounts use Supabase email/password authentication, with no social OAuth in
  this release. Resolve desktop and browser session storage before implementation.
  Never embed production client secrets in frontend assets or Rust binaries.
- Keep the app clearly identified as an unofficial community project, with no
  implied affiliation with ppy.
