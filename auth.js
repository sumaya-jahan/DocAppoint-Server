import "dotenv/config";

import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { jwt } from "better-auth/plugins";

import { client, db } from "./db.js";

const clientURL = (
    process.env.CLIENT_URL ||
    "http://localhost:3000"
).replace(/\/$/, "");

const trustedOrigins = [
    ...new Set([
        "http://localhost:3000",
        clientURL,
    ]),
];

const isProduction =
    process.env.NODE_ENV === "production";

export const auth = betterAuth({
    database: mongodbAdapter(db, {
        client,
    }),

    secret: process.env.BETTER_AUTH_SECRET,

    baseURL: process.env.BETTER_AUTH_URL,

    trustedOrigins,

    advanced: {
        useSecureCookies: isProduction,

        defaultCookieAttributes: {
            sameSite: isProduction
                ? "none"
                : "lax",
            secure: isProduction,
            httpOnly: true,
            path: "/",
        },
    },

    emailAndPassword: {
        enabled: true,
        minPasswordLength: 6,
        autoSignIn: false,
    },

    socialProviders: {
        google: {
            clientId:
                process.env.GOOGLE_CLIENT_ID,
            clientSecret:
                process.env.GOOGLE_CLIENT_SECRET,
            prompt: "select_account",
        },
    },

    plugins: [
        jwt(),
    ],
});