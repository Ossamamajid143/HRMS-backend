import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(env.SMTP_PORT || '587'),
  secure: env.SMTP_PORT === '465', // true for 465, false for other ports
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export const sendResetPasswordEmail = async (email: string, token: string) => {
  const resetUrl = `${env.FRONTEND_URL}/reset-password/${token}`;

  const mailOptions = {
    from: `"HRMS Pro" <${env.SMTP_USER}>`,
    to: email,
    subject: 'Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #4f46e5; text-align: center;">HRMS Pro</h2>
        <p>You requested a password reset for your HRMS account.</p>
        <p>Please click the button below to reset your password. This link will expire in 1 hour.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #4f46e5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
        </div>
        <p>If you did not request this, please ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        <p style="font-size: 12px; color: #666; text-align: center;">&copy; 2026 HRMS Pro. All rights reserved.</p>
      </div>
    `,
  };

  console.log(`[SMTP] Sending reset password email to: ${email}...`);
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[SMTP] Success! MessageID: ${info.messageId}`);
  } catch (error) {
    console.error(`[SMTP] FAILED to send reset email to ${email}:`, error);
    throw error;
  }
};

export const sendVerificationEmail = async (email: string, token: string) => {
  const verificationUrl = `${env.FRONTEND_URL}/verify-email/${token}`;

  const mailOptions = {
    from: `"HRMS Pro" <${env.SMTP_USER}>`,
    to: email,
    subject: 'Please verify your email address',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #4f46e5; text-align: center;">Welcome to HRMS Pro</h2>
        <p>Thank you for registering! Please verify your email address to complete your registration.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #4f46e5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Email</a>
        </div>
        <p>If you did not create an account, no further action is required.</p>
        <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        <p style="font-size: 12px; color: #666; text-align: center;">&copy; 2026 HRMS Pro. All rights reserved.</p>
      </div>
    `,
  };

  console.log(`[SMTP] Sending verification email to: ${email}...`);
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[SMTP] Success! MessageID: ${info.messageId}`);
  } catch (error) {
    console.error(`[SMTP] FAILED to send verification email to ${email}:`, error);
    throw error;
  }
};
