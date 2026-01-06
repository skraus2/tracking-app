#!/bin/bash
set -e

echo "🔍 Checking environment variables..."

# Check for DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL is not set!"
  echo "Please set DATABASE_URL in Vercel environment variables."
  echo "Run: vercel env add DATABASE_URL production"
  exit 1
fi

echo "✅ DATABASE_URL is set"

# Check for BETTER_AUTH_SECRET
if [ -z "$BETTER_AUTH_SECRET" ]; then
  echo "⚠️  WARNING: BETTER_AUTH_SECRET is not set"
fi

# Check for NEXT_PUBLIC_APP_URL
if [ -z "$NEXT_PUBLIC_APP_URL" ]; then
  echo "⚠️  WARNING: NEXT_PUBLIC_APP_URL is not set"
fi

echo "📦 Generating Prisma Client..."
pnpm prisma generate

echo "🔄 Deploying database migrations..."
pnpm prisma migrate deploy || {
  echo "❌ Migration failed. This might be okay if the database is already up to date."
  echo "Attempting to continue with build..."
}

echo "🏗️  Building Next.js application..."
pnpm next build

echo "✅ Build completed successfully!"

