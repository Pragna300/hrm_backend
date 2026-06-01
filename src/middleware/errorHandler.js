/**
 * Centralised express error handler. Keeps controllers free of try/catch
 * boilerplate when paired with `asyncHandler`.
 */
function errorHandler(err, req, res, _next) {
  // Surface Prisma unique-constraint failures with a 409.
  if (err?.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: `Duplicate value for ${(err.meta?.target || []).join(', ') || 'unique field'}`,
    });
  }

  console.error('[error]', req.method, req.originalUrl, err);

  let status = Number(err.statusCode) || 500;
  
  // If a third-party service like Stripe returns a 401 (e.g., invalid secret key),
  // we must NOT pass 401 back to the frontend, because the frontend will assume 
  // the user's JWT is invalid and log them out.
  if (status === 401 && err.type && err.type.startsWith('Stripe')) {
    status = 502; // Bad Gateway (upstream error)
  }

  return res.status(status).json({
    success: false,
    message: err.message || 'Server error',
  });
}

module.exports = { errorHandler };
