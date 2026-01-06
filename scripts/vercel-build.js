#!/usr/bin/env node

const { execSync } = require('child_process');
const { exit } = require('process');

function runCommand(command, description) {
  console.log(`\n📦 ${description}...`);
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ ${description} completed`);
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    throw error;
  }
}

function checkEnvVar(name, required = true) {
  const value = process.env[name];
  if (!value) {
    if (required) {
      console.error(`\n❌ ERROR: ${name} is not set!`);
      console.error(`Please set ${name} in Vercel environment variables.`);
      console.error(`Run: vercel env add ${name} production`);
      exit(1);
    } else {
      console.warn(`⚠️  WARNING: ${name} is not set`);
    }
  } else {
    console.log(`✅ ${name} is set`);
  }
}

console.log('🔍 Checking environment variables...\n');

// Check required environment variables
checkEnvVar('DATABASE_URL', true);
checkEnvVar('BETTER_AUTH_SECRET', false);
checkEnvVar('NEXT_PUBLIC_APP_URL', false);

console.log('\n🚀 Starting build process...\n');

try {
  // Generate Prisma Client
  runCommand('pnpm prisma generate', 'Generating Prisma Client');

  // Deploy migrations
  try {
    runCommand('pnpm prisma migrate deploy', 'Deploying database migrations');
  } catch (error) {
    console.warn('\n⚠️  Migration deployment failed. This might be okay if:');
    console.warn('   - The database schema is already up to date');
    console.warn('   - You\'re using a fresh database that needs initial setup');
    console.warn('   - There\'s a connection issue (check DATABASE_URL)');
    console.warn('\nAttempting to continue with build...\n');
  }

  // Build Next.js
  runCommand('pnpm next build', 'Building Next.js application');

  console.log('\n✅ Build completed successfully!');
} catch (error) {
  console.error('\n❌ Build failed:', error.message);
  exit(1);
}

