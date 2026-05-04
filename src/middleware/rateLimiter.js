function rateLimiter() {
  return (req, res, next) => next();
}

module.exports = { rateLimiter };

