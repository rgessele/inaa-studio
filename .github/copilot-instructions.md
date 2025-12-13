# Copilot Instructions for inaa-studio

## Project Overview

inaa-studio is a CAD pattern design tool (ferramenta para criação de projetos de modelagem) built with Next.js, TypeScript, and React Konva. The application provides an interactive canvas editor for creating and managing design patterns with authentication and database storage via Supabase.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript (strict mode enabled)
- **UI Library**: React 19.2.1
- **Graphics Engine**: React Konva ^19.2.1 and Konva ^10.0.12
- **Authentication & Database**: Supabase (@supabase/ssr, @supabase/supabase-js)
- **Styling**: Tailwind CSS 4
- **Icons**: lucide-react
- **Linting**: ESLint (Next.js config)
- **Formatting**: Prettier

## Project Structure

```
inaa-studio/
├── app/                    # Next.js App Router
│   ├── auth/              # Authentication routes (callback)
│   ├── dashboard/         # Protected dashboard
│   ├── editor/            # CAD editor interface
│   ├── login/             # Login page
│   └── layout.tsx         # Root layout
├── components/            # Reusable React components
│   └── editor/           # Canvas and editor components
├── lib/                   # Library code
│   └── supabase/         # Supabase client utilities
├── supabase/             # Database configuration
│   └── migrations/       # SQL migration files
├── middleware.ts          # Route protection middleware
└── utils/                # Utility functions
```

## Code Style Guidelines

### TypeScript

- **Strict mode**: Always enabled (`strict: true` in tsconfig.json)
- Use explicit types for function parameters and return values
- Avoid `any` types; use proper type definitions
- Use interfaces for object shapes and types for unions/aliases
- Import paths use `@/` alias for project root

### Formatting (Prettier)

- **Semicolons**: Required (`semi: true`)
- **Quotes**: Double quotes (`singleQuote: false`)
- **Print width**: 80 characters
- **Tab width**: 2 spaces
- **Trailing commas**: ES5 style
- **Arrow parens**: Always include (`arrowParens: "always"`)
- **Line endings**: LF (`endOfLine: "lf"`)

### React & Next.js Patterns

- Use App Router conventions (app directory)
- Mark components with `"use client"` when they use browser APIs (e.g., Canvas API)
- Prefer functional components with hooks
- Use React Context for state management (see EditorContext pattern)
- Follow Next.js file-based routing conventions

## Build & Development Commands

- `npm run dev` - Start development server (port 3000)
- `npm run build` - Create production build
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Authentication & Security

### Supabase Authentication

- Use `@supabase/ssr` package for Next.js App Router integration
- Create clients via `lib/supabase/client.ts` (client-side) and `lib/supabase/server.ts` (server-side)
- Support for Magic Link (email) and Google OAuth authentication
- Session management handled automatically by Supabase

### Route Protection

- Middleware (`middleware.ts`) protects all routes except `/login`, `/auth`, and `/`
- Check Supabase auth state in middleware using `lib/supabase/middleware.ts`
- Redirect unauthenticated users to `/login`

### Database Security

- Row Level Security (RLS) is enabled on all tables
- Users can only access their own data via RLS policies
- Tables: `profiles` (user data) and `projects` (design data in JSONB)

## Canvas Editor Architecture

### React Konva Integration

- Canvas component MUST be a client component (`"use client"`) due to browser Canvas API usage
- Use `react-konva` components: `Stage`, `Layer`, `Rect`, `Circle`, `Line`, etc.
- Canvas is located in `components/editor/Canvas.tsx`

### Shape Management

- All shapes (rectangles, circles, lines) stored in a single `shapes` array in EditorContext
- Shape type defined in `components/editor/types.ts`
- Use EditorContext for managing editor state (shapes, selected tool, etc.)

### Coordinate System

- Use `getRelativePointer()` to transform screen coordinates to world coordinates
- Applied in drawing tools: line, rectangle, and circle
- See `components/editor/Canvas.tsx` for implementation details

### Tool Selection

- Tool buttons in EditorToolbar use active state styling
- Active tool has primary color background and border when selected
- See `components/editor/EditorToolbar.tsx` for ToolButton component pattern

## Database Patterns

### Schema

- `profiles` table: User profile information (linked to auth.users)
- `projects` table: Design projects with `design_data` JSONB field for canvas state
- All tables have RLS enabled for user isolation

### Migrations

- SQL migrations located in `supabase/migrations/`
- Follow timestamp naming convention: `YYYYMMDDHHMMSS_description.sql`
- Refer to existing migration files for examples and patterns

## Component Patterns

### Client vs Server Components

- Default to Server Components unless browser APIs are needed
- Use `"use client"` for:
  - Canvas/Konva components (browser Canvas API)
  - Components using hooks like `useState`, `useEffect`, `useContext`
  - Event handlers (onClick, onMouseDown, etc.)

### State Management

- Use React Context for shared editor state (see EditorContext)
- Keep state close to where it's used
- Avoid prop drilling by using context appropriately

## Common Pitfalls to Avoid

1. **Canvas Components**: Always mark components using Konva/Canvas as client components
2. **Coordinate Transformation**: Always use `getRelativePointer()` for mouse coordinates in canvas
3. **Authentication**: Use appropriate Supabase client (server vs client) based on context
4. **Route Protection**: Remember middleware protects routes; handle auth redirects properly
5. **Type Safety**: Avoid `any` types; use proper TypeScript types and interfaces
6. **Formatting**: Run `npm run format` before committing to maintain code style

## Testing

- Currently no test infrastructure configured
- When adding tests, follow Next.js and React testing best practices
- Consider testing authentication flows, canvas interactions, and database operations

## Environment Variables

- Copy `.env.local.example` to `.env.local`
- Required variables for Supabase connection:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Never commit `.env.local` to version control

## Language & Documentation

- Primary language: Portuguese (pt-BR) for user-facing content
- Code comments and documentation can be in English or Portuguese
- README and user documentation in Portuguese
