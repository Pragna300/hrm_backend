function ok(res, data = null, message = 'OK') {
  return res.json({ success: true, message, data });
}

function created(res, data = null, message = 'Created') {
  return res.status(201).json({ success: true, message, data });
}

function fail(res, status, message, meta) {
  return res.status(status).json({ success: false, message, ...(meta ? { meta } : {}) });
}

function paginated(res, items, page, limit, total) {
  return res.json({
    success: true,
    data: {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

module.exports = { ok, created, fail, paginated };

