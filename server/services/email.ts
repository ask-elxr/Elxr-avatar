import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@resend.dev';

class EmailService {
  private resend: Resend | null = null;
  private fromEmail: string;

  constructor() {
    this.fromEmail = RESEND_FROM_EMAIL;
    
    if (RESEND_API_KEY) {
      this.resend = new Resend(RESEND_API_KEY);
      console.log(`📧 Email service initialized with Resend (from: ${this.fromEmail})`);
      
      if (this.fromEmail === 'noreply@resend.dev') {
        console.warn('⚠️ Using Resend sandbox domain - emails can only be sent to account owner');
        console.warn('   Set RESEND_FROM_EMAIL to use a verified domain (e.g., noreply@mail.yourdomain.com)');
      }
    } else {
      console.warn('⚠️ RESEND_API_KEY not configured - email notifications disabled');
    }
  }

  isAvailable(): boolean {
    return this.resend !== null;
  }

  async sendVideoReadyEmail(params: {
    toEmail: string;
    userName?: string;
    topic: string;
    videoUrl: string;
    thumbnailUrl?: string;
    avatarName: string;
    duration?: number;
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.resend) {
      console.log('📧 Email service not available - skipping notification');
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const { toEmail, userName, topic, videoUrl, thumbnailUrl, avatarName, duration } = params;
      
      const durationText = duration 
        ? `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`
        : 'Unknown';

      const greeting = userName ? `Hi ${userName},` : 'Hi there,';

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Video is Ready!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">🎬 Your Video is Ready!</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px 40px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                ${greeting}
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Great news! Your video about <strong>"${topic}"</strong> has finished generating and is ready to watch.
              </p>
              
              <!-- Video Info Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #f9fafb; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;">
                    ${thumbnailUrl ? `
                    <div style="margin-bottom: 15px; text-align: center;">
                      <img src="${thumbnailUrl}" alt="Video thumbnail" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    </div>
                    ` : ''}
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 5px 0; color: #6b7280; font-size: 14px;">Topic:</td>
                        <td style="padding: 5px 0; color: #111827; font-size: 14px; font-weight: 500;">${topic}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #6b7280; font-size: 14px;">Presented by:</td>
                        <td style="padding: 5px 0; color: #111827; font-size: 14px; font-weight: 500;">${avatarName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #6b7280; font-size: 14px;">Duration:</td>
                        <td style="padding: 5px 0; color: #111827; font-size: 14px; font-weight: 500;">${durationText}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${videoUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.4);">
                      Watch Your Video →
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 20px 0 0; color: #6b7280; font-size: 14px; text-align: center;">
                Or copy this link: <a href="${videoUrl}" style="color: #667eea; word-break: break-all;">${videoUrl}</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                This video was generated by your AI Avatar assistant.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim();

      const textContent = `
${greeting}

Great news! Your video about "${topic}" has finished generating and is ready to watch.

Video Details:
- Topic: ${topic}
- Presented by: ${avatarName}
- Duration: ${durationText}

Watch your video here: ${videoUrl}

This video was generated by your AI Avatar assistant.
      `.trim();

      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: toEmail,
        subject: `🎬 Your video about "${topic}" is ready!`,
        html: htmlContent,
        text: textContent,
      });

      console.log(`📧 Email sent successfully to ${toEmail} for video: ${topic}`);
      return { success: true };
    } catch (error: any) {
      console.error('📧 Failed to send email:', error.message);
      return { success: false, error: error.message };
    }
  }
}

export const emailService = new EmailService();
