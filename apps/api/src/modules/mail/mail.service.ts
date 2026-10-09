import { Injectable, Logger } from '@nestjs/common';
// nodemailer ships without bundled types; we only use createTransport/sendMail.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = require('nodemailer') as {
  createTransport(opts: unknown): { sendMail(msg: unknown): Promise<unknown> };
};
import { env } from '../../config/env';

export interface SentMail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Transactional email. Local dev sends to Mailpit (http://localhost:8025).
 * MAIL_TRANSPORT=memory keeps messages in-process for automated tests.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  /** Only populated with MAIL_TRANSPORT=memory (tests). */
  readonly outbox: SentMail[] = [];
  private transport = env().MAIL_TRANSPORT === 'smtp'
    ? nodemailer.createTransport({
        host: env().SMTP_HOST,
        port: env().SMTP_PORT,
        secure: env().SMTP_SECURE,
        auth: env().SMTP_USER ? { user: env().SMTP_USER, pass: env().SMTP_PASSWORD } : undefined,
      })
    : null;

  async send(mail: SentMail): Promise<void> {
    if (!this.transport) {
      this.outbox.push(mail);
      return;
    }
    try {
      await this.transport.sendMail({ from: env().MAIL_FROM, ...mail });
    } catch (err) {
      // Never log the message body: it contains one-time codes.
      this.logger.error({ err, subject: mail.subject }, 'failed to send email');
      throw err;
    }
  }
}
