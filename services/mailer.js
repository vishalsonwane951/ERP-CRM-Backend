import nodemailer from "nodemailer";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

// One place that sends email. Amazon SES by default (the project already uses AWS), or any SMTP server (MAIL_TRANSPORT=smtp).
// MAIL_TRANSPORT=log prints emails to the console instead of sending them (local development and tests)
export const sentLog = [];
const logTransport = {
  sendMail: async (m) => {
    sentLog.push({ to: m.to, subject: m.subject, attachments: (m.attachments || []).map((a) => a.filename) });
    console.log(`[mail] to ${m.to}: ${m.subject}${m.attachments?.length ? ` (+${m.attachments.length} attachment)` : ""}`);
  },
};

let transport;
const getTransport = () => {
  if (process.env.MAIL_TRANSPORT === "log") return logTransport;
  transport ??= process.env.MAIL_TRANSPORT === "smtp"
    ? nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587, secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
    : nodemailer.createTransport({ SES: { sesClient: new SESv2Client({ region: process.env.AWS_REGION }), SendEmailCommand } });
  return transport;
};

/** sendMail({ to, subject, text, attachments: [{ filename, content: Buffer }] }). Throws when the mail could not be sent. */
export const sendMail = async ({ to, subject, text, attachments }) => {
  if (!process.env.MAIL_FROM) throw new Error("MAIL_FROM is not set, so email cannot be sent");
  await getTransport().sendMail({ from: process.env.MAIL_FROM, to, subject, text, attachments });
};

// Setting it up wrong should be easy to read in the list of failed emails
export const mailErrorText = (e) => String(e?.message || e).slice(0, 300);
