const { env } = require('./config/env');
const express = require('express');
const cors = require('cors');

const { errorHandler } = require('./middleware/errorHandler');
const { ok } = require('./utils/response');
const { ensurePlansSeeded } = require('./lib/seedPlans');

const authRoutes        = require('./routes/authRoutes');
const employeeRoutes    = require('./routes/employeeRoutes');
const attendanceRoutes  = require('./routes/attendanceRoutes');
const leaveRoutes       = require('./routes/leaveRoutes');
const payrollRoutes     = require('./routes/payrollRoutes');
const companyRoutes     = require('./routes/companyRoutes');
const superAdminRoutes  = require('./routes/superAdminRoutes');
const publicRoutes      = require('./routes/publicRoutes');
const {
  departmentsRouter,
  locationsRouter,
  shiftsRouter,
} = require('./routes/orgStructureRoutes');

const app = express();

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => ok(res, { ok: true }));

app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentsRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/leaves', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/employee-portal', require('./routes/employeePortalRoutes'));

app.use(errorHandler);

const PORT = env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`[backend] running on :${PORT}`);
  try {
    await ensurePlansSeeded();
    console.log('[backend] default plans ensured');
  } catch (err) {
    console.error('[backend] could not seed default plans:', err.message);
  }
});
