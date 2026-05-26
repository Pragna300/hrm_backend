const { prisma } = require('../config/database');
const { sendSupportInquiryAcknowledgment, sendSupportInquirySubmittedToAdmin, sendSupportInquiryResolvedUser, sendSupportInquiryResolvedAdmin } = require('../lib/mailer');
const { env } = require('../config/env');

// Public route: submit an inquiry
exports.submitInquiry = async (req, res, next) => {
  try {
    const { name, email, organizationName, inquiryType, subject, message } = req.body;

    if (!name || !email || !inquiryType || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const inquiry = await prisma.contactInquiry.create({
      data: {
        name,
        email,
        organizationName,
        inquiryType,
        subject,
        message,
        status: 'PENDING',
        priority: 'MEDIUM'
      }
    });

    // Send in-app browser notification to the user who submitted the inquiry
    const userRecord = await prisma.user.findUnique({ where: { email } });
    if (userRecord) {
      const notif = await prisma.notification.create({
        data: {
          userId: userRecord.id,
          organizationId: userRecord.organizationId,
          type: 'SUPPORT_SUBMITTED',
          title: 'Support Inquiry Submitted',
          body: `Your support inquiry has been received and is under review.`,
          link: null
        }
      });
      // Emit socket event for real-time notification
      const { emitNotificationToUser } = require('../lib/notificationSocket');
      emitNotificationToUser(userRecord.id, 'new_notification', notif);
    }

    // Removed admin notification as per new requirement


    return res.status(201).json({
      success: true,
      message: 'Support inquiry submitted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

// Admin route: get all inquiries with filters and pagination
exports.getInquiries = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, type, status, priority, search } = req.query;
    
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const where = {};

    if (type) where.inquiryType = type;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { organizationName: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [inquiries, total] = await Promise.all([
      prisma.contactInquiry.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.contactInquiry.count({ where })
    ]);

    return res.json({
      success: true,
      data: inquiries,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    next(error);
  }
};

// Admin route: update inquiry status/priority/notes
exports.updateInquiry = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, priority, adminNotes } = req.body;

    const inquiryId = parseInt(id, 10);
    if (isNaN(inquiryId)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const existing = await prisma.contactInquiry.findUnique({ where: { id: inquiryId } });
    if (!existing) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }

    const updated = await prisma.contactInquiry.update({
      where: { id: inquiryId },
      data: {
        ...(status && { status }),
        ...(priority && { priority }),
        ...(adminNotes !== undefined && { adminNotes })
      }
    });

    // Send notifications if the status was just changed to RESOLVED
    if (status === 'RESOLVED' && existing.status !== 'RESOLVED') {
      // Try to notify the user by email (non-fatal if email not configured)
      try {
        await sendSupportInquiryResolvedUser({
          to: updated.email,
          name: updated.name,
          inquiryId: updated.id,
          subject: updated.subject
        });
      } catch (emailErr) {
        console.warn('[ContactInquiry] Email notification failed (non-fatal):', emailErr.message);
      }

      // Always create in-app notification if the user has an account
      const user = await prisma.user.findUnique({ where: { email: updated.email } });
      if (user) {
        const notif = await prisma.notification.create({
          data: {
            userId: user.id,
            organizationId: user.organizationId,
            type: 'SUPPORT_RESOLVED',
            title: 'Support Inquiry Resolved',
            body: `Your inquiry regarding "${updated.subject || 'General'}" has been resolved.`,
            link: null
          }
        });
        const { emitNotificationToUser } = require('../lib/notificationSocket');
        emitNotificationToUser(user.id, 'new_notification', notif);
      }
    }

    return res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// Admin route: delete an inquiry (only allowed if resolved)
exports.deleteInquiry = async (req, res, next) => {
  try {
    const { id } = req.params;
    const inquiryId = parseInt(id, 10);
    if (isNaN(inquiryId)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }
    const existing = await prisma.contactInquiry.findUnique({ where: { id: inquiryId } });
    if (!existing) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }
    if (existing.status !== 'CLOSED') {
      return res.status(400).json({ error: 'Can only delete closed inquiries' });
    }
    await prisma.contactInquiry.delete({ where: { id: inquiryId } });
    return res.json({ success: true, message: 'Inquiry deleted' });
  } catch (error) {
    next(error);
  }
};
