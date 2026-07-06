# Agent Rules

## Always State Understanding First

Before taking any action, the agent must clearly state its understanding of the user's request in plain language.

This must happen before:

- editing files
- running commands
- copying, deleting, or moving files
- committing or pushing to GitHub
- deploying or preparing deployment
- making assumptions about scope

If the request is ambiguous, the agent must state the ambiguity and ask for clarification before acting.

If the user corrects the agent's understanding, the newest user message overrides the previous understanding.

## Scope Discipline

The agent must only do the work explicitly requested by the user. Reading or inspecting is allowed only when needed to satisfy the current request, and implementation must not expand beyond the stated scope without user approval.

## Build Discipline

When the task involves backend, Cloudflare, GitHub, or deployment, the agent must validate with the relevant build/check command before saying the work is done.