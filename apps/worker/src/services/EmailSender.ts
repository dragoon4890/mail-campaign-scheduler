export interface SendEmailRequest {
  senderId: number;
  from: string;
  to: string;
  subject: string;
  body: string;
}

export interface EmailSender {
  send(request: SendEmailRequest): Promise<{ messageId: string }>;
}
