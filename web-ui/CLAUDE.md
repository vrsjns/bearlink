# web-ui

Next.js 14 frontend for BearLink.

## Commands

```bash
npm run dev        # Next.js dev server (port 3000)
npm run build      # Production build
npm run lint       # ESLint
npm run test       # Vitest (single run)
npm run test:watch # Vitest watch mode
```

## Project structure

```
src/
  app/             - Next.js App Router pages
    layout.tsx     - Root layout (NavBar + Toaster)
    page.tsx       - Home / URL shortener
    login/         - Login page
    register/      - Register page
    profile/       - Profile + password tabs
    manage/        - URL table with edit/delete
    forgot-password/
    reset-password/
  components/
    NavBar.tsx     - Top navigation bar
    ui/            - shadcn/ui component files (do not edit manually)
  lib/
    axios.ts       - Axios instance with JWT interceptor
    jwt.ts         - JWT decode helpers
    utils.ts       - cn() helper (clsx + tailwind-merge)
  services/api/
    auth.ts        - Auth service API calls
    url.ts         - URL service API calls
    analytics.ts   - Analytics service API calls
```

## Component library: shadcn/ui

The project uses [shadcn/ui](https://ui.shadcn.com/) (New York style, neutral base colour).
Component source files live in `src/components/ui/` and are owned by the project.

To add a new component:

```bash
npx shadcn@latest add <component-name>
```

Configuration is in `components.json`.

## Testing

Tests use Vitest + Testing Library + jsdom. MSW is used for API mocking in service tests.

```bash
npm test          # run all tests once
```
