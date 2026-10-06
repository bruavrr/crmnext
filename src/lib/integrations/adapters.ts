import { AppError } from "../db";
/** Tokens live in server-side secret storage. No official connection is configured yet. */
export type Channel = "whatsapp" | "instagram";
export type InboundMessage = {
  externalId: string;
  channel: Channel;
  contact: { name: string; phone?: string; instagram?: string };
  body: string;
  receivedAt: Date;
};
export interface MessagingAdapter {
  readonly provider: Channel;
  readonly connected: boolean;
  verifyWebhook(rawBody: string, headers: Headers): Promise<boolean>;
  sendMessage(recipient: string, body: string): Promise<{ externalId: string }>;
  testConnection(): Promise<{ connected: boolean; reason?: string }>;
}
export class DisconnectedMetaAdapter implements MessagingAdapter {
  readonly connected = false;
  constructor(public readonly provider: Channel) {}
  async verifyWebhook() {
    return false;
  }
  async sendMessage(): Promise<{ externalId: string }> {
    throw new AppError(503, `${this.provider}: API oficial não configurada`);
  }
  async testConnection() {
    return {
      connected: false,
      reason:
        "Aplicativo Meta, permissões, ativos empresariais e OAuth não configurados",
    };
  }
}
export interface CalendarAdapter {
  readonly connected: boolean;
  createEvent(input: {
    title: string;
    startsAt: Date;
    endsAt: Date;
  }): Promise<{ externalId: string }>;
}
export class DisconnectedCalendarAdapter implements CalendarAdapter {
  readonly connected = false;
  async createEvent(): Promise<{ externalId: string }> {
    throw new AppError(503, "Google Calendar: OAuth não configurado");
  }
}
export const messagingAdapters = {
  whatsapp: new DisconnectedMetaAdapter("whatsapp"),
  instagram: new DisconnectedMetaAdapter("instagram"),
};
