
export function errorHandler(error, req, res, next) {
    if (res.headersSent) {
        return next(error);
    }

    console.error("API error:", error.message);

    res.status(error.statusCode || 500).json({
        message:
            error.statusCode && error.statusCode < 500
                ? error.message
                : "Internal server error",
    });
}

export function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        message: "API route not found",
    });
}
