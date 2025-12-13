# Testing Guide: Save/Load Projects Feature

This guide explains how to test the cloud save/load functionality that has been implemented.

## Prerequisites

Before testing, you need to:

1. **Set up Supabase Environment Variables**
   - Copy `.env.local.example` to `.env.local`
   - Add your actual Supabase credentials:
     ```env
     NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key
     ```

2. **Run Database Migrations**
   - Ensure the Supabase database has the `projects` table
   - The migration file is already in `supabase/migrations/20231213000000_initial_schema.sql`
   - Run it using Supabase CLI or through the Supabase Dashboard

3. **Start the Development Server**
   ```bash
   npm run dev
   ```

## Test Scenarios

### Scenario 1: Create and Save a New Project ✅

**Expected Outcome**: User creates a drawing and saves it with a name.

1. Navigate to `http://localhost:3000/login`
2. Log in with your credentials
3. Click "Abrir Editor de Moldes" or navigate to `/editor`
4. Draw some shapes on the canvas (rectangle, circle, line, or curve)
5. Click the "Salvar" (Save) button in the header
6. Enter a project name (e.g., "Vestido Verão")
7. Click "Salvar" in the modal
8. **Expected**: 
   - Green success toast appears: "Projeto salvo com sucesso!"
   - The project name in the header updates (if visible in UI)
   - A new project is created in the database

### Scenario 2: View Projects in Dashboard ✅

**Expected Outcome**: User sees all their saved projects listed.

1. After saving a project, click "Dashboard" button in the header
2. Navigate to `/dashboard`
3. **Expected**:
   - Project cards displayed in a grid
   - Each card shows:
     - Project name (e.g., "Vestido Verão")
     - Creation date
     - Last modified date
   - "Novo Projeto" button visible
   - If no projects exist, empty state with "Criar Primeiro Projeto" button

### Scenario 3: Load an Existing Project ✅

**Expected Outcome**: User opens a saved project and sees the drawing restored.

1. From the dashboard, click on a project card
2. Navigate to `/editor/[project-id]`
3. **Expected**:
   - Editor opens with the saved drawing
   - All shapes appear in their original positions
   - Project name is loaded into the context
   - User can continue editing

### Scenario 4: Update an Existing Project ✅

**Expected Outcome**: User modifies a project and saves it without creating a duplicate.

1. Load a project from the dashboard
2. Make changes to the drawing (add, remove, or modify shapes)
3. Click "Salvar" (Save) button
4. Modal shows the current project name
5. Click "Salvar" without changing the name (or change it if desired)
6. **Expected**:
   - Green success toast appears
   - Project is updated in the database (check `updated_at` timestamp)
   - No duplicate project is created
   - Return to dashboard to verify only one instance exists

### Scenario 5: Create Multiple Projects ✅

**Expected Outcome**: User can create multiple separate projects.

1. From dashboard, click "Novo Projeto"
2. Create and save a project (e.g., "Projeto A")
3. Click "Dashboard" to return
4. Click "Novo Projeto" again
5. Create and save another project (e.g., "Projeto B")
6. Return to dashboard
7. **Expected**:
   - Both projects are listed
   - Each project is independent
   - Loading one doesn't affect the other

### Scenario 6: Security - User Isolation ✅

**Expected Outcome**: Users can only see and modify their own projects.

1. Log in as User A
2. Create and save a project
3. Note the project ID from the URL when editing
4. Log out
5. Log in as User B
6. Try to access User A's project by URL: `/editor/[user-a-project-id]`
7. **Expected**:
   - User B is redirected to `/dashboard`
   - User B's dashboard doesn't show User A's projects
   - Database queries are filtered by `user_id`

## Database Verification

To verify the data is correctly saved, check your Supabase database:

### Projects Table

```sql
SELECT id, user_id, name, created_at, updated_at 
FROM projects 
ORDER BY updated_at DESC;
```

**Expected Columns**:
- `id`: UUID of the project
- `user_id`: UUID of the user who created it
- `name`: Project name (e.g., "Vestido Verão")
- `design_data`: JSONB object containing `{ shapes: [...] }`
- `created_at`: Timestamp of creation
- `updated_at`: Timestamp of last update

### Check Shape Data

```sql
SELECT name, design_data->'shapes' as shapes 
FROM projects 
WHERE user_id = 'your-user-id';
```

## Troubleshooting

### Issue: "Usuário não autenticado" error

**Solution**: Ensure you're logged in. Check that Supabase environment variables are correctly set.

### Issue: Projects not appearing in dashboard

**Solution**: 
- Check that RLS policies are enabled
- Verify `user_id` is correctly set when creating projects
- Check browser console for errors

### Issue: Can't load a project (redirected to dashboard)

**Solution**:
- Verify the project ID is correct
- Ensure you're logged in as the user who created the project
- Check that the project exists in the database

### Issue: Duplicate projects created on update

**Solution**: 
- This should not happen with the current implementation
- If it does, check that `projectId` is correctly set in EditorContext
- Verify the update logic in `lib/projects.ts`

## Features Implemented

✅ **Save New Project**: Creates a new project in the database
✅ **Update Existing Project**: Updates project without creating duplicates
✅ **List Projects**: Dashboard shows all user's projects
✅ **Load Project**: Opens saved project with drawing restored
✅ **User Isolation**: RLS + application-level filtering ensures data privacy
✅ **Toast Notifications**: User feedback for save success/error
✅ **Accessibility**: Modal with keyboard navigation and ARIA attributes

## Known Limitations

- Currently, there's no "Delete Project" functionality (can be added in the future)
- No project description editing UI (field exists in database but not exposed)
- No project thumbnails or preview images
- No sharing or collaboration features

## Next Steps for Development

1. Add delete project functionality
2. Add project renaming in dashboard
3. Add project thumbnails/previews
4. Add project search/filter in dashboard
5. Add project duplication feature
6. Add export project data to file
7. Add import project from file
