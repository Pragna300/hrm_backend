const { ok, fail, asyncHandler } = require('../utils/response');
const reportsService = require('../services/reports');

const getAttendanceOverview = asyncHandler(async (req, res) => {
  const fromDate = req.query.fromDate;
  const toDate = req.query.toDate;
  const result = await reportsService.getOrganizationAttendanceOverview(req.organizationId, { fromDate, toDate });
  return ok(res, { data: result });
});

const generateReport = asyncHandler(async (req, res) => {
  const report = await reportsService.generateAttendanceReport(req.organizationId, req.body);
  return ok(res, { data: report });
});

const exportCsv = asyncHandler(async (req, res) => {
  const filters = {
    employeeIds: req.query.employeeIds ? req.query.employeeIds.split(',').map(Number) : [],
    department: req.query.department,
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
    status: req.query.status ? req.query.status.split(',') : [],
    shift: req.query.shift,
  };

  const csv = await reportsService.generateAttendanceCsv(req.organizationId, filters);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-report-${new Date().toISOString().split('T')[0]}.csv"`);
  return res.status(200).send(csv);
});

const getDayWiseSummary = asyncHandler(async (req, res) => {
  const { fromDate, toDate } = req.query;
  const data = await reportsService.getDayWiseSummary(req.organizationId, { fromDate, toDate });
  return ok(res, { data });
});

module.exports = {
  getAttendanceOverview,
  generateReport,
  exportCsv,
  getDayWiseSummary,
};

