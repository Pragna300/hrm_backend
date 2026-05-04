const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'shnoor_secret_2026';

// --- AUTH ROUTES ---

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Split name into first and last for employee record
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';

    // Create User and Employee in a transaction
    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        role: email.includes('admin') ? 'admin' : 'employee',
        employee: {
          create: {
            employeeCode: `EMP${Math.floor(Math.random() * 10000)}`,
            firstName: firstName,
            lastName: lastName,
            dateHired: new Date(),
          }
        }
      },
      include: { employee: true }
    });

    res.status(201).json({ success: true, message: 'User registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ 
      where: { email },
      include: { employee: true }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, employeeId: user.employee?.id },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: `${user.employee?.first_name} ${user.employee?.last_name}`
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// --- ATTENDANCE ROUTES (Phase 0) ---

app.post('/api/attendance/tap-in', async (req, res) => {
  // Logic from previous step... (simplified for this turn)
  try {
    const { employeeId } = req.body; // In real app, get from JWT
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const log = await prisma.attendanceLog.upsert({
      where: { employeeId_date: { employeeId, date: today } },
      update: { checkIn: now, status: 'present' },
      create: { employeeId, date: today, checkIn: now, status: 'present' }
    });
    res.json({ success: true, message: 'Clocked in successfully', data: log });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on :${PORT}`));
