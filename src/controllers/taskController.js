const { prisma } = require('../config/database');

/**
 * Admin: Create a new task and assign to an employee
 */
async function createTask(req, res) {
  try {
    const { subject, task_name, description, assigned_to, date_assigned, due_date, priority } = req.body;

    if (!subject || !task_name || !assigned_to || !due_date) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    // Verify assigned_to is a user created by this admin
    const targetUser = await prisma.user.findFirst({
      where: {
        id: Number(assigned_to),
        organizationId: req.user.organizationId,
        role: 'employee',
      },
    });

    if (!targetUser) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: assign tasks only to employees in your organization.',
      });
    }

    const task = await prisma.task.create({
      data: {
        subject,
        taskName: task_name,
        description,
        assignedToId: targetUser.id,
        assignedById: req.user.userId,
        dateAssigned: date_assigned ? new Date(date_assigned) : new Date(),
        dueDate: new Date(due_date),
        priority: priority || 'Medium',
        status: 'Pending'
      }
    });

    res.status(201).json({ success: true, message: 'Task created successfully', data: task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error while creating task' });
  }
}

/**
 * Admin: Get all tasks created by the logged-in admin
 */
async function getAdminTasks(req, res) {
  try {
    const tasks = await prisma.task.findMany({
      where: { assignedById: req.user.userId },
      include: {
        assignedTo: {
          include: { employee: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Format response to include employee name easily
    const formatted = tasks.map(t => ({
      ...t,
      employeeName: t.assignedTo.employee 
        ? `${t.assignedTo.employee.firstName} ${t.assignedTo.employee.lastName}`
        : t.assignedTo.email
    }));

    res.json({ success: true, data: formatted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error while fetching tasks' });
  }
}

/**
 * Employee: Get tasks assigned to the logged-in employee
 */
async function getEmployeeTasks(req, res) {
  try {
    const tasks = await prisma.task.findMany({
      where: { assignedToId: req.user.userId },
      orderBy: { dueDate: 'asc' }
    });
    res.json({ success: true, data: tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error while fetching my tasks' });
  }
}

/**
 * Employee/Admin: Update task status
 */
async function updateTaskStatus(req, res) {
  try {
    const taskId = Number(req.params.id);
    const { status } = req.body;

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const canEditAsAssignee = task.assignedToId === req.user.userId;
    const canEditAsCreator =
      (req.user.role === 'manager' || req.user.role === 'hr') && task.assignedById === req.user.userId;
    if (!canEditAsAssignee && !canEditAsCreator) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const updateData = { status };
    if (status === 'Completed') {
      updateData.completedAt = new Date();
    } else {
      updateData.completedAt = null;
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: updateData
    });

    res.json({ success: true, message: 'Task status updated', data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error while updating status' });
  }
}

/**
 * Dashboard Statistics
 */
async function getDashboardStats(req, res) {
  try {
    if (req.user.role === 'manager' || req.user.role === 'hr') {
      const orgId = req.user.organizationId;
      const [totalEmployees, totalTasks, pendingTasks, completedTasks, overdueTasks] = await Promise.all([
        prisma.employee.count({ where: { organizationId: orgId } }),
        prisma.task.count({ where: { assignedById: req.user.userId } }),
        prisma.task.count({ where: { assignedById: req.user.userId, status: 'Pending' } }),
        prisma.task.count({ where: { assignedById: req.user.userId, status: 'Completed' } }),
        prisma.task.count({
          where: {
            assignedById: req.user.userId,
            status: { not: 'Completed' },
            dueDate: { lt: new Date() },
          },
        }),
      ]);

      return res.json({
        success: true,
        data: { totalEmployees, totalTasks, pendingTasks, completedTasks, overdueTasks },
      });
    } else {
      const [totalTasks, pendingTasks, completedTasks, upcomingDeadlines] = await Promise.all([
        prisma.task.count({ where: { assignedToId: req.user.userId } }),
        prisma.task.count({ where: { assignedToId: req.user.userId, status: 'Pending' } }),
        prisma.task.count({ where: { assignedToId: req.user.userId, status: 'Completed' } }),
        prisma.task.count({ 
          where: { 
            assignedToId: req.user.userId, 
            status: { not: 'Completed' },
            dueDate: { gte: new Date() }
          } 
        })
      ]);

      return res.json({
        success: true,
        data: { totalTasks, pendingTasks, completedTasks, upcomingDeadlines }
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = {
  createTask,
  getAdminTasks,
  getEmployeeTasks,
  updateTaskStatus,
  getDashboardStats
};
