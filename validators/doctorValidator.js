
import crypto from "node:crypto";

const doctorFields = [
    "name",
    "specialty",
    "location",
    "fee",
    "rating",
    "image",
    "images",
    "experience",
    "description",
    "qualification",
    "availability",
];

export function validateDoctor(body, partial = false) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { error: "Invalid doctor data" };
    }

    const value = {};

    for (const key of Object.keys(body)) {
        if (!doctorFields.includes(key)) {
            return { error: `Unexpected field: ${key}` };
        }

        value[key] = body[key];
    }

    for (const key of ["name", "specialty", "location"]) {
        if (!partial || key in value) {
            if (
                typeof value[key] !== "string" ||
                value[key].trim().length < 2 ||
                value[key].length > 120
            ) {
                return { error: `Invalid ${key}` };
            }

            value[key] = value[key].trim();
        }
    }

    for (const key of ["fee", "rating", "experience"]) {
        if (key in value) {
            const number = Number(value[key]);

            if (
                !Number.isFinite(number) ||
                number < 0 ||
                (key === "rating" && number > 5)
            ) {
                return { error: `Invalid ${key}` };
            }

            value[key] = number;
        }
    }

    for (const key of [
        "image",
        "description",
        "qualification",
        "availability",
    ]) {
        if (
            key in value &&
            (typeof value[key] !== "string" || value[key].length > 2000)
        ) {
            return { error: `Invalid ${key}` };
        }
    }

    if (value.image && !/^https:\/\//.test(value.image)) {
        return { error: "Image must use HTTPS" };
    }

    if ("images" in value) {
        if (
            !Array.isArray(value.images) ||
            value.images.length > 10 ||
            value.images.some(
                (url) =>
                    typeof url !== "string" ||
                    url.length > 2000 ||
                    !/^https:\/\//.test(url)
            )
        ) {
            return {
                error: "Images must be an array of up to 10 HTTPS URLs",
            };
        }

        value.images = [...new Set(value.images)];
    }

    if (!partial) {
        value.id = crypto.randomUUID();
    }

    if (partial && !Object.keys(value).length) {
        return { error: "No changes provided" };
    }

    return { value };
}
