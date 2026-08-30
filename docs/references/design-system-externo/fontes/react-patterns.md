---
description: React frontend conventions — components, state, styling, TypeScript
paths:
  - 'src/**'
---

# React & Frontend Patterns Reference

Read this before writing any frontend code.

---

## File Naming (CRITICAL)

**All frontend files use kebab-case (including folders):**

```
✅ ticket-queue.tsx
✅ use-auto-cycle.ts
✅ csat-chart.tsx

❌ TicketQueue.tsx
❌ useAutoCycle.ts
❌ CSATChart.tsx
```

When renaming files, use `git mv` to preserve history:

```bash
git mv TicketQueue.tsx ticket-queue.tsx
```

---

## Page-Based Architecture

Frontend is organized by pages. Each page is a self-contained folder:

```
src/pages/
├── landing/
│   ├── index.tsx            # Route entry — thin, composes components
│   └── components/          # Components ONLY for this page
├── app/
│   ├── index.tsx
│   └── components/
└── workspace/
    ├── index.tsx
    └── components/
```

**Key principles:**

- Each page folder is self-contained
- Components in page folders are NOT shared
- Extract to `components/` only when used by 3+ call sites across pages
- `index.tsx` is thin — it composes, it doesn't contain complex UI

---

## Component Folder Hierarchy

```
pages/<name>/components/    ← build here first (page-scoped)
         ↓ 3rd use
components/                 ← shared across pages (domain-specific OK)
         ↓ generality test
components/base/            ← primitives another product could use
```

1. **Start in the page** — build components in `pages/<name>/components/`
2. **Extract on 3rd use** — only when 3+ call sites across pages need it
3. **Make it generic** — remove page-specific logic when extracting
4. **Generality test for base/** — would another product use this? Yes → base. No → components root

```tsx
// Step 1: Page-specific component
// pages/dashboard/components/ticket-queue.tsx
export function TicketQueue({ tickets }: { tickets: Ticket[] }) {
  return <DataTable data={tickets} columns={columns} />;
}

// Step 2: Extract when 3+ pages need a generic data list
// components/data-list.tsx
export function DataList<T>({ items, renderItem }: DataListProps<T>) {
  return <div>{items.map(renderItem)}</div>;
}
```

---

## Layout Routes

Layouts live in `src/layouts/` and wrap pages via React Router's `<Outlet />`:

```tsx
// App.tsx — two layout shells
<Route element={<ApplicationLayout />}>
  <Route path="/" element={<Landing />} />
  <Route path="/app" element={<AppPage />} />
</Route>
<Route element={<WorkspaceLayout />}>
  <Route path="/workspace" element={<Workspace />} />
</Route>
```

Pages render inside `<Outlet />`. They don't import or know about
the layout that wraps them.

---

## Shadcn Component Usage

**DO NOT modify `components/ui/` files** — these are shadcn defaults.

```tsx
// ✅ Use composition
<Card>
  <CardHeader>
    <CardTitle>Settings</CardTitle>
  </CardHeader>
  <CardContent>
    <Button variant="outline">Save</Button>
  </CardContent>
</Card>
```

**Need custom behavior?** Create a branded wrapper in `components/base/`.
Import from `ui/`, extend with your defaults, re-export:

```tsx
// components/base/button.tsx — adds tooltip support
import { Button as ShadcnButton } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ButtonProps extends React.ComponentProps<typeof ShadcnButton> {
  tooltip?: React.ReactNode;
}

const Button = ({ tooltip, ...props }: ButtonProps) => {
  return tooltip ? (
    <TooltipWrapper tooltip={tooltip}>
      <ShadcnButton {...props} />
    </TooltipWrapper>
  ) : (
    <ShadcnButton {...props} />
  );
};

export default Button;
```

```tsx
// components/base/badge.tsx — adds color variants
import { Badge as ShadcnBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type BadgeColor = 'gray' | 'blue' | 'amber' | 'red' | 'green' | 'purple';

const colorStyles: Record<BadgeColor, string> = {
  gray: 'bg-gray-100 text-gray-700 border-transparent',
  blue: 'bg-blue-50 text-blue-700 border-transparent',
  green: 'bg-green-50 text-green-700 border-transparent',
  // ...
};

const Badge = ({ color = 'gray', className, ...props }: BadgeProps) => {
  return <ShadcnBadge variant="outline" className={cn(colorStyles[color], className)} {...props} />;
};

export { Badge };
```

```tsx
// components/base/card.tsx — removes default shadow
import { Card as ShadcnCard, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const Card = ({ className, ...props }: React.ComponentProps<typeof ShadcnCard>) => {
  return <ShadcnCard className={cn('[&]:shadow-none', className)} {...props} />;
};

export { Card, CardHeader, CardTitle, CardContent };
```

**The pattern:** import the shadcn component as `ShadcnX`, extend props or
defaults, re-export as `X`. Consumers import from `base/`, never from `ui/`
directly. The shadcn source stays untouched.

**Install new components from the registry:**

```bash
npx shadcn@latest add <component>    # Don't npm install
```

---

## AI Elements Usage

**DO NOT modify `components/ai-elements/` files** — use them as-is.

```tsx
// ✅ Import and compose
import { Conversation } from '@/components/ai-elements/conversation';
import { Message } from '@/components/ai-elements/message';
import { PromptInput } from '@/components/ai-elements/prompt-input';
```

**Need custom behavior?** Same pattern as shadcn — branded wrapper in
`components/base/`:

```tsx
// components/base/composer.tsx — branded wrapper around prompt-input
import { PromptInput } from '@/components/ai-elements/prompt-input';

export function Composer({ onSubmit, ...props }: ComposerProps) {
  return (
    <PromptInput
      placeholder="What would you like to do?"
      onSubmit={onSubmit}
      {...props}
    />
  );
}
```

Extend through wrapping, never modify the source. The wrapper passes
the generality test → `base/`. A page-specific composition that doesn't
generalize → `pages/<name>/components/`.

---

## Seed Data Conventions

All demo data lives in `src/data/seed.ts` as typed TypeScript fixtures:

```tsx
// ✅ Typed fixture mirroring API shape
export const tickets: Ticket[] = [
  { id: 101, customer: 'Acme Corp', issue: 'Billing dispute', status: 'open' },
];

// ❌ Inline mock data in components
const tickets = [{ id: 1, customer: 'Test', issue: 'Test issue' }];
```

- Minimal: one conversation per workflow, 5–7 items per list
- Verbatim strings from the spec — never placeholder text
- Components consume the type, not the source — swapping seed for
  real data changes the provider, not the component

---

## When NOT to Use useEffect

| Anti-pattern                   | Better approach                      |
| ------------------------------ | ------------------------------------ |
| Computing derived data         | Calculate during render or `useMemo` |
| Event-triggered logic          | Keep in event handlers               |
| Fetching on user action        | Trigger in handler, not Effect       |
| Resetting state on prop change | Use `key` prop to remount            |
| Chained Effects                | Calculate everything in one place    |

```tsx
// ❌ BAD
const [filtered, setFiltered] = useState([]);
useEffect(() => {
  setFiltered(items.filter((i) => i.active));
}, [items]);

// ✅ GOOD
const filtered = useMemo(() => items.filter((i) => i.active), [items]);
```

**Valid useEffect uses:**

- Fetching data on mount (with cleanup)
- Setting up subscriptions/event listeners (with cleanup)
- Syncing with external systems (DOM, third-party libs)

---

## Styling & Text Colors

**Prefer semantic colors:**

```
text-foreground          // Primary text
text-muted-foreground    // Secondary text
text-destructive         // Error states
text-primary             // Brand color highlights
```

**Avoid hard-coded grays:**

```
text-gray-400    → text-muted-foreground
text-gray-700    → text-foreground
bg-[#1a1a1a]     → bg-background
```

Full styling rules: `.claude/rules/ui-guidelines.md`

---

## TypeScript Guidelines

```typescript
// Prefer interfaces for object shapes
interface Ticket {
  id: number;
  customer: string;
  issue: string;
  status: 'open' | 'pending' | 'resolved';
}

// Use type for unions and intersections
type Priority = 'urgent' | 'high' | 'normal';

// Avoid any, use unknown for truly unknown types
function processData(data: unknown): void {
  if (typeof data === 'string') {
    console.log(data.toUpperCase());
  }
}
```

**Naming conventions:**

- PascalCase for types and interfaces
- camelCase for variables and functions
- kebab-case for file names
- Descriptive names with auxiliary verbs (isLoading, hasError)

---

## Anti-patterns from past builds

1. ❌ Building all components inline in page files. ✅ Use `pages/<name>/components/`
2. ❌ Modifying `components/ui/` or `components/ai-elements/`. ✅ Wrap in `base/`
3. ❌ Inlining `<button className="rounded-full px-8 ...">`. ✅ Use shadcn `Button`
4. ❌ Building a static feature grid when a cycler-nav showcase exists. ✅ Reuse existing patterns
5. ❌ Creating parallel new files alongside originals. ✅ Rename + content-swap
6. ❌ Using `useEffect` to compute derived state. ✅ `useMemo` or compute during render
7. ❌ Hardcoding strings in components. ✅ Use `data/seed.ts`
8. ❌ Using PascalCase file names. ✅ kebab-case everywhere
