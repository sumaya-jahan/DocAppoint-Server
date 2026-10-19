
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

// Validate HTTPS image URLs
function validHttpsUrl(value) {
    if (
        typeof value !== "string" ||
        value.length > 2000
    ) {
        return false;
    }

    try {
        const url = new URL(value);

        return (
            url.protocol === "https:" &&
            Boolean(url.hostname) &&
            !url.username &&
            !url.password
        );
    } catch {
        return false;
    }
}

// Validate fee and rating
function validateNumber(input, field) {
    if (
        typeof input !== "number" &&
        typeof input !== "string"
    ) {
        return null;
    }

    if (
        typeof input === "string" &&
        input.trim() === ""
    ) {
        return null;
    }

    const number = Number(input);

    if (
        !Number.isFinite(number) ||
        number < 0
    ) {
        return null;
    }

    if (
        field === "rating" &&
        number > 5
    ) {
        return null;
    }

    if (
        field === "fee" &&
        number > 1000000
    ) {
        return null;
    }

    return number;
}

// Accept legacy experience formats:
// 12, "12", "12 Years", "12 years"
function validateExperience(input) {
    if (input === "" || input === undefined) {
        return { empty: true };
    }

    let years;

    if (typeof input === "number") {
        years = input;
    } else if (typeof input === "string") {
        const match = input
            .trim()
            .match(/^(\d+(?:\.\d+)?)\s*(?:years?|yrs?)?$/i);

        years = match
            ? Number(match[1])
            : NaN;
    } else {
        return { error: "Invalid experience" };
    }

    if (
        !Number.isFinite(years) ||
        years < 0 ||
        years > 100
    ) {
        return { error: "Invalid experience" };
    }

    return { value: years };
}

// Accept availability as string or array
function validateAvailability(input) {
    if (typeof input === "string") {
        if (input.length > 2000) {
            return null;
        }

        return input;
    }

    if (Array.isArray(input)) {
        if (
            input.length > 20 ||
            input.some(
                (item) =>
                    typeof item !== "string" ||
                    item.trim().length === 0 ||
                    item.length > 150
            )
        ) {
            return null;
        }

        return input.map(
            (item) => item.trim()
        );
    }

    return null;
}

export function validateDoctor(
    body,
    partial = false
) {
    if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
    ) {
        return {
            error: "Invalid doctor data",
        };
    }

    const value = {};

    // Allow only approved fields
    for (const key of Object.keys(body)) {
        if (!doctorFields.includes(key)) {
            return {
                error: `Unexpected field: ${key}`,
            };
        }

        value[key] = body[key];
    }

    // Required text fields
    for (const key of [
        "name",
        "specialty",
        "location",
    ]) {
        if (!partial || key in value) {
            if (
                typeof value[key] !== "string" ||
                value[key].trim().length < 2 ||
                value[key].length > 120
            ) {
                return {
                    error: `Invalid ${key}`,
                };
            }

            value[key] = value[key].trim();
        }
    }

    // Fee and rating
    for (const key of [
        "fee",
        "rating",
    ]) {
        if (key in value) {
            const number = validateNumber(
                value[key],
                key
            );

            if (number === null) {
                return {
                    error: `Invalid ${key}`,
                };
            }

            value[key] = number;
        }
    }

    // Experience supports numeric and legacy formats
    if ("experience" in value) {
        const result = validateExperience(
            value.experience
        );

        if (result.error) {
            return {
                error: result.error,
            };
        }

        if (result.empty) {
            // Keep existing experience during an edit
            delete value.experience;
        } else {
            value.experience = result.value;
        }
    }

    // Optional text fields
    for (const key of [
        "description",
        "qualification",
    ]) {
        if (
            key in value &&
            (
                typeof value[key] !== "string" ||
                value[key].length > 2000
            )
        ) {
            return {
                error: `Invalid ${key}`,
            };
        }
    }

    // Availability supports string and array
    if ("availability" in value) {
        const availability = validateAvailability(
            value.availability
        );

        if (availability === null) {
            return {
                error: "Invalid availability",
            };
        }

        value.availability = availability;
    }

    // Validate main image URL
    if ("image" in value) {
        if (
            value.image !== "" &&
            !validHttpsUrl(value.image)
        ) {
            return {
                error: "Image must be a valid HTTPS URL",
            };
        }
    }

    // Validate additional images
    if ("images" in value) {
        if (
            !Array.isArray(value.images) ||
            value.images.length > 10 ||
            value.images.some(
                (url) => !validHttpsUrl(url)
            )
        ) {
            return {
                error:
                    "Images must be an array of up to 10 valid HTTPS URLs",
            };
        }

        value.images = [
            ...new Set(value.images),
        ];
    }

    // Generate unique ID for new doctors
    if (!partial) {
        value.id = crypto.randomUUID();
    }

    // Reject empty edit requests
    if (
        partial &&
        Object.keys(value).length === 0
    ) {
        return {
            error: "No changes provided",
        };
    }

    return { value };
}
