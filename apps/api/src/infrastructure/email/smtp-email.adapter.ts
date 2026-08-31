import type { EmailDeliveryPort } from '@dentpilot/application';
import nodemailer, { type Transporter } from 'nodemailer';

export class SmtpEmailAdapter implements EmailDeliveryPort {
  private readonly transporter: Transporter;

  public constructor(private readonly config: {
    readonly host: string;
    readonly port: number;
    readonly username: string;
    readonly password: string;
    readonly from: string;
  }) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.username, pass: config.password },
    });
  }

  public async sendAccountAction(input: {
    readonly to: string;
    readonly displayName: string;
    readonly purpose: 'verify_email' | 'reset_password';
    readonly actionUrl: string;
  }): Promise<void> {
    const subject = input.purpose === 'verify_email' ? 'Verify your DentPilot email' : 'Reset your DentPilot password';
    const instruction = input.purpose === 'verify_email' ? 'verify your email address' : 'reset your password';
    await this.transporter.sendMail({
      from: this.config.from,
      to: input.to,
      subject,
      text: `Hello ${input.displayName}, use this secure link to ${instruction}: ${input.actionUrl}`,
    });
  }
}
