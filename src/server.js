const http = require('http');
const { env } = require('./config/env');
const { createApp } = require('./app');
const { initNotificationSocket } = require('./lib/notificationSocket');
const { ensurePlansSeeded } = require('./lib/seedPlans');
const { initTrialExpirationJob } = require('./jobs/trialExpirationJob');

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
const documentRoutes = require('./routes/documentRoutes');
const reportsRoutes = require('./routes/reportsRoutes');
const { publicRouter: contactInquiryPublicRouter, adminRouter: contactInquiryAdminRouter } = require('./routes/contactInquiryRoutes');

const app = createApp();

app.use('/api/public', publicRoutes);
app.use('/api/contact-us', contactInquiryPublicRouter);
app.use('/api/auth', authRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/admin/contact-inquiries', contactInquiryAdminRouter);
app.use('/api/company', companyRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/admin/employees', employeeRoutes); // Support frontend's /api/admin/employees requests
app.use('/api/departments', departmentsRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/leaves', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/employee-portal', require('./routes/employeePortalRoutes'));
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/reports', reportsRoutes);

// Centralised error handler must be registered after all routes
const { errorHandler } = require('./middleware/errorHandler');
app.use(errorHandler);

const PORT = env.PORT || 5000;
const server = http.createServer(app);
initNotificationSocket(server);

const fs = require('fs');
const path = require('path');
const logPath = path.join(__dirname, '../db_debug_status.txt');

server.listen(PORT, async () => {
  let logContent = '';
  try {
    const { prisma } = require('./config/database');
    logContent += `Server started at ${new Date().toISOString()}\n`;
    logContent += `DATABASE_URL: ${process.env.DATABASE_URL ? 'PRESENT' : 'MISSING'}\n`;
    
    // Test simple query
    const orgCount = await prisma.organization.count();
    logContent += `Connection test success: found ${orgCount} organizations.\n`;
    
    await ensurePlansSeeded();
    logContent += `ensurePlansSeeded executed successfully.\n`;
    console.log('[backend] default plans ensured');
  } catch (err) {
    logContent += `ERROR: ${err.message}\nSTACK: ${err.stack}\n`;
    console.error('[backend] could not seed default plans:', err.message);
  }
  fs.writeFileSync(logPath, logContent);
  initTrialExpirationJob();
  console.log(`[backend] fully started and running on port: ${PORT}`);
});
