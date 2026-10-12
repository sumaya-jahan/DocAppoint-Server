import "dotenv/config";
import {client,db} from "../db.js";
const email=process.argv[2]?.trim().toLowerCase();
if(!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) { console.error("Usage: node scripts/grant-admin.js existing-user@email.com");process.exit(1); }
try {await client.connect();const user=await db.collection("user").findOne({email});
 if(!user){console.error("No registered user found; create the account first.");process.exitCode=1;}
 else {await db.collection("adminRoles").updateOne({userId:String(user._id)},{$set:{role:"admin",grantedAt:new Date()}},{upsert:true}); console.log("Admin role granted to existing user.");}
}finally{await client.close()}
