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
- **PDF Generation**: jsPDF ^3.0.4
- **Testing**: Playwright ^1.57.0 (E2E tests)
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
- `npm run test:e2e` - Run Playwright E2E tests
- `npm run test:e2e:ui` - Run Playwright tests with UI
- `npm run test:e2e:debug` - Debug Playwright tests

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

### Shape Management (Figure-Based Model v2)

- All shapes are now "figures" with a node-edge graph structure
- Figure type defined in `components/editor/types.ts`
- Each figure has:
  - `nodes`: Array of points with control handles for Bezier curves
  - `edges`: Connections between nodes (line or cubic Bezier)
  - `tool`: Original drawing tool used (for export filtering)
  - Transform properties: position (x, y), rotation
  - Style properties: stroke, strokeWidth, fill, opacity, dash
- Use EditorContext for managing editor state (figures, selected tool, etc.)

### Drawing Tools

The editor provides multiple drawing tools, each with keyboard shortcuts:

- **Select (V)**: Select and transform figures
- **Node (N)**: Edit individual nodes and control points
- **Pan (H)**: Navigate the canvas
- **Rectangle (R)**: Draw rectangular shapes
- **Circle (C)**: Draw circular shapes
- **Line (L)**: Draw straight line segments
- **Curve (U)**: Draw smooth curved lines with Bezier control points
- **Measure (M)**: Measure distances on the canvas
- **Offset (O)**: Create offset/seam allowance around shapes
- **Dart (D)**: Insert geometric darts (pences) into patterns
- **Mirror (F)**: Mirror/flip shapes
- **Unfold (G)**: Unfold pattern pieces

### Coordinate System

- Use `getRelativePointer()` to transform screen coordinates to world coordinates
- Applied in all drawing tools
- See `components/editor/Canvas.tsx` for implementation details

### Tool Selection and Shortcuts

- Tool buttons in EditorToolbar use active state styling
- Active tool has primary color background and border when selected
- Keyboard shortcuts handled by `useToolShortcuts.ts` hook
- All shortcuts are single keys (no modifiers) and disabled when typing in input fields
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

### Input UX Standard (Editor & Dashboard)

When adding or editing inputs, follow this UX contract to keep the UI consistent and avoid confusion:

- **Editable vs locked**
  - If a field is not editable, prefer `disabled` (not `readOnly`) so it does not look interactive and does not show focus rings.
  - Use distinct styling for disabled fields (muted text, no shadow/ring).

- **Focus style**
  - Do not use theme `primary` for focus rings/borders on generic numeric/text inputs, because `primary` may be a strong accent color (e.g. red) and reads like an error.
  - Prefer a **neutral focus** (e.g. gray border/ring) and reserve red exclusively for validation errors.

- **Invalid state**
  - When the value is invalid, show an explicit error message (pt-BR) and a red border/ring.
  - Clear the error when the user edits.

- **Numeric inputs (pt-BR)**
  - Accept comma decimal input (e.g. `"1,25"`). Parse by replacing `,` with `.`.
  - Always clamp to a safe minimum (e.g. seam/offset `>= 0.1`, edge length `>= 0.01`).
  - Display using comma decimals and fixed precision (typically 2 decimals).

- **Keyboard + mouse adjustments**
  - For numeric inputs, support:
    - `ArrowUp` / `ArrowDown` to increment/decrement.
    - Mouse wheel (only when the input is focused) to increment/decrement.
  - Use a consistent step size by context (default: `0.1`).
  - `preventDefault()` on wheel to avoid scrolling the panel while adjusting.

- **Inline edits (canvas overlays)**
  - If there is an inline editor tied to `selectedEdge`/selection, keep internal draft state in sync with selection changes (e.g. anchor changes).
  - Avoid closing inline editors when clicking related controls (e.g. anchor buttons) by preventing focus steal on pointer down.

Reference implementations:

- `components/editor/PropertiesPanel.tsx` (numeric inputs + focus/error/disabled patterns)
- `components/editor/Canvas.tsx` (inline edge length edit + anchor sync)

## Common Pitfalls to Avoid

1. **Canvas Components**: Always mark components using Konva/Canvas as client components
2. **Coordinate Transformation**: Always use `getRelativePointer()` for mouse coordinates in canvas
3. **Authentication**: Use appropriate Supabase client (server vs client) based on context
4. **Route Protection**: Remember middleware protects routes; handle auth redirects properly
5. **Type Safety**: Avoid `any` types; use proper TypeScript types and interfaces
6. **Formatting**: Run `npm run format` before committing to maintain code style
7. **Figure Mutations**: Always create new figure objects when updating (immutability)
8. **Keyboard Shortcuts**: Check for typing in input fields before handling shortcuts
9. **E2E Tests**: Enable E2E mode with environment variables when testing authentication flows

## Advanced Features

### Undo/Redo System

- Implemented via `useHistory.ts` custom hook
- Supports undo/redo for figure changes
- Keyboard shortcuts: Cmd/Ctrl+Z (undo), Cmd/Ctrl+Shift+Z (redo)
- History is saved for most operations except temporary drawing states
- Use `setState(newState, saveHistory)` with `saveHistory=false` for temporary updates

### Export to PDF

- Export functionality in `components/editor/export.ts`
- Uses jsPDF library for PDF generation
- Supports:
  - Multiple paper sizes (A4, A3, Letter, Legal, Tabloid)
  - Portrait and landscape orientations
  - Custom margins
  - Tiled printing for large patterns
  - Tool-based filtering (exclude specific tools from export)
  - Crop marks for alignment
  - Pattern metadata (name, fabric, notes)
- SVG export also supported
- Export modal accessible from toolbar
- URL parameter support: `?export=pdf&autoExport=1` for automatic export

### Smart Snapping

- Grid snapping for precise alignment
- Grid can be toggled on/off
- Snapping to other figures and guides
- Configurable snap tolerance
- See `components/editor/snapping.ts` for implementation

### Selection and Transformation

- Select tool allows selecting multiple figures
- Transform operations: move, rotate, scale
- Shift key constraints for proportional scaling and axis-locked movement
- Delete selected figures with Delete/Backspace keys
- Properties panel shows selected figure properties

### Node Editing

- Node tool (N) for editing figure geometry
- Add/remove nodes by clicking on edges
- Adjust Bezier control handles for curves
- Switch node mode between smooth and corner
- Direct manipulation of figure shape

### Advanced Pattern Tools

- **Offset Tool**: Create seam allowances with configurable distance
- **Mirror Tool**: Mirror figures along vertical or horizontal axis
- **Unfold Tool**: Unfold pattern pieces for layout
- **Dart Tool**: Add geometric darts with configurable depth and opening
- **Measure Tool**: Measure distances between points on the canvas

### Page Guides

- Configurable paper size and orientation guides
- Visual indication of printable area
- Margins configurable in export settings
- Helps with layout planning before export

## Testing

- **Test Framework**: Playwright for end-to-end testing
- Test files located in `tests/` directory
- Configuration in `playwright.config.ts`
- E2E tests use special auth bypass header (`x-e2e-token`) when server runs with `E2E_TESTS=1`
- Tests run on Chromium, Firefox, and WebKit browsers
- Automatic test server starts on port 3100 during test runs
- Visual regression tests include snapshot comparisons
- Run tests with `npm run test:e2e`
- When adding tests, follow existing patterns in `tests/` directory
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

## Important Constants and Utilities

### Measurement System

- All measurements use centimeters (cm) as the primary unit
- Conversion constant: `PX_PER_CM = 37.7952755906` (based on 96 DPI CSS standard)
- Available in `components/editor/constants.ts`
- Grid size: 1cm x 1cm squares
- Always convert between pixels and cm using these constants

### Helper Modules

- `components/editor/figurePath.ts` - Figure geometry calculations (bounding boxes, polylines)
- `components/editor/figureGeometry.ts` - Geometric operations on figures
- `components/editor/export.ts` - PDF and SVG export functionality
- `components/editor/exportSettings.ts` - Paper sizes and export configurations
- `components/editor/useHistory.ts` - Undo/redo state management
- `components/editor/useToolShortcuts.ts` - Keyboard shortcut handling

### Data Persistence

- Projects stored in Supabase `projects` table
- Design data saved as JSONB with versioning (`version: 2`)
- Data structure defined as `DesignDataV2` in types.ts
- Includes figures array, page guide settings, and metadata (fabric, notes, print dimensions, grade, cover URL)
- Auto-save functionality available
- Import/export of project data supported
