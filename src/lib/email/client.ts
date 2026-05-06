import { Resend } from 'resend';
import { logger } from '@/lib/logger';

let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  _resend = new Resend(key);
  return _resend;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  preheader?: string;
  html: string;
  from?: string;
}

const DEFAULT_FROM = process.env.RESEND_FROM ?? 'Tenderim <noreply@viraly-ai.com>';

export async function sendEmail({ to, subject, html, from }: SendEmailParams): Promise<string | null> {
  try {
    const { data, error } = await getResend().emails.send({
      from: from ?? DEFAULT_FROM,
      to,
      subject,
      html,
    });
    if (error) {
      logger.warn({ error, to, subject }, 'resend send failed');
      return null;
    }
    logger.info({ id: data?.id, to, subject }, 'email sent');
    return data?.id ?? null;
  } catch (err) {
    logger.warn({ err, to, subject }, 'resend send threw');
    return null;
  }
}
