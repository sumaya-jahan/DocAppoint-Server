import "dotenv/config";

import {
    MongoClient,
    ServerApiVersion,
} from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI must be set in the server environment");

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

const db = client.db("docappointDB");

export { client, db };