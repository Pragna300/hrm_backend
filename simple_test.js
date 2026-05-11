require('dotenv').config();
const nodemailer = require('nodemailer');

const config = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
};

async function test() {
  console.log('--- SMTP DEBUG TEST ---');
  console.log('Host:', config.host);
  console.log('Port:', config.port);
  console.log('User:', config.auth.user);
  console.log('Pass Length:', config.auth.pass ? config.auth.pass.length : 0);
  
  if (!config.auth.user || !config.auth.pass) {
    console.error('❌ Error: SMTP_USER or SMTP_PASS missing in .env');
    return;
  }

  const transporter = nodemailer.createTransport(config);
  
  try {
    console.log('Connecting to SMTP server...');
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully!');
    
    console.log('Sending test email...');
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || config.auth.user,
      to: config.auth.user,
      subject: 'HRM Portal - SMTP Test',
      text: 'If you see this, your SMTP configuration is working correctly!'
    });
    console.log('✅ Test email sent:', info.messageId);
  } catch (err) {
    console.error('❌ SMTP Test Failed:', err.message);
    console.log('\n--- Troubleshooting ---');
    console.log('1. Ensure 2-Step Verification is ON in your Google Account.');
    console.log('2. Ensure you are using a 16-character APP PASSWORD (not your main password).');
    console.log('3. Remove all spaces from the password in your .env file.');
  }
}

test();
