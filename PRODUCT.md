# PRODUCT.md — Foundry Agent Tab for Microsoft Teams

## Register

**Product.** This is app UI inside another app. The user is in a task (asking a work
question), not admiring a page. Design serves the task and disappears into it.

## What this is

A Microsoft Teams **personal tab** that lets employees chat with the AI agents their
platform team built in Microsoft Foundry — without leaving Teams, and without the
platform team writing a bot.

It is the companion demo for the book *Microsoft Foundry: The A-to-Z Guide to Building
and Governing Enterprise AI Agents* (Jannik Reinhard, 2026). Chapter 20 covers the
supported publishing path (Publish → Teams and Microsoft 365 Copilot). This repo shows
the other path: when you want your own surface, your own layout, and full control over
what the user sees.

## Who uses it

1. **The employee** (primary): an IT-literate office worker in Teams all day. Wants an
   answer, a source, and to move on. Never heard of the Responses API.
2. **The IT pro / architect** (the reader): clones this repo to see how a Teams tab
   talks to Foundry Agent Service, how auth flows, and what a tool call looks like on
   the wire. Judges the code as much as the UI.

## The scene

An IT admin has three minutes between two meetings. Teams is already open, most likely
in the org's default light theme, on a 27" monitor with the channel list on the left.
They pop into the tab, ask "why is this device non-compliant", read the answer, click
the citation, and leave. The interface has to load fast, look like it belongs in Teams,
and make the answer and its source unmissable.

That scene decides the theme: **the tab follows the Teams theme** (default, dark, high
contrast). It never picks a mood of its own. A tab that is dark inside a light Teams
looks broken, not designed.

## What makes this one good

- **The agent is a first-class object.** You pick an agent the way you pick a chat.
  Each one shows what it can do before you type.
- **Honesty about grounding.** Every answer shows which tools actually ran and where
  the facts came from. This is the lesson from the book: an agent with a knowledge base
  and web search will answer confidently from the wrong one. The UI makes that visible
  instead of hiding it.
- **It streams.** Tokens appear as they are generated. No spinner staring contest.

## Brand personality

Jannik's community palette (navy `#081427`, blue `#0A5FC0`, cyan `#4ADEDD`) meets Teams'
own vocabulary. The tab reads as a native Teams surface with a distinct, calm accent —
not as a purple Teams clone, not as a landing page.

Voice: plain, short, helpful. Same as the book. No "🚀 Ask me anything!".

## Anti-references

- **Teams purple everywhere.** Copying Teams' brand color makes the tab look like a
  half-finished Microsoft feature. Ours has its own accent.
- **The ChatGPT clone.** Centered column, big empty canvas, floating input, no context.
  It throws away everything that makes an enterprise agent trustworthy: which agent,
  which tools, which sources.
- **The SaaS AI landing page inside a tab.** Gradient hero, "Powered by AI" badge,
  glass cards. This is a tool, not a pitch.
- **Loading spinners in the middle of the content.** Skeletons and streaming instead.

## Design principles

1. **Answer first, chrome second.** The message column owns the space.
2. **Show the plumbing, quietly.** Tool chips and citations are always available,
   never shouting.
3. **Every state is designed.** Empty, loading, streaming, error, no-agents,
   rate-limited. The book spends a chapter on what goes wrong; the demo should not
   pretend nothing does.
4. **Theme is the host's decision, not ours.**
5. **Keyboard-first.** Enter sends, Shift+Enter breaks, ⌘/Ctrl+K switches agent.

## Accessibility

WCAG 2.2 AA. Body text ≥4.5:1 in all three Teams themes. Full keyboard path. Live
region for streaming answers so screen readers hear them. Respects
`prefers-reduced-motion`.
