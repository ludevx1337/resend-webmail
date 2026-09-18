import { Resend } from "resend";

export function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  return new Resend(apiKey);
}

export function getDefaultFrom() {
  return process.env.RESEND_FROM || "onboarding@resend.dev";
}
