/**
 * Tiny helpers so every route returns the same JSON envelope:
 *   { success, message?, data?, ...extra }
 */
function ok(res, payload = {}, status = 200) {
  return res.status(status).json({ success: true, ...payload });
}

function fail(res, message, status = 400, extra = {}) {
  return res.status(status).json({ success: false, message, ...extra });
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { ok, fail, asyncHandler };
