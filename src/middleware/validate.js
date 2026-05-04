function validate(schema) {
  return (req, res, next) => {
    try {
      req.validated = {
        body: schema.body ? schema.body.parse(req.body) : req.body,
        query: schema.query ? schema.query.parse(req.query) : req.query,
        params: schema.params ? schema.params.parse(req.params) : req.params,
      };
      return next();
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: err?.errors || err?.message,
      });
    }
  };
}

module.exports = { validate };

