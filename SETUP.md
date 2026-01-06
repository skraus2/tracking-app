# Better Auth Setup Guide

This guide will help you set up Better Auth with magic link authentication using PostgreSQL.

## Prerequisites

1. PostgreSQL database installed and running
2. Node.js and pnpm installed

## Setup Steps

### 1. Configure Environment Variables

Update the `.env` file with your actual values:

```env
# Better Auth Configuration
BETTER_AUTH_SECRET=your-secret-key-here-change-this-in-production
# BETTER_AUTH_URL is optional - NEXT_PUBLIC_APP_URL takes precedence
# BETTER_AUTH_URL=http://localhost:3000

# App Base URL (used for magic links and webhooks)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# PostgreSQL Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/tracking_app
```

**Important:**
- Generate a secure secret key for `BETTER_AUTH_SECRET`. You can use:
  ```bash
  openssl rand -base64 32
  ```
- Set `NEXT_PUBLIC_APP_URL` to your app's public URL. This is used for:
  - Magic link URLs in authentication emails
  - Shopify webhook subscription URLs
  - In production, use your public domain (e.g., `https://yourdomain.com`)
  - For local development with ngrok, use your ngrok URL (e.g., `https://abc123.ngrok.io`)
- Replace `user`, `password`, `localhost`, `5432`, and `tracking_app` with your actual PostgreSQL credentials and database name.

### 2. Create PostgreSQL Database

Make sure your PostgreSQL database exists:

```sql
CREATE DATABASE tracking_app;
```

Or use your preferred database name and update the `DATABASE_URL` accordingly.

### 3. Generate Prisma Client

First, generate the Prisma client:

```bash
npx prisma generate
```

### 4. Generate Database Schema

Run the Better Auth CLI to generate the Prisma schema:

```bash
npx @better-auth/cli generate
```

This will update your `prisma/schema.prisma` file with all the required Better Auth models.

### 5. Apply Database Schema

Apply the Prisma schema to your database:

```bash
npx prisma db push
```

Or if you prefer to use migrations:

```bash
npx prisma migrate dev --name init
```

### 6. Configure Email Sending

Currently, the magic link is logged to the console for development. To send actual emails, update the `sendMagicLink` function in `lib/auth.ts`:

```typescript
sendMagicLink: async ({ email, token, url }, ctx) => {
  // Implement your email sending logic here
  // Example using a service like Resend, SendGrid, etc.
  await sendEmail({
    to: email,
    subject: "Sign in to your account",
    html: `Click this link to sign in: <a href="${url}">${url}</a>`,
    text: `Click this link to sign in: ${url}`,
  });
},
```

### 7. Start the Development Server

```bash
pnpm dev
```

## Usage

1. Navigate to `http://localhost:3000`
2. You'll be redirected to `/sign-in` if not authenticated
3. Enter your email address
4. Check your email (or console logs in development) for the magic link
5. Click the magic link to sign in
6. You'll be redirected to `/dashboard` after successful authentication

## Project Structure

```
tracking-app/
├── lib/
│   ├── auth.ts          # Better Auth server configuration with Prisma
│   └── auth-client.ts   # Better Auth client configuration
├── prisma/
│   └── schema.prisma    # Prisma schema with Better Auth models
├── app/
│   ├── api/
│   │   └── auth/
│   │       └── [...all]/
│   │           └── route.ts  # API route handler
│   ├── sign-in/
│   │   └── page.tsx     # Sign-in page with magic link form
│   ├── dashboard/
│   │   ├── page.tsx     # Protected dashboard page
│   │   └── sign-out-button.tsx
│   └── page.tsx         # Home page (redirects based on auth)
└── .env                 # Environment variables
```

## Troubleshooting

### Database Connection Issues

If you see connection errors:
1. Verify PostgreSQL is running: `pg_isready`
2. Check your `DATABASE_URL` format
3. Ensure the database exists
4. Verify user permissions

### Magic Link Not Working

1. Check console logs for the magic link URL (in development)
2. Ensure `NEXT_PUBLIC_APP_URL` matches your app URL (or set `BETTER_AUTH_URL` as fallback)
3. Verify email sending is properly configured

### Migration Errors

If migrations fail:
1. Ensure the database connection is working
2. Check that you have proper database permissions
3. Try running `npx prisma db push` instead of migrations
4. Verify your Prisma schema is valid: `npx prisma validate`

## Next Steps

- Implement email sending service (Resend, SendGrid, etc.)
- Add email verification if needed
- Customize the UI/UX
- Add additional authentication methods if required

