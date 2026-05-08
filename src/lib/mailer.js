const nodemailer = require('nodemailer');
const { env } = require('../config/env');

function canSendEmail() {
  return Boolean(env.SMTP_USER && env.SMTP_PASS);
}

function formatEmailAddress(value) {
  return String(value || '').trim();
}

function normalizeRecipientList(to) {
  if (Array.isArray(to)) {
    return to.map(formatEmailAddress).filter(Boolean);
  }
  const singleRecipient = formatEmailAddress(to);
  return singleRecipient ? [singleRecipient] : [];
}

function pickErrorMessage(errorLike) {
  if (!errorLike) return 'Unknown email provider error';
  if (typeof errorLike === 'string') return errorLike;
  if (errorLike.message) return errorLike.message;
  if (errorLike.name) return errorLike.name;
  return 'Unknown email provider error';
}

async function sendEmployeeCredentialEmail({ to, fullName, loginEmail, plainPassword }) {
  if (!canSendEmail()) {
    return { sent: false, reason: 'SMTP_USER or SMTP_PASS is missing' };
  }

  try {
    const recipients = normalizeRecipientList(to);
    if (recipients.length === 0) {
      return { sent: false, reason: 'Recipient email is missing' };
    }

    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });

    const fromAddress = env.SMTP_FROM || env.SMTP_USER;

    const result = await transporter.sendMail({
      from: fromAddress,
      to: recipients.join(', '),
      subject: 'Your HR Portal account credentials',
      html: [
        `Hello ${fullName},`,
        '<br/><br/>',
        'Your HR portal account has been created by admin.',
        `<br/>Email: ${loginEmail}`,
        `<br/>Password: ${plainPassword}`,
        '<br/><br/>',
        `<a href="${env.FRONTEND_URL}/login">Login to HR Portal</a>`,
        '<br/><br/>',
        'If you want, you can change your password after login.',
      ].join(''),
      text: [
        `Hello ${fullName},`,
        '',
        'Your HR portal account has been created by admin.',
        `Email: ${loginEmail}`,
        `Password: ${plainPassword}`,
        '',
        `Login: ${env.FRONTEND_URL}/login`,
      ].join('\n'),
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

module.exports = { canSendEmail, sendEmployeeCredentialEmail };
