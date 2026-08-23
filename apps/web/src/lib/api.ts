export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface EmailRow {
  id: string;
  toEmail: string;
  subject: string;
  body: string;
  preview: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
}

export interface EmailListResponse {
  status: string;
  count: number;
  emails: EmailRow[];
}

export interface Stats {
  scheduled: number;
  sent: number;
  failed: number;
}

export async function fetchList(
  status: "scheduled" | "sent" | "failed",
): Promise<EmailListResponse> {
  const res = await fetch(`${API_URL}/api/v1/emails?status=${status}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`list ${status} failed: ${res.status}`);
  return res.json();
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${API_URL}/api/v1/emails/stats`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`stats failed: ${res.status}`);
  return res.json();
}

export interface EmailDetail extends EmailRow {
  senderEmail: string;
}

export async function fetchEmail(id: string): Promise<EmailDetail> {
  const res = await fetch(`${API_URL}/api/v1/emails/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`email ${id} failed: ${res.status}`);
  return res.json();
}

export interface Sender {
  id: number;
  email: string;
}

export async function fetchSenders(): Promise<Sender[]> {
  const res = await fetch(`${API_URL}/api/v1/senders`, { cache: "no-store" });
  if (!res.ok) throw new Error(`senders failed: ${res.status}`);
  const data = await res.json();
  return data.senders;
}
