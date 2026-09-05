export function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || 500;

  // Expected client errors (for example, invalid credentials) are already
  // returned to the caller and should not appear as backend warnings.
  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500
        ? "Internal server error"
        : error.message,
  });
}
