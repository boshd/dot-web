const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  sender_user_id: string | null;
  sender_display_name: string | null;
  is_current_user: boolean;
};

export type ChatMember = {
  user_id: string | null;
  display_name: string;
  role: "owner" | "member";
};

export type ChatUser = {
  user_id: string;
  display_name: string | null;
  onboarding_status: "collecting_profile" | "complete";
};

export type ChatSession = {
  conversation_id: string;
  conversation_kind: "direct" | "group";
  conversation_title: string;
  user: ChatUser;
  messages: ChatMessage[];
  members: ChatMember[];
};

export type ChatTurn = {
  conversation_id: string;
  user: ChatUser;
  assistant_message: ChatMessage | null;
  assistant_messages: ChatMessage[];
  replied: boolean;
};

export type ConversationSummary = {
  id: string;
  kind: "direct" | "group";
  title: string;
  updated_at: string;
  members: ChatMember[];
};

export type PhoneAuthChallenge = {
  method_id: string;
  expires_in_seconds: number;
};

export type IntegrationConnection = {
  account_id: string;
  email: string | null;
  label: string;
  display_name: string | null;
  status: string;
  account_count: number;
  subscription_status: string | null;
  subscription_expires_at: string | null;
};

export type IntegrationCatalogItem = {
  key: string;
  provider: string;
  name: string;
  description: string;
  category: string;
  availability: "available" | "coming_soon";
  connections: IntegrationConnection[];
};

export type IntegrationCatalog = {
  integrations: IntegrationCatalogItem[];
};

export type IntegrationConnect = {
  flow: "redirect" | "plaid_link";
  authorization_url: string | null;
  link_token: string | null;
  exchange_token: string | null;
  expires_at: string;
};

export type GeneratedAppSummary = {
  id: string;
  public_id: string;
  title: string;
  description: string;
  template: "budget" | "expense_splitter" | "metric_tracker" | "checklist";
  theme: "coral" | "sage" | "ocean" | "plum" | "gold";
  access_mode: "private_link" | "collaborative_link";
  app_url: string;
  created_at: string;
  updated_at: string;
};

export type GeneratedAppRecord = {
  id: string;
  kind: string;
  actor_name: string | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GeneratedAppDetail = GeneratedAppSummary & {
  specification: {
    schema_version: number;
    template: GeneratedAppSummary["template"];
    theme: GeneratedAppSummary["theme"];
    settings: Record<string, unknown>;
    capabilities: string[];
  };
  records: GeneratedAppRecord[];
};

export class BenjiApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function errorMessage(detail: unknown): string | undefined {
  if (typeof detail === "string") return detail;
  if (!Array.isArray(detail)) return undefined;
  const messages = detail.flatMap((item) => {
    if (!item || typeof item !== "object" || !("msg" in item)) return [];
    return typeof item.msg === "string" ? [item.msg.replace(/^Value error,\s*/i, "")] : [];
  });
  return messages.length ? messages.join(" ") : undefined;
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
  authToken?: string,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new BenjiApiError(
      errorMessage(payload?.detail) ?? "Dot couldn’t complete that request.",
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

async function request<T>(path: string, body: object, authToken?: string): Promise<T> {
  return requestJson<T>(
    path,
    { method: "POST", body: JSON.stringify(body) },
    authToken,
  );
}

export function openChatSession(input: {
  phoneNumber?: string;
  authToken?: string;
  conversationId?: string;
}): Promise<ChatSession> {
  return request<ChatSession>(
    "/api/v1/web/chat/session",
    {
      phone_number: input.phoneNumber,
      conversation_id: input.conversationId,
    },
    input.authToken,
  );
}

export function loadConversations(input: {
  phoneNumber?: string;
  authToken?: string;
}): Promise<{ conversations: ConversationSummary[] }> {
  const query = input.phoneNumber
    ? `?phone_number=${encodeURIComponent(input.phoneNumber)}`
    : "";
  return requestJson<{ conversations: ConversationSummary[] }>(
    `/api/v1/web/conversations${query}`,
    {},
    input.authToken,
  );
}

export function createGroup(input: {
  title: string;
  phoneNumber?: string;
  authToken?: string;
}): Promise<ConversationSummary> {
  return request<ConversationSummary>(
    "/api/v1/web/conversations/groups",
    { title: input.title, phone_number: input.phoneNumber },
    input.authToken,
  );
}

export function createGroupInvite(input: {
  conversationId: string;
  phoneNumber?: string;
  authToken?: string;
}): Promise<{ invite_url: string; expires_at: string }> {
  return request<{ invite_url: string; expires_at: string }>(
    `/api/v1/web/conversations/groups/${input.conversationId}/invites`,
    { phone_number: input.phoneNumber },
    input.authToken,
  );
}

export function joinGroupInvite(input: {
  token: string;
  phoneNumber?: string;
  authToken?: string;
}): Promise<ConversationSummary> {
  return request<ConversationSummary>(
    "/api/v1/web/conversations/groups/join",
    { token: input.token, phone_number: input.phoneNumber },
    input.authToken,
  );
}

export function sendChatMessage(input: {
  phoneNumber?: string;
  authToken?: string;
  conversationId: string;
  clientMessageId: string;
  content: string;
}): Promise<ChatTurn> {
  return request<ChatTurn>(
    "/api/v1/web/chat/messages",
    {
      phone_number: input.phoneNumber,
      conversation_id: input.conversationId,
      client_message_id: input.clientMessageId,
      content: input.content,
    },
    input.authToken,
  );
}

export function startPhoneAuthentication(phoneNumber: string): Promise<PhoneAuthChallenge> {
  return request<PhoneAuthChallenge>("/api/v1/auth/otp/start", {
    phone_number: phoneNumber,
  });
}

export function loadIntegrationCatalog(input: {
  phoneNumber?: string;
  authToken?: string;
}): Promise<IntegrationCatalog> {
  return request<IntegrationCatalog>(
    "/api/v1/integrations/catalog",
    { phone_number: input.phoneNumber },
    input.authToken,
  );
}

export function connectIntegration(input: {
  integrationKey: string;
  phoneNumber?: string;
  authToken?: string;
}): Promise<IntegrationConnect> {
  return request<IntegrationConnect>(
    `/api/v1/integrations/${input.integrationKey}/connect`,
    { phone_number: input.phoneNumber },
    input.authToken,
  );
}

export function createPlaidLinkFromConnectToken(
  connectToken: string,
): Promise<IntegrationConnect> {
  return request<IntegrationConnect>(
    "/api/v1/integrations/plaid/link-token/from-connect-link",
    { connect_token: connectToken },
  );
}

export function reconnectPlaidConnection(input: {
  connectionId: string;
  phoneNumber?: string;
  authToken?: string;
}): Promise<IntegrationConnect> {
  return request<IntegrationConnect>(
    `/api/v1/integrations/plaid/${input.connectionId}/reconnect`,
    { phone_number: input.phoneNumber },
    input.authToken,
  );
}

export function disconnectPlaidConnection(input: {
  connectionId: string;
  phoneNumber?: string;
  authToken?: string;
}): Promise<{ disconnected: boolean }> {
  return requestJson<{ disconnected: boolean }>(
    `/api/v1/integrations/plaid/${input.connectionId}`,
    {
      method: "DELETE",
      body: JSON.stringify({ phone_number: input.phoneNumber }),
    },
    input.authToken,
  );
}

export function exchangePlaidToken(input: {
  publicToken: string;
  exchangeToken: string;
  institutionId?: string;
  institutionName?: string;
}): Promise<{ connection_id: string; institution_name: string; sync_status: string }> {
  return request<{ connection_id: string; institution_name: string; sync_status: string }>(
    "/api/v1/integrations/plaid/exchange",
    {
      public_token: input.publicToken,
      exchange_token: input.exchangeToken,
      institution_id: input.institutionId,
      institution_name: input.institutionName,
    },
  );
}

export function loadGeneratedApps(input: {
  phoneNumber?: string;
  authToken?: string;
}): Promise<{ apps: GeneratedAppSummary[] }> {
  return request<{ apps: GeneratedAppSummary[] }>(
    "/api/v1/apps/catalog",
    { phone_number: input.phoneNumber },
    input.authToken,
  );
}

export function loadPublicGeneratedApp(publicId: string): Promise<GeneratedAppDetail> {
  return requestJson<GeneratedAppDetail>(`/api/v1/apps/public/${publicId}`);
}

export function addGeneratedAppRecord(input: {
  publicId: string;
  kind: string;
  data: Record<string, unknown>;
  actorName?: string;
}): Promise<GeneratedAppDetail> {
  return requestJson<GeneratedAppDetail>(
    `/api/v1/apps/public/${input.publicId}/records`,
    {
      method: "POST",
      body: JSON.stringify({
        kind: input.kind,
        data: input.data,
        actor_name: input.actorName,
      }),
    },
  );
}

export function updateGeneratedAppRecord(input: {
  publicId: string;
  recordId: string;
  data: Record<string, unknown>;
}): Promise<GeneratedAppDetail> {
  return requestJson<GeneratedAppDetail>(
    `/api/v1/apps/public/${input.publicId}/records/${input.recordId}`,
    { method: "PATCH", body: JSON.stringify({ data: input.data }) },
  );
}

export function deleteGeneratedAppRecord(input: {
  publicId: string;
  recordId: string;
}): Promise<GeneratedAppDetail> {
  return requestJson<GeneratedAppDetail>(
    `/api/v1/apps/public/${input.publicId}/records/${input.recordId}`,
    { method: "DELETE" },
  );
}
