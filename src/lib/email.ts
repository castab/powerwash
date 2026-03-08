import { getEnv } from "@/lib/env";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail(input: SendEmailInput) {
  const env = getEnv();

  if (!env.resendApiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }

  if (!env.emailFrom) {
    throw new Error("Missing EMAIL_FROM");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Unable to send email: ${body || response.statusText}`);
  }
}
