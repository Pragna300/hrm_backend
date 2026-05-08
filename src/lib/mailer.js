const nodemailer = require('nodemailer');
const { env } = require('../config/env');

function canSendEmail() {
  return Boolean(env.SMTP_USER && env.SMTP_PASS);
}

function buildTransporter() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

function pickErrorMessage(errorLike) {
  if (!errorLike) return 'Unknown email provider error';
  if (typeof errorLike === 'string') return errorLike;
  return errorLike.message || errorLike.name || 'Unknown email provider error';
}

function normalizeRecipientList(to) {
  const list = Array.isArray(to) ? to : [to];
  return list.map((value) => String(value || '').trim()).filter(Boolean);
}

/**
 * Generic helper. Returns `{ sent: boolean, reason?: string, id?: string }`
 * and never throws — callers can decide whether mail failure is fatal.
 */
async function sendMail({ to, subject, html, text }) {
  if (!canSendEmail()) {
    return { sent: false, reason: 'SMTP_USER or SMTP_PASS is missing' };
  }
  const recipients = normalizeRecipientList(to);
  if (recipients.length === 0) {
    return { sent: false, reason: 'Recipient email is missing' };
  }

  try {
    const transporter = buildTransporter();
    const result = await transporter.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: recipients.join(', '),
      subject,
      html,
      text,
    });
    if (!result?.messageId) {
      return { sent: false, reason: 'Email provider did not return messageId' };
    }
    return { sent: true, id: result.messageId };
  } catch (error) {
    return {
      sent: false,
      reason:
        pickErrorMessage(error) +
        '. For Gmail, use an App Password (not your normal Gmail password).',
    };
  }
}

const portalLink = (path = '/login') => `${env.FRONTEND_URL}${path}`;

const TEMPLATES = {
  credentials({ fullName, loginEmail, plainPassword, organizationName, role }) {
    return {
      subject: 'Your HR Portal account is ready',
      text: [
        `Hello ${fullName},`,
        '',
        `An account has been created for you${organizationName ? ` at ${organizationName}` : ''}.`,
        `Role: ${role || 'employee'}`,
        `Email: ${loginEmail}`,
        `Password: ${plainPassword}`,
        '',
        `Login: ${portalLink('/login')}`,
      ].join('\n'),
      html: [
        `<p>Hello ${fullName},</p>`,
        `<p>An account has been created for you${organizationName ? ` at <strong>${organizationName}</strong>` : ''}.</p>`,
        `<p>Role: <strong>${role || 'employee'}</strong><br/>`,
        `Email: <strong>${loginEmail}</strong><br/>`,
        `Password: <strong>${plainPassword}</strong></p>`,
        `<p><a href="${portalLink('/login')}">Login to the portal</a></p>`,
        `<p style="color:#888">Tip: change your password after the first login.</p>`,
      ].join(''),
    };
  },

  companyWelcome({ companyName, fullName }) {
    return {
      subject: `Welcome to HR Portal, ${companyName}`,
      text: `Hi ${fullName}, your company "${companyName}" is now live on HR Portal. Sign in: ${portalLink('/login')}`,
      html: `<p>Hi ${fullName},</p><p>Your company <strong>${companyName}</strong> is now live on HR Portal. You are the company manager.</p><p><a href="${portalLink('/login')}">Sign in</a></p>`,
    };
  },

  leaveRequested({ approverName, requesterName, leaveType, startDate, endDate, reason }) {
    return {
      subject: `Leave request from ${requesterName}`,
      text: `${approverName}, ${requesterName} has requested ${leaveType} from ${startDate} to ${endDate}. Reason: ${reason || '—'}.`,
      html: `<p>Hi ${approverName},</p><p><strong>${requesterName}</strong> has requested <strong>${leaveType}</strong> leave from <strong>${startDate}</strong> to <strong>${endDate}</strong>.</p><p>Reason: ${reason || '—'}</p><p><a href="${portalLink('/company/leaves')}">Review pending leaves</a></p>`,
    };
  },

  leaveDecided({ requesterName, status, leaveType, startDate, endDate, approverNote }) {
    return {
      subject: `Your leave request was ${status}`,
      text: `Hi ${requesterName}, your ${leaveType} leave from ${startDate} to ${endDate} was ${status}. Note: ${approverNote || '—'}`,
      html: `<p>Hi ${requesterName},</p><p>Your <strong>${leaveType}</strong> leave from <strong>${startDate}</strong> to <strong>${endDate}</strong> was <strong>${status}</strong>.</p>${approverNote ? `<p>Note from approver: ${approverNote}</p>` : ''}<p><a href="${portalLink('/employee/leaves')}">Open my leaves</a></p>`,
    };
  },

  payrollReady({ fullName, periodLabel, netPay, currency }) {
    return {
      subject: `Payslip available for ${periodLabel}`,
      text: `Hi ${fullName}, your payslip for ${periodLabel} is ready. Net pay: ${currency} ${netPay}.`,
      html: `<p>Hi ${fullName},</p><p>Your payslip for <strong>${periodLabel}</strong> is now available. Net pay: <strong>${currency} ${netPay}</strong>.</p><p><a href="${portalLink('/employee/payslips')}">View payslip</a></p>`,
    };
  },
};

const sendCredentials = (data) => sendMail({ to: data.to, ...TEMPLATES.credentials(data) });
const sendCompanyWelcome = (data) => sendMail({ to: data.to, ...TEMPLATES.companyWelcome(data) });
const sendLeaveRequested = (data) => sendMail({ to: data.to, ...TEMPLATES.leaveRequested(data) });
const sendLeaveDecided = (data) => sendMail({ to: data.to, ...TEMPLATES.leaveDecided(data) });
const sendPayrollReady = (data) => sendMail({ to: data.to, ...TEMPLATES.payrollReady(data) });

module.exports = {
  canSendEmail,
  sendMail,
  sendCredentials,
  sendCompanyWelcome,
  sendLeaveRequested,
  sendLeaveDecided,
  sendPayrollReady,
  /** kept for backward compatibility with previous code */
  sendEmployeeCredentialEmail: sendCredentials,
};
