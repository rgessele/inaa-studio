# Supabase Setup Instructions

This document provides step-by-step instructions for setting up Supabase authentication and database for the Inaá Studio application.

## Prerequisites

- A Supabase account (sign up at https://supabase.com)

## Step 1: Create a Supabase Project

1. Go to https://app.supabase.com
2. Click "New Project"
3. Fill in the project details:
   - Name: `inaa-studio` (or your preferred name)
   - Database Password: Choose a strong password
   - Region: Select the closest region to your users
4. Click "Create new project"
5. Wait for the project to be provisioned (this may take a few minutes)

## Step 2: Get Your Supabase Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (under "Project URL")
   - **anon/public key** (under "Project API keys")

## Step 3: Configure Environment Variables

1. In your project root, copy `.env.local.example` to `.env.local`:

   ```bash
   cp .env.local.example .env.local
   ```

2. Edit `.env.local` and add your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

### Admin Console (server-side privileged key)

Some `/admin` operations (import users, block/unblock, change email, transfer projects) require a privileged Supabase key that must **only** exist on the server.

1. In your Supabase project dashboard, go to **Settings** → **API**.
2. Under **API Keys**, copy the **Secret** key.
3. Add it to `.env.local` (server-only):

   ```env
   SUPABASE_SECRET_KEY=your-secret-api-key
   ```

If your dashboard shows a different label/name, you can also use `SUPABASE_SECRET_API_KEY`. As a legacy fallback, `SUPABASE_SERVICE_ROLE_KEY` is still supported.

## Step 4: Run Database Migrations

1. In your Supabase project dashboard, go to **SQL Editor**
2. Click "New query"
3. Copy the contents of `supabase/migrations/20231213000000_initial_schema.sql`
4. Paste it into the SQL editor
5. Click "Run" to execute the migration

This will create:

- `profiles` table for user data
- `projects` table for storing design projects
- Row Level Security (RLS) policies to ensure users can only access their own data
- Triggers for automatic profile creation and timestamp updates

## Step 5: Configure Authentication Providers

### Email (Magic Link) - Already Enabled by Default

Magic Link authentication is enabled by default in Supabase.

### Google OAuth (Optional)

1. In your Supabase project dashboard, go to **Authentication** → **Providers**
2. Find "Google" in the list and click to expand
3. Enable the Google provider
4. Follow the instructions to set up Google OAuth:
   - Create a project in Google Cloud Console
   - Configure OAuth consent screen
   - Create OAuth 2.0 credentials
   - Add authorized redirect URIs (provided by Supabase)
5. Copy the Client ID and Client Secret into the Supabase settings
6. Click "Save"

## Step 6: Configure Email Settings (Optional)

For production, you should configure custom SMTP settings:

1. Go to **Authentication** → **Settings** → **Email**
2. Configure your SMTP server details
3. Customize email templates as needed

For development, Supabase provides a default email service that works well for testing.

## Step 7: Test the Setup

1. Start your development server:

   ```bash
   npm run dev
   ```

2. Open http://localhost:3000 in your browser
3. You should be redirected to the login page
4. Try logging in with:
   - Magic Link: Enter your email and check for the login link
   - Google OAuth: Click "Continue with Google" (if configured)

5. After successful login, you should be redirected to `/dashboard`

If your user has `profiles.role = "admin"`, the app will redirect to `/admin` by default.

## Verify Database Setup

To verify that the tables and RLS policies are set up correctly:

1. Go to **Table Editor** in your Supabase dashboard
2. You should see two tables:
   - `profiles`
   - `projects`
3. Go to **Authentication** → **Policies**
4. Verify that RLS policies are active for both tables

## Troubleshooting

### "Invalid API credentials" error

- Double-check that your environment variables match the values from Supabase dashboard
- Restart your development server after changing `.env.local`

### Email not being sent

- Check the **Authentication** → **Logs** in Supabase dashboard
- For development, use the default Supabase email service
- For production, configure custom SMTP settings

### Redirect issues

- Ensure the callback URL in your authentication settings matches your application URL
- Check that middleware is properly configured

### RLS errors when accessing data

- Verify that you're logged in
- Check that RLS policies are active in the Table Editor
- Review the SQL migration to ensure all policies were created

## Next Steps

Now that authentication and database are configured:

1. Users can create accounts and log in
2. User profiles are automatically created on signup
3. Projects can be created and stored in the database
4. RLS ensures data privacy between users

You can now build features to:

- Create and manage design projects
- Store design vectors in the `design_data` JSONB field
- Add more user profile fields as needed
- Implement project sharing or collaboration features
