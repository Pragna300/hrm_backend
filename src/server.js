const http = require('http');
const { env } = require('./config/env');
const { createApp } = require('./app');
const { initNotificationSocket } = require('./lib/notificationSocket');
const { ensurePlansSeeded } = require('./lib/seedPlans');

const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const companyRoutes = require('./routes/companyRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const publicRoutes = require('./routes/publicRoutes');
const {
  departmentsRouter,
  locationsRouter,
  shiftsRouter,
} = require('./routes/orgStructureRoutes');
const taskRoutes = require('./routes/taskRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = createApp();

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
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);

const PORT = env.PORT || 5000;
const server = http.createServer(app);
initNotificationSocket(server);

server.listen(PORT, async () => {
  console.log(`[backend] running on :${PORT}`);
  try {
    await ensurePlansSeeded();
    console.log('[backend] default plans ensured');
  } catch (err) {
    console.error('[backend] could not seed default plans:', err.message);
  }
});
