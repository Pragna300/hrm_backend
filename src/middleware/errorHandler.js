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

  const status = Number(err.statusCode) || 500;
  return res.status(status).json({
    success: false,
    message: err.message || 'Server error',
  });
}

module.exports = { errorHandler };
