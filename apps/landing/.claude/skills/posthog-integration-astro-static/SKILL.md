---
name: integration-astro-static
description: PostHog integration for static Astro sites using SSG
metadata:
  author: PostHog
  version: 1.6.1
---

# PostHog integration for Astro (Static)

This skill helps you add PostHog analytics to Astro (Static) applications.

## Workflow

Follow these steps in order to complete the integration:

1. `basic-integration-1.0-begin.md` - PostHog Setup - Begin ← **Start here**
2. `basic-integration-1.1-edit.md` - PostHog Setup - Edit
3. `basic-integration-1.2-revise.md` - PostHog Setup - Revise
4. `basic-integration-1.3-conclude.md` - PostHog Setup - Conclusion

## Reference files

- `EXAMPLE.md` - Astro (Static) example project code
- `astro.md` - Astro - docs
- `identify-users.md` - Identify users - docs
- `basic-integration-1.0-begin.md` - PostHog setup - begin
- `basic-integration-1.1-edit.md` - PostHog setup - edit
- `basic-integration-1.2-revise.md` - PostHog setup - revise
- `basic-integration-1.3-conclude.md` - PostHog setup - conclusion

The example project shows the target implementation pattern. Consult the documentation for API details.

## Key principles

- **Environment variables**: Always use environment variables for PostHog keys. Never hardcode them.
- **Minimal changes**: Add PostHog code alongside existing integrations. Don't replace or restructure existing code.
- **Match the example**: Your implementation should follow the example project's patterns as closely as possible.

## Framework guidelines

- Always use the is:inline directive on PostHog script tags to prevent Astro from processing them and causing TypeScript errors
- Use PUBLIC_ prefix for client-side environment variables in Astro (e.g., PUBLIC_POSTHOG_KEY)
- Create a posthog.astro component in src/components/ for reusable initialization across pages
- Import the PostHog component in a Layout and wrap all pages with that layout
- Remember that source code is available in the node_modules directory
- Check package.json for type checking or build scripts to validate changes
- posthog-js is the JavaScript SDK package name

## Identifying users

Identify users during login and signup events. Refer to the example code and documentation for the correct identify pattern for this framework. If both frontend and backend code exist, pass the client-side session and distinct ID using `X-POSTHOG-DISTINCT-ID` and `X-POSTHOG-SESSION-ID` headers to maintain correlation.

## Error tracking

Add PostHog error tracking to relevant files, particularly around critical user flows and API boundaries.
