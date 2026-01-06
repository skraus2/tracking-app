import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient, UserAccess } from "@prisma/client";
import { APIError } from "better-auth/api";
import { resend } from "./resend";
import { MagicLinkEmailTemplate } from "@/components/email/magic-link-template";

// Prisma reads DATABASE_URL from environment variables
const prisma = new PrismaClient();

// Use NEXT_PUBLIC_APP_URL for base URL (consistent with webhook URLs)
// Fallback to BETTER_AUTH_URL for backward compatibility
const baseURL = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;

export const auth = betterAuth({
  baseURL,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 Tage
    updateAge: 60 * 60 * 24 * 7, // Session wird alle 7 Tage verlängert
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        input: false,
      },
      access: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
    transform: (user: any) => {
      // Transform UserAccess enum to boolean for session
      if (user && 'access' in user) {
        return {
          ...user,
          access: user.access === UserAccess.Enabled || user.access === true,
        };
      }
      return user;
    },
  },
  plugins: [
    magicLink({
      disableSignUp: true,
      sendMagicLink: async ({ email, token, url }, ctx) => {
        // Check if user exists
        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          throw new APIError("BAD_REQUEST", {
            message: "No account found with this email",
          });
        }

        // Check if user has access (access is UserAccess enum, not boolean)
        if (user.access !== UserAccess.Enabled) {
          throw new APIError("FORBIDDEN", {
            message: "Access denied. Please contact an administrator.",
          });
        }

        // Send magic link email via Resend
        try {
          const fromEmail =
            process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
          const firstName = user.name.split(" ")[0] || user.name;

          console.log("📧 Sending magic link email:");
          console.log("  To:", email);
          console.log("  From:", fromEmail);
          console.log("  User:", user.name);
          console.log("  Magic Link URL:", url);

          const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: [email],
            subject: "Sign in to your account",
            react: MagicLinkEmailTemplate({
              firstName,
              magicLinkUrl: url,
            }),
          });

          if (error) {
            console.error("❌ Failed to send magic link email:");
            console.error("  Email:", email);
            console.error("  Error:", error);
            // Log error but don't break the auth flow
            // In production, you might want to handle this differently
          } else {
            console.log("✅ Magic link email sent successfully:");
            console.log("  Email ID:", data?.id);
            console.log("  To:", email);
            console.log("  From:", fromEmail);
          }
        } catch (error) {
          console.error("❌ Error sending magic link email:");
          console.error("  Email:", email);
          console.error("  Error:", error);
          // Log error but don't break the auth flow
          // Fallback: log the magic link for development
          console.log("🔗 Magic link (fallback):", url);
        }
      },
    }),
  ],
});

