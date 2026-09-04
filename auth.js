import "dotenv/config";

import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { jwt } from "better-auth/plugins";

import { client, db } from "./db.js";

export const auth = betterAuth({
    database: mongodbAdapter(db, {
        client,
    }),

    secret: process.env.BETTER_AUTH_SECRET,

    baseURL: process.env.BETTER_AUTH_URL,

    trustedOrigins: [
        "http://localhost:3000",
        "https://doc-appoint-client-three.vercel.app",
    ],

    emailAndPassword: {
        enabled: true,
        minPasswordLength: 6,
        autoSignIn: false,
    },

    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret:
                process.env.GOOGLE_CLIENT_SECRET,
            prompt: "select_account",
        },
    },

    plugins: [
        jwt(),
    ],
});