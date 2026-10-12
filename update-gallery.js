
import "dotenv/config";
import { client, db } from "./db.js";

async function updateGallery() {
    try {
        await client.connect();

        const doctors = db.collection("doctors");

        // Keep only genuine, distinct image URLs for each doctor.
        const records = await doctors.find({}).toArray();

        let updated = 0;

        for (const doctor of records) {
            const images = [
                doctor.image,
                ...(Array.isArray(doctor.images) ? doctor.images : []),
            ].filter(
                (url, index, array) =>
                    typeof url === "string" &&
                    /^https:\/\//.test(url) &&
                    array.indexOf(url) === index
            );

            const result = await doctors.updateOne(
                { _id: doctor._id },
                { $set: { images } }
            );

            updated += result.modifiedCount;
        }

        console.log("Doctors checked:", records.length);
        console.log("Doctors updated:", updated);
        console.log(
            "Existing images preserved. Add genuinely different photos to display a multi-image gallery."
        );
    } catch (error) {
        console.error("Gallery update failed:", error);
    } finally {
        await client.close();
    }
}

updateGallery();
