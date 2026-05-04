// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err?.statusCode || err?.status || 500;
  const message = err?.message || 'Server error';

  return res.status(status).json({ success: false, message });
}

module.exports = { errorHandler };

