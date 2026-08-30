---
description: UI and design conventions — colors, typography, icons, spacing, layout
paths:
  - 'src/**'
---

# UI & Design Guidelines

When writing frontend code, follow these rules.

## How to approach UI work

Before writing any code, do three things in order:

**1. Visualize the screen.** Sketch the layout in your head or as an ASCII wireframe. What does the user see? What's the hierarchy — what's most important, what's secondary, what's tucked away? Where is the user coming from, and where do they go next?

**2. Write the words.** Every label, heading, description, button, empty state, error message, tooltip, and placeholder is a design decision. The words tell the user where they are, what they can do, and what will happen when they act. Write them before you write any JSX. If a screen has no words, it has no design.

**3. Then implement.** Now reach for components and classes. The visual rules below exist to serve the story the screen is telling — not the other way around.

Copy IS the interface. A screen with perfect spacing and wrong words fails. A screen with decent spacing and clear words works. Always start from what the user reads.

## Copywriting

- Write every string as if you're sitting next to the user explaining what something does. If it sounds weird out loud, rewrite it
- **Action-first buttons**: start with a verb ("View demo", not "Demo"). Never "Submit", "Confirm", or "OK" — say what the action does
- **One primary CTA per surface**: every CTA leads to the same destination. No "Start trial" + "Book demo" split
- **Never say "with AI" / "AI-powered"** — AI is how the product works, not a feature
- Use `…` (U+2026) everywhere: loading states, menu items opening dialogs, placeholders, truncation. Never `...`
- Use numerals for all numbers ("3 plans" not "three plans")
- Errors must answer: what went wrong + what to do about it. Never "Something went wrong" alone
- Tooltips: one sentence max, add context not echo the label

## Visual philosophy

Vercel/V0 aesthetic: minimal, monochromatic, content-first. Built on **shadcn** with OKLCH color tokens.

- Content carries the design — no decorative gradients, ornamental borders, or visual noise
- Monochromatic base — grays for resting/inactive states
- **Primary color for interaction only** — active sidebar items, selected states, primary CTA buttons. If it's not interactive or active, it's monochromatic
- Generous whitespace — try spacing or background color before adding borders
- Don't add shadows, color, or animation unless functionally necessary

---

## Visual reference

### Colors

- Use **semantic tokens** (`bg-primary`, `text-muted-foreground`, `border-border`), never raw color values
- All colors use OKLCH color space
- `text-foreground` for primary text, `text-muted-foreground` for secondary/helper text
- `bg-destructive` / `text-destructive` only for danger/delete actions
- `bg-primary` / `text-primary` for active/selected states and primary actions only

### Text color hierarchy

`text-muted-foreground` means "beside the point." Use it only for supplementary content — not for primary content the user came to read.

| Role | Color |
|------|-------|
| Primary content — body copy, insights, descriptions | `text-foreground` |
| Primary values — numbers, names, key terms | `text-foreground font-semibold` |
| Section labels — introduce content, are not content | `text-muted-foreground` |
| Metadata — timestamps, counts, secondary facts | `text-muted-foreground` |
| Helper text — clarifies but isn't the point | `text-muted-foreground` |

**The test:** if removing this text would cause the user to miss something meaningful, it's `text-foreground`. Never apply muted color to a full paragraph that is the primary message of a section.

### Dark sections (landing page)

Use `bg-foreground` or `bg-primary` on the section wrapper with `text-white` for content. Helper text uses `text-white/60` (60% opacity).

**TW3 OKLCH limitation:** the `/xx` opacity modifier only works on standard Tailwind colors (`white`, `black`). It does NOT work on custom OKLCH tokens (`text-primary-foreground/60` renders transparent). Always use `text-white/60`, `bg-black/10`, etc. — never `text-foreground/60` or `text-primary-foreground/60`.

### Typography

Full reference: `docs/design/typography.md`

Two surfaces, two scales:
- **Landing / marketing:** use `base/typography/` components (`TypographyH1`–`TypographyH4`). Large, responsive, uses `font-heading`
- **App / workspace:** use plain elements with utility classes. `text-sm` (13px) is the default. `text-3xl` for page titles, `text-lg` for section titles

Shared rules:
- `font-semibold` for headings, `font-medium` for labels/emphasis, `font-normal` for body
- `tabular-nums` on any column of numbers (prices, counts, percentages)
- `text-balance` on headings, `text-pretty` on paragraphs

### Icons

- **Tabler Icons React** (`@tabler/icons-react`) — never emojis as JSX text content. Use `type Icon` for icon prop types.
- Default size: `size-4` (16px). Button component auto-sizes unsized SVGs
- **Icons match the text they sit beside** — if label is `text-foreground`, icon is too
- **Anti-pattern: gray-on-gray** — never `text-muted-foreground` on `bg-muted` containers. Use `text-foreground` instead
- Muted icons only for: decorative accents, metadata alongside muted text, disclosure chevrons
- **No manual margins in buttons** — Button has `gap-2` built in. Never add `mr-2`/`ml-2` on icons

### Borders

- **Default to no border** — use spacing or background color for separation first
- **Chrome/structural boundaries** (sidebars, nav, dividers): `border-hairline`
- **Content boundaries** (tables, form fields): `border-solid`
- **Overlays** (dialogs, popovers): `border border-border`
- Cards usually have no border

### Spacing

- **24px (`p-6`, `gap-6`)** — standard spacing for pages, cards, sections
- **16px (`p-4`, `gap-4`)** — compact contexts (dense lists, sidebars, toolbars)
- **8px (`gap-2`, `p-2`)** — tight relationships (icon + label, inline groups)
- **Never use odd spacings** like `p-5` or `gap-3` without specific reason

### Border Radius

- Child radius <= parent radius (card `rounded-lg` contains buttons `rounded-md`)
- **Concentric formula:** `outer = inner + padding` — never use the same radius on a parent and its nested child
- Buttons and inputs: `rounded-md`
- Cards/panels: `rounded-lg`
- Pills (badges, tabs): `rounded-full`

### Shadows

- Cards are flat by default — no shadow
- Floating overlays: `shadow-lg`
- Outline buttons: `shadow-xs`
- Everything else: no shadow

### Interaction hierarchy

Every action has a cost. Match visual weight to importance.

| Visual weight | When to use |
|--------------|-------------|
| Plain text / link | Low-interruption inline actions |
| Icon button (ghost) | Operational utility — icon identifies the action |
| Ghost button with label | Secondary action needing a clear label |
| Outline button | Actions that deserve visibility |
| Filled button (`default`) | The **one** primary action on the page |

- **One filled button per page.** If you're adding a second, one should step down
- **Progressive disclosure:** row actions and secondary controls stay hidden until hover — `opacity-0 group-hover:opacity-100 transition-opacity`

### Actionable color rule

**Every clickable element gets `text-primary` or `bg-primary`.** If it's interactive, it's colored — never monochromatic.

| Element | Color treatment |
|---------|----------------|
| Text-only link/button | `text-primary` |
| Icon + label (clickable) | `text-primary` on icon only |
| Icon-only button | `text-primary` on icon |
| Non-interactive icon (decorative) | `text-muted-foreground` — no color |

This makes every actionable surface immediately scannable — users see what's clickable without hovering.

### Buttons

- `default` (filled, primary color) for the primary action
- `outline` for most other actions
- `ghost` for compact/inline/toolbar actions
- `destructive` **only inside confirmation dialogs**, never standalone
- Loading: keep label visible, add spinner alongside — never replace label with spinner
- Icon-only: use `size="icon"`

### Sidebar

- **All navigation items live in the sidebar body** — pages, sections, workflows
- **The shell's footer (or top-bar account slot) holds the leave affordance, then the
  account row.** Order is fixed: the leave affordance sits ABOVE settings and the
  account/profile row, and the account row is always last. Which affordance you render is
  decided by `useIsDemo()` (`src/lib/demo.ts`) and nothing else — never re-derive
  demo-ness from the pathname:
  - authenticated `/*` → "Sign out", calls `signOut()` from AuthProvider;
  - public `/demo/*` → "Exit demo" with a close icon, a plain navigation to
    `EXIT_DEMO_ROUTE` (`/`). The demo has no session, so "Sign out" is meaningless there.
  This app's workspace shell is the top-bar layout
  (`src/layouts/workspace-topbar-layout.tsx`), not a shadcn `Sidebar`, so it wires these
  primitives directly rather than mounting a shared footer component (that needs
  `SidebarProvider`). Keep it that way; don't hand-roll a logout in a demo shell.
- Inactive items are monochromatic (`text-muted-foreground` icon + label)
- Active/selected item gets primary color (`text-primary` icon + label) with a subtle `bg-primary/10` background
- Sidebar border: `border-r-hairline`

### Canvas

Documents, files, and editable content open in the canvas panel — never
inline in the chat thread. The canvas slides in alongside the chat,
splitting the view into thread (left) + canvas (right).

- **Documents** (policies, reports, drafts) open in `DocSurface` — a Tiptap
  rich text editor inside an A4-style paper card. The user can read and edit
- **PDFs** open in `PdfSurface` — view-only, centered page
- The chat thread stays visible and navigable while the canvas is open
- **Use `useCanvas().open(attachment)` to open** — never build a custom
  side panel or modal for document viewing
- Canvas supports fullscreen toggle for focused editing
- When the AI generates or references a document, it should open in the
  canvas — the chat thread shows the conversation, the canvas shows the output

```tsx
// Opening a document in the canvas from a chat message action
const { open } = useCanvas();
open({ type: 'document', title: 'Leave Policy', body: markdownContent });
```

### Dropdown Menus

- Trigger: `EllipsisIcon` (horizontal dots), never vertical
- **Every item gets an icon** — no mixing icon/no-icon items
- Destructive items go **last**, after a `DropdownMenuSeparator`, with `variant="destructive"`
- Items opening a follow-up dialog end with `…`: "Rename…", "Move to…"

### Cards

- Flat by default (no shadow)
- Spacing: `py-6` vertical, `px-6` horizontal, `gap-6` between sections
- Elevated cards (blankslate, feature highlights): `shadow-lg`

### Tables

- Use a real `<Table>`, never card-rows that mimic one
- Headers are sentence case
- Row-as-link wraps the **Name cell content** only, never the whole row
- Actions column is last, with a kebab menu (`MoreHorizontalIcon`)

### Forms

- Placeholders end with `…` (U+2026), never `...`
- Keep submit button enabled — disable only during in-flight submission with spinner
- Show errors next to the field, never block input silently
- Primary = filled `<Button>`, verb-first label ("Save Changes", "Create Thing")

### Loading & Empty States

- Skeletons: **static bars** (`bg-muted rounded` with no pulse), match final content shape
- Spinners: `Loader2` with `animate-spin text-muted-foreground` — never colored spinners
- Empty states are minimal — short sentence explaining what to do, centered in the empty area

### Badges

- Import from `components/base/badge`, **never** `components/ui/badge`
- Always subtle tinted backgrounds, never solid-filled (solid = buttons only)
- Colors: `gray` (default), `blue` (info), `amber` (warning), `red` (error), `green` (success), `purple` (special)
- Badges are metadata, not actions — never make them clickable

### Animations

- **CSS transitions for interactions** (hover, toggle, open/close) — they can be interrupted mid-animation
- **Keyframe animations for one-shot sequences** (loading states, staged enters) — they run on a fixed timeline
- **Never `transition: all`** — specify exact properties: `transition-[opacity,filter,scale]`
- Enter animations: stagger with ~100ms delay between groups
- Exit animations: short duration (150ms), subtle

---

## Anti-patterns from past builds

1. ❌ Rendering emojis as text content. ✅ Use Lucide icons
2. ❌ `<button className="rounded-lg ...">` inline. ✅ Use shadcn `<Button>`
3. ❌ Hardcoded hex `text-[#f3a4b5]`. ✅ Semantic tokens
4. ❌ Three-dot ellipsis `...`. ✅ Single character `…`
5. ❌ Two CTAs ("Start trial" + "Book demo") on the same surface. ✅ One primary CTA
6. ❌ Primary color on non-interactive elements. ✅ Primary = active/selected only
7. ❌ Settings in the sidebar body. ✅ Settings in the sidebar footer
8. ❌ Hand-rolled "Continue with Google/Apple" buttons, or restyling them with the theme
   color. ✅ The ONE brand-compliant set, `SocialAuthButtons`
   (`src/components/base/social-auth-buttons.tsx`), on every auth surface. This project
   passes `providers={['google']}` — Apple is not configured on its broker, and a button
   for an unconfigured provider can only ever error
9. ❌ A demo shell with a logout, or with no way out at all. ✅ On `/demo/*` the leave
   affordance is "Exit demo" → `EXIT_DEMO_ROUTE`, decided by `useIsDemo()`
   (`src/lib/demo.ts`). It sits above the account row, which stays last
10. ❌ Sending OAuth or an email confirmation to a bare origin or a protected route.
    ✅ Always `${window.location.origin}/auth/callback`
