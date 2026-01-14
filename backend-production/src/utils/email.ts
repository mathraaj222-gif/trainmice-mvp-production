import { Resend } from 'resend';
import { config } from '../config/env';

// Initialize Resend client
const resend = config.email.resendApiKey
  ? new Resend(config.email.resendApiKey)
  : null;

interface SendVerificationEmailParams {
  email: string;
  token: string;
  role: 'CLIENT' | 'TRAINER';
}

export async function sendVerificationEmail({
  email,
  token,
  role: _role, // Role is kept for interface compatibility but not used (redirect determined by user role in DB)
}: SendVerificationEmailParams): Promise<void> {
  // Check if Resend is configured
  if (!resend) {
    console.warn(`⚠️  Email sending disabled: RESEND_API_KEY not configured`);
    console.warn(`⚠️  Verification email would have been sent to ${email}`);
    console.warn(`⚠️  Verification token: ${token}`);
    return; // Don't throw error, just skip email sending
  }

  // Shortened verification URL - redirect is determined by user role in the backend
  const verificationUrl = `${config.app.baseUrl}/api/auth/v?t=${token}`;


  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Account</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">TrainMICE</h1>
        </div>
        
        <div style="background:rgb(255, 255, 255); padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">Hello,</h2>
          
          <p>Thank you for signing up with TrainMICE!</p>
          
          <p>Please click the button below to verify your email address and activate your account:</p>
          
          <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
            <tr>
              <td align="center">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="background: #14b8a6; border-radius: 5px;">
                      <a href="${verificationUrl}" 
                         style="display: block; padding: 15px 30px; text-decoration: none; 
                                color: #ffd700; font-weight: bold; font-size: 16px; 
                                border-radius: 5px; font-family: Arial, sans-serif;">
                        Verify Now
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          
          <p style="font-size: 12px; color: #999; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 20px;">
            This verification link will expire in 24 hours.<br>
            If you did not create this account, please ignore this email.
          </p>
        </div>
      </body>
    </html>
  `;

  const textContent = `
Hello,

Thank you for signing up with TrainMICE!

Please open this email in an HTML-capable email client and click the "Verify Now" button to verify your email address and activate your account.

This verification link will expire in 24 hours.

If you did not create this account, please ignore this email.

Best regards,
TrainMICE Team
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: `TrainMICE <${config.email.fromEmail}>`,
      to: [email],
      subject: 'Verify Your TrainMICE Account',
      html: htmlContent,
      text: textContent,
    });

    if (error) {
      console.error('Resend API error:', error);
      // Don't throw error - just log it to prevent app crashes
      return;
    }

    console.log('✅ Verification email sent successfully:', data?.id);
  } catch (error: any) {
    // Don't throw error - just log it to prevent app crashes
    console.error('Error sending verification email (non-blocking):', error.message || error);
    // Return silently to not block user registration
  }
}

interface SendPasswordResetEmailParams {
  email: string;
  token: string;
  role: 'CLIENT' | 'TRAINER' | 'ADMIN';
}

export async function sendPasswordResetEmail({
  email,
  token,
  role: _role,
}: SendPasswordResetEmailParams): Promise<void> {
  // Check if Resend is configured
  if (!resend) {
    console.warn(`⚠️  Email sending disabled: RESEND_API_KEY not configured`);
    console.warn(`⚠️  Password reset email would have been sent to ${email}`);
    console.warn(`⚠️  Password reset token: ${token}`);
    return;
  }

  // Determine frontend URL based on role
  let frontendUrl: string;
  if (_role === 'CLIENT') {
    frontendUrl = process.env.FRONTEND_URL_CLIENT || 'http://localhost:5173';
  } else if (_role === 'ADMIN') {
    frontendUrl = process.env.FRONTEND_URL_ADMIN || 'http://localhost:5175';
  } else {
    frontendUrl = process.env.FRONTEND_URL_TRAINER || 'http://localhost:5174';
  }

  const resetUrl = `${frontendUrl}/reset-password?t=${token}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">TrainMICE</h1>
        </div>
        
        <div style="background:rgb(255, 255, 255); padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>
          
          <p>Hello,</p>
          
          <p>We received a request to reset your password for your TrainMICE account.</p>
          
          <p>Please click the button below to reset your password:</p>
          
          <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
            <tr>
              <td align="center">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="background: #14b8a6; border-radius: 5px;">
                      <a href="${resetUrl}" 
                         style="display: block; padding: 15px 30px; text-decoration: none; 
                                color: #ffd700; font-weight: bold; font-size: 16px; 
                                border-radius: 5px; font-family: Arial, sans-serif;">
                        Reset Password
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          
          <p style="font-size: 12px; color: #999; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 20px;">
            This password reset link will expire in 1 hour.<br>
            If you did not request a password reset, please ignore this email and your password will remain unchanged.
          </p>
        </div>
      </body>
    </html>
  `;

  const textContent = `
Hello,

We received a request to reset your password for your TrainMICE account.

Please open this email in an HTML-capable email client and click the "Reset Password" button to reset your password.

This password reset link will expire in 1 hour.

If you did not request a password reset, please ignore this email and your password will remain unchanged.

Best regards,
TrainMICE Team
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: `TrainMICE <${config.email.fromEmail}>`,
      to: [email],
      subject: 'Reset Your TrainMICE Password',
      html: htmlContent,
      text: textContent,
    });

    if (error) {
      console.error('Resend API error:', error);
      return;
    }

    console.log('✅ Password reset email sent successfully:', data?.id);
  } catch (error: any) {
    console.error('Error sending password reset email (non-blocking):', error.message || error);
  }
}

interface SendAdminWelcomeEmailParams {
  email: string;
  fullName?: string;
  loginUrl: string;
}

export async function sendAdminWelcomeEmail({
  email,
  fullName,
  loginUrl,
}: SendAdminWelcomeEmailParams): Promise<void> {
  // Check if Resend is configured
  if (!resend) {
    console.warn(`⚠️  Email sending disabled: RESEND_API_KEY not configured`);
    console.warn(`⚠️  Admin welcome email would have been sent to ${email}`);
    console.warn(`⚠️  Login URL: ${loginUrl}`);
    return;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to TrainMICE Admin</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">TrainMICE</h1>
        </div>
        
        <div style="background:rgb(255, 255, 255); padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">Welcome to TrainMICE Admin Dashboard!</h2>
          
          <p>Hello ${fullName || 'there'},</p>
          
          <p>Your admin account has been successfully created. You can now access the TrainMICE Admin Dashboard to manage the training platform.</p>
          
          <p>Please click the button below to log in to your admin account:</p>
          
          <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
            <tr>
              <td align="center">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="background: #14b8a6; border-radius: 5px;">
                      <a href="${loginUrl}" 
                         style="display: block; padding: 15px 30px; text-decoration: none; 
                                color: #ffd700; font-weight: bold; font-size: 16px; 
                                border-radius: 5px; font-family: Arial, sans-serif;">
                        Access Admin Dashboard
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          
          <p style="font-size: 14px; color: #666; margin-top: 20px;">
            <strong>Your login credentials:</strong><br>
            Email: ${email}<br>
            (Use the password you set during registration)
          </p>
          
          <p style="font-size: 12px; color: #999; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 20px;">
            If you did not create this account, please contact support immediately.
          </p>
        </div>
      </body>
    </html>
  `;

  const textContent = `
Welcome to TrainMICE Admin Dashboard!

Hello ${fullName || 'there'},

Your admin account has been successfully created. You can now access the TrainMICE Admin Dashboard to manage the training platform.

Please use the following link to log in to your admin account:
${loginUrl}

Your login credentials:
Email: ${email}
(Use the password you set during registration)

If you did not create this account, please contact support immediately.

Best regards,
TrainMICE Team
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: `TrainMICE <${config.email.fromEmail}>`,
      to: [email],
      subject: 'Welcome to TrainMICE Admin Dashboard',
      html: htmlContent,
      text: textContent,
    });

    if (error) {
      console.error('Resend API error:', error);
      return;
    }

    console.log('✅ Admin welcome email sent successfully:', data?.id);
  } catch (error: any) {
    console.error('Error sending admin welcome email (non-blocking):', error.message || error);
  }
}

// Export resend client for potential future use
export default resend;
