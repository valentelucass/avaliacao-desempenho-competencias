 

# Auth

> **⚠️ Three rules that are shipped code, not suggestions:**
>
> - **SSO buttons:** render `<SocialAuthButtons>` from
>   `@/components/base/social-auth-buttons` on every auth surface. Never hand-roll
>   "Continue with Google", and never restyle it with the theme color. OAuth goes through
>   the Lovable managed broker inside that component — never
>   `supabase.auth.signInWithOAuth`, which fails with "missing OAuth secret".
> - **Providers:** this project passes `providers={['google']}`. Google is the only
>   provider configured on its broker. Shipping an Apple button here would ship a control
>   that can only error.
> - **Redirect:** always `${window.location.origin}/auth/callback` — never a bare origin
>   (strands the user on the marketing landing) and never a protected route like `/pages`
>   (races `ProtectedRoute`, which bounces the user back to `/auth` before the code has
>   been exchanged).

Auth is real Supabase auth — Google SSO plus email/password. It is not simulated, not
deferred, not a SPEC-GAP.

---

## Route table

| Route                                | Tree      | What it is                                                                                       |
| ------------------------------------ | --------- | ------------------------------------------------------------------------------------------------ |
| `/`                                | public    | Marketing landing. Also`EXIT_DEMO_ROUTE`.                                                      |
| `/auth`                            | public    | Sign in / sign up / forgot password (`AuthCard`).                                              |
| `/auth/callback`                   | public    | Where OAuth and email confirmation land. Must exist —`SocialAuthButtons` hardcodes this path. |
| `/demo/pages`, `/demo/pages/:id` | public    | Seed data, no auth.                                                                              |
| `/pages`, `/pages/:id`           | protected | Supabase data, behind`ProtectedRoute`.                                                         |

`DEFAULT_AUTHED_ROUTE` (`/pages`) and `SIGNED_OUT_ROUTE` (`/auth`) live in
`src/lib/auth/constants.ts`. Post-auth navigation reads them; don't re-hardcode paths.

---

## `/auth/callback`

`src/pages/auth/callback.tsx`. The broker can hand the session back two ways — fragment
tokens (`#access_token=…&refresh_token=…`) or a PKCE `?code=…`. A callback that handles
only one strands the user whenever the client is configured for the other, so the page
establishes the session from whichever arrived, then lands the user at
`DEFAULT_AUTHED_ROUTE`. Only a genuine "no session either way" falls back to
`SIGNED_OUT_ROUTE`.

## Password reset

`resetPasswordForEmail` deliberately passes **no** `redirectTo`, so the recovery link
follows the Supabase project's Site URL. Do not point it at `/auth/callback` — that
signs the user straight in and gives them no chance to set a new password. If a
dedicated reset screen is ever added, point `redirectTo` at that screen instead.

---

## The leave affordance — sign out / exit demo

`src/layouts/workspace-topbar-layout.tsx` is mounted by BOTH route trees, so its leave
affordance is route-aware, and `useIsDemo()` (`src/lib/demo.ts`) is the ONE thing that
decides it. Never re-branch on the pathname in a component.

- **Authenticated `/*`** → "Sign out" in the account dropdown, calls `signOut()`.
- **Public `/demo/*`** → "Exit demo" with a close icon, a plain navigation to
  `EXIT_DEMO_ROUTE` (`/`). The demo has no session, so signing out would be meaningless,
  and with the account menu hidden the visitor previously had no way out at all.

Layout is fixed: the leave affordance sits ABOVE settings and the account/profile row,
and the account row is always last.

This app uses the top-bar layout, which cannot mount a shared `SidebarAccountFooter`
(that needs `SidebarProvider`), so it wires the primitives directly:

```tsx
const isDemo = useIsDemo();
...
{isDemo && (
  <Link to={EXIT_DEMO_ROUTE}>
    <IconX className="size-4" />
    Exit demo
  </Link>
)}
{!isDemo && user && (/* account dropdown, "Sign out" last */)}
```

---

## Never touch `src/integrations/lovable/`

That file is the Lovable-generated managed OAuth broker. It legitimately contains
`signInWithOAuth`. Rewriting it breaks auth.
