
import "dotenv/config";

import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { jwt } from "better-auth/plugins";
import { Resend } from "resend";

import { client, db } from "./db.js";

const resend = new Resend(process.env.RESEND_API_KEY);

const clientURL = (
    process.env.CLIENT_URL || "http://localhost:3000"
).replace(/\/$/, "");

const trustedOrigins = [
    ...new Set(["http://localhost:3000", clientURL]),
];

const isProduction = process.env.NODE_ENV === "production";

export const auth = betterAuth({
    database: mongodbAdapter(db, {
        client,
    }),

    secret: process.env.BETTER_AUTH_SECRET,

    baseURL:
        process.env.BETTER_AUTH_URL ||
        "http://localhost:5000",

    trustedOrigins,

    advanced: {
        useSecureCookies: isProduction,

        defaultCookieAttributes: {
            sameSite: isProduction ? "none" : "lax",
            secure: isProduction,
            httpOnly: true,
            path: "/",
        },
    },

    emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
        autoSignIn: false,

        sendResetPassword: async ({ user, url }) => {
            const resetURL = new URL(url);
            if (
                resetURL.origin !==
                new URL(
                    process.env.BETTER_AUTH_URL ||
                    "http://localhost:5000"
                ).origin
            ) {
                throw new Error("Invalid password reset URL");
            }

            const result = await resend.emails.send({
                from: "DocAppoint <onboarding@resend.dev>",
                to: user.email,
                subject: "Reset Your DocAppoint Password",
                html: `
          <h2>Reset Your Password</h2>
          <p>Click below to reset your password:</p>
          <p><a href="${resetURL.href}">Reset Password</a></p>
          <p>If you did not request this, ignore this email.</p>
        `,
            });

            if (result.error) {
                throw new Error("Failed to send reset email");
            }
        },
    },

    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            prompt: "select_account",
        },
    },

    plugins: [jwt()],
});
