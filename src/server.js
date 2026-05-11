const { env } = require('./config/env');
const express = require('express');
const cors = require('cors');
const { prisma } = require('./config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { verifyJWT } = require('./middleware/auth');
const { rbac } = require('./middleware/rbac');
const { userWithEmployeeInclude, buildAuthUserPayload } = require('./lib/authPayload');
const { attendanceCalendarDate } = require('./lib/attendanceDate');
const { buildTodaySummary } = require('./lib/attendanceSummary');
const { sendEmployeeCredentialEmail } = require('./lib/mailer');
const { createBootstrapAdmin } = require('./lib/adminBootstrap');

const taskRoutes = require('./routes/taskRoutes');

const app = express();
// Removed local prisma init, now using imported instance

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json());

app.use('/api/tasks', taskRoutes);

function signAuthToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      employeeId: user.employee?.id ?? null,
      organizationId: user.organizationId,
    },
    env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function parseOptionalDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseOptionalForeignKeyId(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

async function generateUniqueEmployeeCode() {
  for (let i = 0; i < 5; i += 1) {
    const candidate = `EMP${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const exists = await prisma.employee.findUnique({ where: { employeeCode: candidate } });
    if (!exists) return candidate;
  }
  return `EMP${Date.now()}`;
}

function pickEmployeeFields(body) {
  return {
    firstName: body.firstName,
    lastName: body.lastName,
    employeeCode: body.employeeCode,
    profilePhotoUrl: body.profilePhotoUrl ?? null,
    dateOfBirth: parseOptionalDate(body.dateOfBirth),
    gender: body.gender ?? null,
    bloodGroup: body.bloodGroup ?? null,
    workEmail: body.workEmail ?? null,
    workPhone: body.workPhone ?? null,
    personalEmail: body.personalEmail ?? null,
    personalPhone: body.personalPhone ?? null,
    emergencyName: body.emergencyName ?? null,
    emergencyPhone: body.emergencyPhone ?? null,
    departmentId: parseOptionalForeignKeyId(body.departmentId),
    locationId: parseOptionalForeignKeyId(body.locationId),
    shiftId: parseOptionalForeignKeyId(body.shiftId),
    managerId: parseOptionalForeignKeyId(body.managerId),
    designation: body.designation ?? null,
    employmentType: body.employmentType ?? 'full_time',
    employmentStatus: body.employmentStatus ?? 'active',
    dateHired: parseOptionalDate(body.dateHired) ?? new Date(),
    contractedHoursPerWeek:
      body.contractedHoursPerWeek != null ? Number(body.contractedHoursPerWeek) : 40,
    fte: body.fte != null ? Number(body.fte) : 1,
    bankName: body.bankName ?? null,
    bankIfsc: body.bankIfsc ?? null,
    addressLine1: body.addressLine1 ?? null,
    city: body.city ?? null,
    state: body.state ?? null,
    postalCode: body.postalCode ?? null,
    country: body.country ?? 'India',
  };
}

// --- AUTH ROUTES ---

app.post('/api/auth/register', async (req, res) => {
  try {
    const { companyName, companyAddress, sector, adminName, email, password } = req.body;

    if (!companyName || !email || !password || !adminName) {
      return res.status(400).json({ success: false, message: 'All required fields must be filled' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const nameParts = adminName.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';

    // Create organization and admin user in a transaction
    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: companyName,
          address: companyAddress,
          sector: sector,
        }
      });

      await tx.user.create({
        data: {
          email,
          passwordHash: hashedPassword,
          role: 'admin',
          organizationId: org.id,
          employee: {
            create: {
              employeeCode: `ADM${Math.floor(Math.random() * 10000)}`,
              firstName,
              lastName,
              dateHired: new Date(),
            },
          },
        },
      });
    });

    res.status(201).json({ success: true, message: 'Admin and Organization registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/auth/bootstrap-admin', async (req, res) => {
  try {
    const result = await createBootstrapAdmin({
      email: req.body?.email,
      password: req.body?.password,
      name: req.body?.name,
    });

    return res.status(result.statusCode).json({
      success: result.success,
      message: result.message,
      data: result.data || null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        ...userWithEmployeeInclude,
        organization: true,
      },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.role === 'employee' && !user.employee?.workEmail) {
      return res.status(403).json({
        success: false,
        message: 'Your employee account is not activated by admin yet.',
      });
    }

    const token = signAuthToken(user);

    res.json({
      success: true,
      token,
      user: buildAuthUserPayload(user),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/auth/me', verifyJWT, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: {
        ...userWithEmployeeInclude,
        organization: true,
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user: buildAuthUserPayload(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/admin/employees', verifyJWT, rbac('admin'), async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      where: {
        user: {
          createdByAdminId: req.user.userId
        }
      },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, email: true, role: true, isActive: true } } },
    });
    res.json({ success: true, data: employees });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/admin/employees', verifyJWT, rbac('admin'), async (req, res) => {
  console.log('POST /api/admin/employees hit. Body:', req.body.email);
  try {
    const { email, password, firstName, lastName, ...employeeBody } = req.body;
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'email, password, firstName and lastName are required',
      });
    }

    const emailLower = String(email).trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email: emailLower } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    let resolvedEmployeeCode = employeeBody.employeeCode ? String(employeeBody.employeeCode).trim() : '';
    if (resolvedEmployeeCode) {
      const existingEmployeeCode = await prisma.employee.findUnique({
        where: { employeeCode: resolvedEmployeeCode },
      });
      if (existingEmployeeCode) {
        return res.status(400).json({ success: false, message: 'Employee code already exists' });
      }
    } else {
      resolvedEmployeeCode = await generateUniqueEmployeeCode();
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const employeeData = pickEmployeeFields({
      ...employeeBody,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      employeeCode: resolvedEmployeeCode,
      workEmail: employeeBody.workEmail || emailLower,
    });

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: emailLower,
          passwordHash,
          role: 'employee',
          isActive: true,
          organizationId: req.user.organizationId ?? null,
          createdByAdminId: req.user.userId,
        },
      });

      const employee = await tx.employee.create({
        data: {
          ...employeeData,
          userId: user.id,
          workEmail: employeeData.workEmail || emailLower,
        },
        include: { user: { select: { id: true, email: true, role: true } } },
      });

      return employee;
    });

    const fullName = `${created.firstName} ${created.lastName}`.trim();
    const emailResult = await sendEmployeeCredentialEmail({
      to: created.workEmail || emailLower,
      fullName,
      loginEmail: emailLower,
      plainPassword: String(password),
    });

    res.status(201).json({
      success: true,
      message: emailResult.sent
        ? 'Employee created and credential email sent.'
        : `Employee created. ERROR: Email not sent (${emailResult.reason}).`,
      data: created,
      emailSent: emailResult.sent,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.put('/api/admin/employees/:id', verifyJWT, rbac('admin'), async (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    if (!Number.isFinite(employeeId)) {
      return res.status(400).json({ success: false, message: 'Invalid employee id' });
    }

    const existing = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const { email, password, ...employeeBody } = req.body;
    if (
      employeeBody.employeeCode &&
      String(employeeBody.employeeCode).trim() !== String(existing.employeeCode)
    ) {
      const employeeCodeConflict = await prisma.employee.findUnique({
        where: { employeeCode: String(employeeBody.employeeCode).trim() },
      });
      if (employeeCodeConflict) {
        return res.status(400).json({ success: false, message: 'Employee code already exists' });
      }
    }

    const employeeData = pickEmployeeFields({ ...existing, ...employeeBody });

    if (email && existing.userId) {
      const emailLower = String(email).trim().toLowerCase();
      const conflict = await prisma.user.findFirst({
        where: { email: emailLower, NOT: { id: existing.userId } },
      });
      if (conflict) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (existing.userId && email) {
        await tx.user.update({
          where: { id: existing.userId },
          data: { email: String(email).trim().toLowerCase() },
        });
      }
      if (existing.userId && password) {
        await tx.user.update({
          where: { id: existing.userId },
          data: { passwordHash: await bcrypt.hash(String(password), 10) },
        });
      }
      return tx.employee.update({
        where: { id: employeeId },
        data: employeeData,
        include: { user: { select: { id: true, email: true, role: true, isActive: true } } },
      });
    });

    res.json({ success: true, message: 'Employee updated', data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// --- ATTENDANCE (JWT + employee from token) ---

function requireEmployeeId(req, res) {
  const id = req.user?.employeeId;
  if (id == null || id === '') {
    res.status(403).json({
      success: false,
      message: 'No employee profile is linked to this account. Attendance is unavailable.',
    });
    return null;
  }
  return Number(id);
}

async function loadTodayAttendanceSummary(employeeId, date) {
  const segments = await prisma.attendanceSegment.findMany({
    where: { employeeId, date },
    orderBy: { checkIn: 'asc' },
  });
  return buildTodaySummary(segments, new Date());
}

app.get('/api/attendance/today', verifyJWT, async (req, res) => {
  try {
    const employeeId = requireEmployeeId(req, res);
    if (employeeId == null) return;

    const date = attendanceCalendarDate();
    const summary = await loadTodayAttendanceSummary(employeeId, date);

    res.json({ success: true, data: { date, ...summary } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** Tap in: closes any open segment for the day, then starts a new segment (unlimited cycles). */
app.post('/api/attendance/tap-in', verifyJWT, async (req, res) => {
  try {
    const employeeId = requireEmployeeId(req, res);
    if (employeeId == null) return;

    const date = attendanceCalendarDate();
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const openRows = await tx.attendanceSegment.findMany({
        where: { employeeId, date, checkOut: null },
      });
      for (const row of openRows) {
        await tx.attendanceSegment.update({
          where: { id: row.id },
          data: { checkOut: now },
        });
      }
      await tx.attendanceSegment.create({
        data: {
          employeeId,
          date,
          checkIn: now,
          source: 'web',
        },
      });
    });

    const summary = await loadTodayAttendanceSummary(employeeId, date);
    res.json({ success: true, message: 'Tapped in', data: summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/attendance/tap-out', verifyJWT, async (req, res) => {
  try {
    const employeeId = requireEmployeeId(req, res);
    if (employeeId == null) return;

    const date = attendanceCalendarDate();
    const now = new Date();

    const open = await prisma.attendanceSegment.findFirst({
      where: { employeeId, date, checkOut: null },
      orderBy: { checkIn: 'desc' },
    });

    if (!open) {
      return res.status(400).json({
        success: false,
        message: 'No open tap-in session. Tap in first.',
      });
    }

    await prisma.attendanceSegment.update({
      where: { id: open.id },
      data: { checkOut: now },
    });

    const summary = await loadTodayAttendanceSummary(employeeId, date);
    res.json({ success: true, message: 'Tapped out', data: summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const PORT = env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on :${PORT}`));
