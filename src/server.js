const { env } = require('./config/env');
const express = require('express');
const cors = require('cors');
const { prisma } = require('./config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { verifyJWT, requireAdmin } = require('./middleware/auth');
const { userWithEmployeeInclude, buildAuthUserPayload } = require('./lib/authPayload');
const { attendanceCalendarDate } = require('./lib/attendanceDate');
const { buildTodaySummary } = require('./lib/attendanceSummary');

const app = express();
// Removed local prisma init, now using imported instance


app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json());

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

// --- MEMBER MANAGEMENT (Admin Only) ---

app.post('/api/members/add', verifyJWT, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const organizationId = req.user.organizationId;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';

    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        role: role, // 'admin' or 'employee'
        organizationId: organizationId,
        employee: {
          create: {
            employeeCode: `${role === 'admin' ? 'ADM' : 'EMP'}${Math.floor(Math.random() * 10000)}`,
            firstName,
            lastName,
            dateHired: new Date(),
          },
        },
      },
    });

    // Mock Email Trigger
    console.log(`
    --------------------------------------------------
    EMAIL SENT TO: ${email}
    SUBJECT: Your HR Portal Credentials
    
    Hello ${name},
    Your account has been created by your administrator.
    
    Login Email: ${email}
    Password: ${password}
    
    Please login at: ${env.FRONTEND_URL}/login
    --------------------------------------------------
    `);

    res.status(201).json({ success: true, message: `${role} added successfully` });
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
