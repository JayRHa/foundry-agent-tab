# DESIGN.md — Foundry Agent Tab

## Theme

The tab has **three themes, and it does not choose between them**: `default`, `dark`,
and `contrast` come from the Teams client via the Teams JS SDK
(`app.getContext()` + `app.registerOnThemeChangeHandler`). Outside Teams (local dev,
browser) it falls back to `prefers-color-scheme`.

Implementation: one `data-theme` attribute on `<html>`, all colors as CSS custom
properties in OKLCH. No JS recoloring, no flash: the theme is applied before first
paint.

## Color

Strategy: **Restrained.** Tinted neutrals carry the surface, one accent carries action
and selection. The accent is Jannik's brand blue, not Teams purple.

| Role | Light (`default`) | Dark | Contrast |
|---|---|---|---|
| `--bg` (app shell) | `oklch(0.98 0.004 250)` | `oklch(0.21 0.012 255)` | `oklch(0 0 0)` |
| `--surface` (message column) | `oklch(1 0 0)` | `oklch(0.25 0.014 255)` | `oklch(0 0 0)` |
| `--surface-sunken` (sidebar) | `oklch(0.955 0.006 250)` | `oklch(0.18 0.012 255)` | `oklch(0 0 0)` |
| `--ink` (body) | `oklch(0.22 0.02 255)` | `oklch(0.96 0.004 250)` | `oklch(1 0 0)` |
| `--ink-muted` (meta) | `oklch(0.48 0.02 255)` | `oklch(0.74 0.012 250)` | `oklch(1 0 0)` |
| `--border` | `oklch(0.9 0.008 250)` | `oklch(0.34 0.014 255)` | `oklch(1 0 0)` |
| `--accent` | `oklch(0.52 0.16 255)` | `oklch(0.72 0.13 250)` | `oklch(0.85 0.2 220)` |
| `--accent-ink` (on accent) | `oklch(1 0 0)` | `oklch(0.18 0.02 255)` | `oklch(0 0 0)` |
| `--cyan` (agent identity) | `oklch(0.78 0.11 195)` | `oklch(0.82 0.1 195)` | `oklch(0.9 0.15 195)` |

Semantic states: `--ok`, `--warn`, `--danger` at two levels each (ink + tint). Tool
chips use `--surface-sunken` + `--border`; a chip never uses a saturated fill, because
it is metadata, not an action.

Contrast floors verified: body ≥4.5:1, muted meta ≥4.5:1 (not the usual light-gray
mistake), chips ≥4.5:1, focus ring ≥3:1 against both its inside and outside.

## Typography

One family. `Segoe UI Variable` → `Segoe UI` → `system-ui` stack: the tab must read as
a Teams surface, and Teams is Segoe. Fixed rem scale, ratio ~1.2, no fluid clamps in
app UI.

| Token | Size / weight | Use |
|---|---|---|
| `--t-display` | 1.5rem / 600 | Empty-state headline only |
| `--t-title` | 1.125rem / 600 | Agent name in the header |
| `--t-body` | 0.9375rem / 400 | Messages, input |
| `--t-label` | 0.8125rem / 600 | Sidebar labels, buttons |
| `--t-meta` | 0.75rem / 400 | Chips, timestamps, citations |
| `--t-mono` | 0.8125rem | `ui-monospace` for code and IDs |

Message column caps at 68ch. Code blocks may run wider and scroll on their own.

## Layout

App shell, 2 columns, structural responsive behavior (no fluid type):

```
┌───────────────┬────────────────────────────────────┐
│ Agent picker  │ Header: agent name · tools · reset │
│ (260px)       ├────────────────────────────────────┤
│ - search      │ Message list (scroll, 68ch)        │
│ - agent list  │   user bubble / agent answer       │
│ - status      │   tool chips + citations           │
│               ├────────────────────────────────────┤
│               │ Composer (textarea + send)         │
└───────────────┴────────────────────────────────────┘
```

- ≥900px: both columns.
- <900px: sidebar collapses to a header dropdown (Teams mobile tab).
- z-index scale: `--z-dropdown: 10`, `--z-sticky: 20`, `--z-modal: 40`, `--z-toast: 50`.

## Components

Each has default / hover / focus-visible / active / disabled / loading / error:
`Button`, `IconButton`, `AgentCard`, `Composer`, `Message`, `ToolChip`, `Citation`,
`Skeleton`, `Banner`.

- **Loading:** message skeleton, never a centered spinner.
- **Empty state:** teaches the tab — what the agent can do plus three starter prompts
  that actually run.
- **Error:** inline banner with the real cause (401 vs 403 vs 429 vs content filter),
  because the book teaches exactly that distinction.

## Motion

150–250 ms, `ease-out-quart`. Only state: message enters, chip expands, skeleton
pulses, streaming caret. No page-load choreography, no scroll reveals. Every one has a
`prefers-reduced-motion: reduce` path (crossfade or instant).

## Iconography

Inline SVG, 20px, 1.5px stroke, currentColor, single family. No icon fonts, no emoji
in the UI.
