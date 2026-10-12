
import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { Readable } from "node:stream";
import { auth } from "./auth.js";
import { fromNodeHeaders } from "better-auth/node";

const router = express.Router();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        if (
            ["image/jpeg", "image/png", "image/webp"].includes(
                file.mimetype
            )
        ) {
            cb(null, true);
        } else {
            cb(new Error("Only JPG, PNG and WebP images allowed"));
        }
    },
});

router.post("/profile-image", async (req, res, next) => {
    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });

        if (!session?.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        upload.single("image")(req, res, async (error) => {
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            if (!req.file) {
                return res.status(400).json({
                    message: "Please select an image",
                });
            }

            try {
                const result = await new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        {
                            folder: "docappoint/profiles",
                            resource_type: "image",
                            transformation: [
                                { width: 500, height: 500, crop: "fill" },
                                { quality: "auto", fetch_format: "auto" },
                            ],
                        },
                        (err, result) =>
                            err ? reject(err) : resolve(result)
                    );

                    Readable.from(req.file.buffer).pipe(stream);
                });

                return res.json({
                    imageUrl: result.secure_url,
                });
            } catch (err) {
                next(err);
            }
        });
    } catch (error) {
        next(error);
    }
});

export default router;
