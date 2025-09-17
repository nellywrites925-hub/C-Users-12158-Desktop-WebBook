Project: Peeksee (simple static site)

Purpose

- This repository is a minimal static website consisting of `index.html`, `script.js`, and `style.css`.
- AI agents should focus on small, file-scoped edits, preserving minimal structure and ensuring any changes work without a build step.

Big picture

- Single-page static site. `index.html` is the entry point; it may reference `script.js` and `style.css` for behaviour and styling.
- There is no build system, package manager, or server-side code present in the repository root. Changes should assume files are served statically (e.g., opened directly or via a simple static file server).

Conventions and patterns

- Keep all behaviour in `script.js` and styling in `style.css`. `index.html` should remain the canonical markup file.
- Use small, non-invasive changes. Prefer adding feature-flagged code (e.g., guarded by an `if` or namespaced functions) rather than large rewrites.
  -- Keep global variables minimal; prefer a single top-level namespace/object if needed (example: `window.Peeksee = window.Peeksee || {}` in `script.js`).

Examples from this codebase

- `index.html` is the canonical page. If adding new UI, add markup here and hook behaviour from `script.js`.
- `script.js` currently empty — when adding code, include an initialization guard like:

```js
// script.js
window.Peeksee = window.Peeksee || {};
window.Peeksee.init = function () {
  // attach event handlers and initialize UI
};
document.addEventListener("DOMContentLoaded", window.Peeksee.init);
```

Developer workflows

- No build/test commands. To validate changes, open `index.html` in a browser or run a simple static server such as `npx http-server` from the repository root.

Edge cases and guidance

- Empty files: `script.js` and `style.css` are currently empty — safe to add small amounts of code or CSS.
- Backwards compatibility: Because this is a static site, prefer non-breaking changes to `index.html` (append new elements or wrap new features in IDs / classes that don't clash with existing selectors).

What not to do

- Do not add heavy toolchain assumptions (Webpack, TypeScript, Node.js entrypoints) unless the change adds and documents them with a clear reason.
- Avoid introducing external dependencies without updating repository documentation and noting how to run or build.

Where to document changes

- If you add developer tooling or non-trivial features, update `README.md` at the project root describing how to run the project and any new commands.

If you need more context

- Ask the human for intended behaviour (design goals, target browsers, or whether a server is expected).

Contact

- After updating, request a quick manual review: open `index.html` in a browser and confirm UI/behaviour.
