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
  role,
}: SendVerificationEmailParams): Promise<void> {
  // Check if Resend is configured
  if (!resend) {
    console.warn(`⚠️  Email sending disabled: RESEND_API_KEY not configured`);
    console.warn(`⚠️  Verification email would have been sent to ${email}`);
    console.warn(`⚠️  Verification token: ${token}`);
    return; // Don't throw error, just skip email sending
  }

  const verificationUrl = `${config.app.baseUrl}/api/auth/verify-email?token=${token}`;
  
  // For frontend redirect, use the appropriate frontend URL
  const frontendUrl = role === 'CLIENT' 
    ? config.cors.clientUrl 
    : config.cors.trainerUrl;

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
        
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">Hello,</h2>
          
          <p>Thank you for signing up with TrainMICE!</p>
          
          <p>Please click the button below to verify your email address and activate your account:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; padding: 15px 30px; text-decoration: none; 
                      border-radius: 5px; font-weight: bold; font-size: 16px;">
              Verify Email Address
            </a>
          </div>
          
          <p style="font-size: 12px; color: #666; margin-top: 30px;">
            Or copy and paste this link into your browser:<br>
            <a href="${verificationUrl}" style="color: #667eea; word-break: break-all;">${verificationUrl}</a>
          </p>
          
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

Please click the link below to verify your email address and activate your account:

${verificationUrl}

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

// Export resend client for potential future use
export default resend;
