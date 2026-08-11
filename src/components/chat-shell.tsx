"use client";

import type { ConfirmationResult, RecaptchaVerifier as RecaptchaVerifierType } from "firebase/auth";
import {
  isSignInWithEmailLink,
  RecaptchaVerifier,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPhoneNumber,
  signOut as firebaseSignOut,
} from "firebase/auth";
import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import {
  BenjiApiError,
  AuthToken,
  ChatMember,
  ChatMessage,
  ChatUser,
  checkAuthEligibility,
  ConversationSummary,
  createGroup,
  createGroupInvite,
  joinGroupInvite,
  loadConversations,
  openChatSession,
  sendChatMessage,
} from "@/lib/api";
import { AppsPanel } from "@/components/apps-panel";
import {
  getFirebaseAuth,
  useDotAuth,
} from "@/components/benji-auth-provider";
import { IntegrationsPanel } from "@/components/integrations-panel";

type StoredSession = {
  phoneNumber: string;
};

type FailedTurn = {
  clientMessageId: string;
  content: string;
};

const STORAGE_KEY = "benji-web-dev-session-v2";
const EMAIL_FOR_SIGN_IN_KEY = "dot-email-for-sign-in";
const suggestions = [
  "help me plan my week",
  "i need a second opinion",
  "let’s figure out a simple budget",
];

function assistantBubbleDelayMs(content: string) {
  const estimatedTypingMs = 600 + content.trim().length * 22;
  return Math.min(3_200, Math.max(800, estimatedTypingMs));
}

function readStoredSession(): StoredSession | null {
  try {
    const value = optionalStorageGet(STORAGE_KEY);
    return value ? (JSON.parse(value) as StoredSession) : null;
  } catch {
    return null;
  }
}

function persistSession(session: StoredSession) {
  optionalStorageSet(STORAGE_KEY, JSON.stringify(session));
}

function optionalStorageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function optionalStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Browser storage is a convenience, not part of authentication success.
  }
}

function optionalStorageRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Browser storage may be unavailable in private or restricted contexts.
  }
}

function normalizePhoneInput(value: string) {
  return value.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
}

function isPlausiblePhone(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function MessageContent({ content }: { content: string }) {
  const linkPattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of content.matchAll(linkPattern)) {
    const start = match.index;
    if (start > cursor) nodes.push(content.slice(cursor, start));
    const url = match[2] ?? match[3];
    nodes.push(
      <a
        key={`${start}-${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-current/35 underline-offset-2 transition hover:decoration-current"
      >
        {match[1] ?? url}
      </a>,
    );
    cursor = start + match[0].length;
  }
  if (cursor < content.length) nodes.push(content.slice(cursor));
  return <>{nodes}</>;
}

export function ChatShell() {
  const { configured, initialized, user, idToken, error } = useDotAuth();
  const [pendingEmailLink, setPendingEmailLink] = useState<boolean>();
  const getAuthToken = useCallback(() => user?.getIdToken(), [user]);
  const signOut = useCallback(() => {
    const auth = getFirebaseAuth();
    if (auth) void firebaseSignOut(auth);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const auth = getFirebaseAuth();
      setPendingEmailLink(Boolean(auth && isSignInWithEmailLink(auth, window.location.href)));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!configured) {
    return process.env.NODE_ENV === "development" ? <ChatClient /> : <AuthUnavailable />;
  }
  if (pendingEmailLink === undefined) return <BenjiLoading />;
  if (pendingEmailLink) return <FirebaseAuthScreen initialError={error} />;
  if (!initialized || (user && !idToken)) return <BenjiLoading />;
  if (!user) return <FirebaseAuthScreen initialError={error} />;

  return (
    <ChatClient
      authenticated
      authenticatedIdentifier={user.phoneNumber ?? user.email ?? undefined}
      getAuthToken={getAuthToken}
      onSignOut={signOut}
    />
  );
}

function AuthUnavailable() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 text-foreground">
      <section className="w-full max-w-md rounded-[30px] border border-black/8 bg-white/80 p-7 text-center shadow-[0_24px_70px_rgba(47,39,30,0.1)]">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-(--coral) text-xl font-semibold text-white">
          d
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">dot is getting ready</h1>
        <p className="mt-3 text-sm leading-6 text-black/50">
          Secure sign-in isn’t configured on this deployment yet.
        </p>
      </section>
    </main>
  );
}

function BenjiLoading() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background text-foreground">
      <div className="flex items-center gap-3 text-sm font-semibold">
        <span className="grid size-10 place-items-center rounded-2xl bg-(--coral) text-white">
          d
        </span>
        dot
      </div>
    </main>
  );
}

type AuthStage = "identifier" | "phone_code" | "email_sent" | "email_link";

function firebaseErrorMessage(authError: unknown, fallback: string) {
  const code = typeof authError === "object" && authError && "code" in authError
    ? String(authError.code)
    : "";
  const messages: Record<string, string> = {
    "auth/captcha-check-failed": "The security check expired. Please try again.",
    "auth/code-expired": "That code expired. Request a new one.",
    "auth/expired-action-code": "That email link expired. Request a fresh one.",
    "auth/invalid-action-code": "That email link is invalid or has already been used.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/invalid-phone-number": "Use the full international number, including + and country code.",
    "auth/invalid-verification-code": "That code didn’t work. Check it and try again.",
    "auth/network-request-failed": "The connection dropped. Please try again.",
    "auth/quota-exceeded": "SMS sign-in is temporarily unavailable. Try email instead.",
    "auth/too-many-requests": "Too many attempts. Give it a little time, then try again.",
    "auth/unauthorized-domain": "This web address hasn’t been authorized for Dot sign-in yet.",
  };
  return messages[code] ?? fallback;
}

function emailSignInCallbackUrl() {
  const callbackUrl = new URL("/", window.location.origin);
  callbackUrl.searchParams.set("auth", "email");
  return callbackUrl.toString();
}

function leaveEmailSignInUrl() {
  window.location.replace(new URL("/", window.location.origin).toString());
}

function FirebaseAuthScreen({ initialError }: { initialError?: string }) {
  const auth = getFirebaseAuth();
  const [identifierDraft, setIdentifierDraft] = useState("");
  const [stage, setStage] = useState<AuthStage>("identifier");
  const [code, setCode] = useState("");
  const [resendAvailableIn, setResendAvailableIn] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(initialError);
  const confirmationResultRef = useRef<ConfirmationResult | undefined>(undefined);
  const recaptchaVerifierRef = useRef<RecaptchaVerifierType | undefined>(undefined);
  const emailLinkAttemptRef = useRef(false);

  const completeEmailLink = useCallback(async (identifier: string) => {
    if (!auth || emailLinkAttemptRef.current) return;
    emailLinkAttemptRef.current = true;
    setIsSubmitting(true);
    setError(undefined);
    try {
      const eligibility = await checkAuthEligibility(identifier.trim());
      if (eligibility.kind !== "email") {
        throw new Error("This sign-in link needs the email address it was sent to.");
      }
      setIdentifierDraft(eligibility.normalized_identifier);
      if (auth.currentUser) await firebaseSignOut(auth);
      await signInWithEmailLink(auth, eligibility.normalized_identifier, window.location.href);
      optionalStorageRemove(EMAIL_FOR_SIGN_IN_KEY);
      leaveEmailSignInUrl();
    } catch (authError) {
      emailLinkAttemptRef.current = false;
      setError(
        authError instanceof BenjiApiError
          ? authError.message
          : firebaseErrorMessage(authError, "That email link couldn’t sign you in. Request a fresh one."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [auth]);

  useEffect(() => {
    if (!auth || !isSignInWithEmailLink(auth, window.location.href)) return;
    const timeout = window.setTimeout(() => {
      setStage("email_link");
      void (async () => {
        if (auth.currentUser) await firebaseSignOut(auth).catch(() => undefined);
        const savedEmail = optionalStorageGet(EMAIL_FOR_SIGN_IN_KEY);
        if (savedEmail) {
          setIdentifierDraft(savedEmail);
          await completeEmailLink(savedEmail);
        }
      })();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [auth, completeEmailLink]);

  useEffect(() => () => recaptchaVerifierRef.current?.clear(), []);

  const resendCooldownActive = resendAvailableIn > 0;
  useEffect(() => {
    if (stage !== "phone_code" || !resendCooldownActive) return;
    const interval = window.setInterval(() => {
      setResendAvailableIn((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [resendCooldownActive, stage]);

  function resetFlow() {
    optionalStorageRemove(EMAIL_FOR_SIGN_IN_KEY);
    if (stage === "email_link") {
      leaveEmailSignInUrl();
      return;
    }
    recaptchaVerifierRef.current?.clear();
    recaptchaVerifierRef.current = undefined;
    confirmationResultRef.current = undefined;
    emailLinkAttemptRef.current = false;
    setStage("identifier");
    setCode("");
    setResendAvailableIn(0);
    setError(undefined);
  }

  async function requestPhoneCode(phoneNumber: string, verifierElementId: string) {
    if (!auth) return;
    recaptchaVerifierRef.current?.clear();
    confirmationResultRef.current = undefined;
    const verifier = new RecaptchaVerifier(auth, verifierElementId, {
      size: "invisible",
    });
    recaptchaVerifierRef.current = verifier;
    confirmationResultRef.current = await signInWithPhoneNumber(
      auth,
      phoneNumber,
      verifier,
    );
    setCode("");
    setResendAvailableIn(30);
    setStage("phone_code");
  }

  async function beginAuthentication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    if (stage === "email_link") {
      await completeEmailLink(identifierDraft);
      return;
    }

    const enteredIdentifier = identifierDraft.trim();
    if (!enteredIdentifier) return;
    setIsSubmitting(true);
    setError(undefined);
    try {
      const eligibility = await checkAuthEligibility(enteredIdentifier);
      setIdentifierDraft(eligibility.normalized_identifier);
      if (eligibility.kind === "phone") {
        await requestPhoneCode(eligibility.normalized_identifier, "auth-continue-button");
      } else {
        await sendSignInLinkToEmail(auth, eligibility.normalized_identifier, {
          url: emailSignInCallbackUrl(),
          handleCodeInApp: true,
        });
        optionalStorageSet(EMAIL_FOR_SIGN_IN_KEY, eligibility.normalized_identifier);
        setStage("email_sent");
      }
    } catch (authError) {
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = undefined;
      setError(
        authError instanceof BenjiApiError
          ? authError.message
          : firebaseErrorMessage(authError, "I couldn’t start sign-in. Try again in a moment."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmationResultRef.current || code.length < 4) return;
    setIsSubmitting(true);
    setError(undefined);
    try {
      await confirmationResultRef.current.confirm(code);
    } catch (authError) {
      setError(firebaseErrorMessage(authError, "That code didn’t work. Check it and try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resendCode() {
    if (!auth || isSubmitting || resendAvailableIn > 0) return;
    setIsSubmitting(true);
    setError(undefined);
    try {
      const eligibility = await checkAuthEligibility(identifierDraft);
      if (eligibility.kind !== "phone") {
        setError("Use the phone number that should receive the verification code.");
        return;
      }
      setIdentifierDraft(eligibility.normalized_identifier);
      await requestPhoneCode(eligibility.normalized_identifier, "auth-resend-button");
    } catch (authError) {
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = undefined;
      setError(
        authError instanceof BenjiApiError
          ? authError.message
          : firebaseErrorMessage(authError, "I couldn’t send another code. Try again in a moment."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const isPhoneCode = stage === "phone_code";
  const isEmailSent = stage === "email_sent";
  const isEmailLink = stage === "email_link";
  const identifierLooksLikeEmail = isEmailLink || identifierDraft.includes("@");

  return (
    <main className="grid min-h-dvh place-items-center overflow-hidden bg-background px-5 py-10 text-foreground">
      <div className="identity-glow" aria-hidden="true" />
      <section className="relative w-full max-w-md rounded-[32px] border border-black/8 bg-white/82 p-6 shadow-[0_28px_90px_rgba(47,39,30,0.12)] backdrop-blur-xl sm:p-9">
        <div className="grid size-12 place-items-center rounded-2xl bg-(--coral) text-xl font-semibold text-white shadow-[0_12px_30px_rgba(225,96,76,0.28)]">
          d
        </div>
        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-(--coral)">
          {isPhoneCode ? "check your phone" : isEmailSent ? "check your email" : "welcome back"}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
          {isPhoneCode
            ? "enter your code"
            : isEmailSent
              ? "we sent you a link"
              : isEmailLink
                ? "finish signing in"
                : "open dot"}
        </h1>
        <p className="mt-4 text-[15px] leading-7 text-black/52">
          {isPhoneCode
            ? `We sent a verification code to ${identifierDraft}. It arrives in a separate SMS and never becomes part of your Dot chat.`
            : isEmailSent
              ? `Open the private sign-in link sent to ${identifierDraft}. You can close this page afterward.`
              : isEmailLink
                ? "Confirm the email address that received this private link."
                : "Use the phone number or email address you message Dot from. There’s no separate web signup."}
        </p>

        {isPhoneCode ? (
          <form onSubmit={verifyCode} className="mt-8 space-y-3">
            <label htmlFor="verification-code" className="block text-sm font-medium text-black/70">
              verification code
            </label>
            <input
              id="verification-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, "").slice(0, 8));
                setError(undefined);
              }}
              autoFocus
              className="h-14 w-full rounded-2xl border border-black/10 bg-(--paper) px-4 font-mono text-xl tracking-[0.22em] outline-none transition focus:border-(--coral)/55 focus:ring-4 focus:ring-(--coral)/10"
            />
            {error && <p className="text-sm text-(--danger)">{error}</p>}
            <button
              type="submit"
              disabled={isSubmitting || code.length < 4}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-foreground px-5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting ? "checking…" : "open dot"}
            </button>
            <button
              id="auth-resend-button"
              type="button"
              onClick={() => void resendCode()}
              disabled={isSubmitting || resendAvailableIn > 0}
              className="h-10 w-full text-xs font-medium text-black/42 hover:text-black/65 disabled:cursor-not-allowed disabled:text-black/25"
            >
              {resendAvailableIn > 0
                ? `send another code in ${resendAvailableIn}s`
                : "send another code"}
            </button>
            <button
              type="button"
              onClick={resetFlow}
              className="h-10 w-full text-xs font-medium text-black/42 hover:text-black/65"
            >
              use a different phone or email
            </button>
          </form>
        ) : isEmailSent ? (
          <div className="mt-8 space-y-3">
            {error && <p className="text-sm text-(--danger)">{error}</p>}
            <button
              type="button"
              onClick={resetFlow}
              className="h-12 w-full rounded-2xl border border-black/10 bg-(--paper) text-sm font-semibold text-black/65 transition hover:bg-white"
            >
              use a different phone or email
            </button>
          </div>
        ) : (
          <form onSubmit={beginAuthentication} className="mt-8 space-y-3">
            <label htmlFor="auth-identifier" className="block text-sm font-medium text-black/70">
              phone number or email
            </label>
            <input
              id="auth-identifier"
              type="text"
              inputMode={identifierLooksLikeEmail ? "email" : "tel"}
              autoComplete={identifierLooksLikeEmail ? "email" : "tel"}
              value={identifierDraft}
              onChange={(event) => {
                setIdentifierDraft(event.target.value);
                setError(undefined);
              }}
              placeholder="+1 555 123 4567 or you@example.com"
              autoFocus={isEmailLink}
              className="h-14 w-full rounded-2xl border border-black/10 bg-(--paper) px-4 text-base outline-none transition placeholder:text-black/28 focus:border-(--coral)/55 focus:ring-4 focus:ring-(--coral)/10"
            />
            {!identifierLooksLikeEmail && (
              <p className="text-xs leading-5 text-black/38">
                Continuing with a phone number sends one verification SMS. Message and data
                rates may apply.
              </p>
            )}
            {error && <p className="text-sm text-(--danger)">{error}</p>}
            <button
              id="auth-continue-button"
              type="submit"
              disabled={isSubmitting || !identifierDraft.trim()}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-foreground px-5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting ? "checking…" : isEmailLink ? "finish signing in" : "continue"}
            </button>
            {isEmailLink && (
              <button
                type="button"
                onClick={resetFlow}
                className="h-10 w-full text-xs font-medium text-black/42 hover:text-black/65"
              >
                request a fresh link
              </button>
            )}
          </form>
        )}
      </section>
    </main>
  );
}

type ChatClientProps = {
  authenticated?: boolean;
  authenticatedIdentifier?: string;
  getAuthToken?: () => AuthToken;
  onSignOut?: () => void;
};

function ChatClient({
  authenticated = false,
  authenticatedIdentifier,
  getAuthToken,
  onSignOut,
}: ChatClientProps = {}) {
  const [hydrated, setHydrated] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneNumber, setPhoneNumber] = useState<string>();
  const [conversationId, setConversationId] = useState<string>();
  const [conversationKind, setConversationKind] = useState<"direct" | "group">("direct");
  const [conversationTitle, setConversationTitle] = useState("dot");
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [user, setUser] = useState<ChatUser>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isAwaitingBenji, setIsAwaitingBenji] = useState(false);
  const [showGroupCreator, setShowGroupCreator] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [failedTurn, setFailedTurn] = useState<FailedTurn>();
  const [activeTab, setActiveTab] = useState<"chat" | "apps" | "integrations">("chat");
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const connect = useCallback(async (phone?: string, requestedConversationId?: string) => {
    setIsConnecting(true);
    setError(undefined);
    try {
      let targetConversationId = requestedConversationId;
      const inviteToken = new URLSearchParams(window.location.search).get("group_invite");
      if (inviteToken && !requestedConversationId) {
        const joined = await joinGroupInvite({
          token: inviteToken,
          phoneNumber: phone,
          authToken: getAuthToken?.(),
        });
        targetConversationId = joined.id;
        window.history.replaceState({}, "", window.location.pathname);
      }
      const session = await openChatSession({
        phoneNumber: phone,
        authToken: getAuthToken?.(),
        conversationId: targetConversationId,
      });
      const catalog = await loadConversations({
        phoneNumber: phone,
        authToken: getAuthToken?.(),
      });

      setPhoneNumber(phone);
      setConversationId(session.conversation_id);
      setConversationKind(session.conversation_kind);
      setConversationTitle(session.conversation_title);
      setMembers(session.members);
      setConversations(catalog.conversations);
      setUser(session.user);
      setMessages(session.messages);
      setFailedTurn(undefined);
      if (phone) persistSession({ phoneNumber: phone });
    } catch (connectionError) {
      setError(
        connectionError instanceof BenjiApiError
          ? connectionError.message
          : "I couldn’t reach Dot. Make sure the backend is running.",
      );
    } finally {
      setIsConnecting(false);
    }
  }, [getAuthToken]);

  const refreshConversationList = useCallback(async () => {
    if (!authenticated && !phoneNumber) return;
    const catalog = await loadConversations({
      phoneNumber,
      authToken: getAuthToken?.(),
    });
    setConversations(catalog.conversations);
  }, [authenticated, getAuthToken, phoneNumber]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const requestedTab = new URLSearchParams(window.location.search).get("tab");
      if (requestedTab === "integrations" || requestedTab === "apps") {
        setActiveTab(requestedTab);
      }
      setHydrated(true);
      if (authenticated) {
        setPhoneNumber(undefined);
        void connect();
        return;
      }
      const stored = readStoredSession();
      if (!stored?.phoneNumber) return;
      setPhoneDraft(stored.phoneNumber);
      void connect(stored.phoneNumber);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [authenticated, connect]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  useEffect(() => {
    if (conversationKind !== "group" || !conversationId || activeTab !== "chat") return;
    const interval = window.setInterval(() => {
      void openChatSession({
        phoneNumber,
        authToken: getAuthToken?.(),
        conversationId,
      }).then((session) => {
        setMessages((current) => {
          const currentKey = current.map((message) => message.id).join(":");
          const nextKey = session.messages.map((message) => message.id).join(":");
          return currentKey === nextKey ? current : session.messages;
        });
        setMembers(session.members);
        setConversationTitle(session.conversation_title);
      }).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(interval);
  }, [activeTab, conversationId, conversationKind, getAuthToken, phoneNumber]);

  function switchTester() {
    optionalStorageRemove(STORAGE_KEY);
    setPhoneNumber(undefined);
    setConversationId(undefined);
    setConversationKind("direct");
    setConversationTitle("dot");
    setMembers([]);
    setConversations([]);
    setUser(undefined);
    setMessages([]);
    setDraft("");
    setError(undefined);
    setFailedTurn(undefined);
    setPhoneDraft("");
    if (authenticated) onSignOut?.();
  }

  async function submitMessage(
    content: string,
    clientMessageId = crypto.randomUUID(),
    optimistic = true,
  ) {
    const trimmedContent = content.trim();
    if (
      !trimmedContent ||
      !conversationId ||
      (!authenticated && !phoneNumber) ||
      isSending
    ) return;

    if (optimistic) {
      setMessages((current) => [
        ...current,
        {
          id: clientMessageId,
          role: "user",
          content: trimmedContent,
          created_at: new Date().toISOString(),
          sender_user_id: user?.user_id ?? null,
          sender_display_name: user?.display_name ?? null,
          is_current_user: true,
        },
      ]);
      setDraft("");
    }
    setIsSending(true);
    setIsAwaitingBenji(
      conversationKind === "direct" ||
        /(?:^|\W)@?(?:dot|benji)(?:$|\W)/i.test(trimmedContent),
    );
    setError(undefined);
    setFailedTurn(undefined);

    try {
      const turn = await sendChatMessage({
        phoneNumber,
        conversationId,
        clientMessageId,
        content: trimmedContent,
        authToken: getAuthToken?.(),
      });
      setUser(turn.user);
      const assistantMessages = turn.assistant_messages?.length
        ? turn.assistant_messages
        : turn.assistant_message
          ? [turn.assistant_message]
          : [];
      for (const [index, message] of assistantMessages.entries()) {
        // The complete turn arrives together, so stage later bubbles like live texting.
        if (index > 0) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, assistantBubbleDelayMs(message.content)),
          );
        }
        setMessages((current) => [...current, message]);
      }
      void refreshConversationList();
    } catch (sendError) {
      setFailedTurn({ clientMessageId, content: trimmedContent });
      setError(
        sendError instanceof BenjiApiError
          ? sendError.message
          : "Dot didn’t answer that one. Your message is saved, so you can retry.",
      );
    } finally {
      setIsSending(false);
      setIsAwaitingBenji(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = groupName.trim();
    if (!title) return;
    setIsCreatingGroup(true);
    setError(undefined);
    try {
      const group = await createGroup({
        title,
        phoneNumber,
        authToken: getAuthToken?.(),
      });
      setShowGroupCreator(false);
      setGroupName("");
      await connect(phoneNumber, group.id);
    } catch (groupError) {
      setError(
        groupError instanceof BenjiApiError
          ? groupError.message
          : "I couldn’t create that group.",
      );
    } finally {
      setIsCreatingGroup(false);
    }
  }

  async function copyGroupInvite() {
    if (!conversationId || conversationKind !== "group") return;
    try {
      const invite = await createGroupInvite({
        conversationId,
        phoneNumber,
        authToken: getAuthToken?.(),
      });
      await navigator.clipboard.writeText(invite.invite_url);
      setInviteNotice("invite link copied");
      window.setTimeout(() => setInviteNotice(undefined), 2500);
    } catch (inviteError) {
      setError(
        inviteError instanceof BenjiApiError
          ? inviteError.message
          : "I couldn’t create an invite link.",
      );
    }
  }

  function handleIdentitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPhone = normalizePhoneInput(phoneDraft);
    setPhoneDraft(normalizedPhone);
    if (!isPlausiblePhone(normalizedPhone)) {
      setError("Use the full international number, including + and country code.");
      return;
    }
    void connect(normalizedPhone);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitMessage(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage(draft);
    }
  }

  function resizeComposer() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }

  if (!hydrated || (authenticated && isConnecting && !conversationId)) return <BenjiLoading />;

  if (authenticated && !conversationId) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background px-5 text-foreground">
        <section className="w-full max-w-md rounded-[30px] border border-black/8 bg-white/80 p-7 text-center shadow-[0_24px_70px_rgba(47,39,30,0.1)]">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-(--coral) text-xl font-semibold text-white">
            d
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">dot couldn’t load</h1>
          <p className="mt-3 text-sm leading-6 text-black/50">
            {error ?? "Your session is verified, but the conversation is unavailable right now."}
          </p>
          <button
            type="button"
            onClick={() => void connect()}
            disabled={isConnecting}
            className="mt-6 h-12 w-full rounded-2xl bg-foreground text-sm font-semibold text-white disabled:opacity-40"
          >
            {isConnecting ? "trying again…" : "try again"}
          </button>
          <button
            type="button"
            onClick={switchTester}
            className="mt-2 h-10 w-full text-xs font-medium text-black/42 hover:text-black/65"
          >
            sign out
          </button>
        </section>
      </main>
    );
  }

  if ((!authenticated && !phoneNumber) || !conversationId) {
    return (
      <main className="grid min-h-dvh place-items-center overflow-hidden bg-background px-5 py-10 text-foreground">
        <div className="identity-glow" aria-hidden="true" />
        <section className="relative w-full max-w-md rounded-[32px] border border-black/8 bg-white/82 p-6 shadow-[0_28px_90px_rgba(47,39,30,0.12)] backdrop-blur-xl sm:p-9">
          <div className="grid size-12 place-items-center rounded-2xl bg-(--coral) text-xl font-semibold text-white shadow-[0_12px_30px_rgba(225,96,76,0.28)]">
            d
          </div>
          <p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-(--coral)">
            local testing
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
            chat with dot on the web
          </h1>
          <p className="mt-4 text-[15px] leading-7 text-black/52">
            Enter a tester phone number to use the same identity, onboarding, history, and memory
            foundation as messaging—without spending a Linq message.
          </p>

          <form onSubmit={handleIdentitySubmit} className="mt-8 space-y-3">
            <label htmlFor="phone-number" className="block text-sm font-medium text-black/70">
              tester phone number
            </label>
            <input
              id="phone-number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phoneDraft}
              onChange={(event) => {
                setPhoneDraft(event.target.value);
                setError(undefined);
              }}
              placeholder="+1 555 123 4567"
              aria-describedby="identity-note"
              className="h-14 w-full rounded-2xl border border-black/10 bg-(--paper) px-4 text-base outline-none transition placeholder:text-black/28 focus:border-(--coral)/55 focus:ring-4 focus:ring-(--coral)/10"
            />
            {error && <p className="text-sm text-(--danger)">{error}</p>}
            <button
              type="submit"
              disabled={isConnecting || !phoneDraft.trim()}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-foreground px-5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isConnecting ? "connecting…" : "continue as tester"}
            </button>
          </form>
          <p id="identity-note" className="mt-5 text-xs leading-5 text-black/38">
            Development only. This is an identity selector, not authentication. Firebase
            authentication replaces it when credentials are configured.
          </p>
        </section>
      </main>
    );
  }

  const isOnboarding = user?.onboarding_status !== "complete";
  const canInviteToGroup = members.some(
    (member) => member.user_id === user?.user_id && member.role === "owner",
  );

  return (
    <main className="h-dvh overflow-hidden bg-background text-foreground">
      <div className="mx-auto flex h-full max-w-400">
        <aside className="hidden w-76 shrink-0 border-r border-black/7 bg-white/22 px-5 py-6 lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-1">
            <div className="grid size-10 place-items-center rounded-2xl bg-(--coral) text-lg font-semibold text-white shadow-[0_8px_24px_rgba(225,96,76,0.24)]">
                d
            </div>
            <div>
              <p className="font-semibold tracking-tight">dot</p>
              <p className="text-xs text-black/42">your personal ai</p>
            </div>
          </div>

          <div className="mt-9 min-h-0 flex-1">
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/34">
                conversations
              </p>
              <button
                type="button"
                onClick={() => setShowGroupCreator(true)}
                className="grid size-7 place-items-center rounded-full bg-white/70 text-base text-black/50 ring-1 ring-black/7 transition hover:bg-white hover:text-(--coral)"
                aria-label="Create a group"
              >
                +
              </button>
            </div>
            <div className="mt-3 space-y-1.5 overflow-y-auto">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => void connect(phoneNumber, conversation.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                    conversation.id === conversationId
                      ? "bg-white text-black/78 shadow-sm ring-1 ring-black/6"
                      : "text-black/48 hover:bg-white/48 hover:text-black/68"
                  }`}
                >
                  <span className={`grid size-8 shrink-0 place-items-center rounded-xl text-xs font-semibold ${
                    conversation.kind === "group"
                      ? "bg-(--sage)/14 text-(--sage)"
                      : "bg-(--coral)/12 text-(--coral)"
                  }`}>
                    {conversation.kind === "group" ? "g" : "b"}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">
                      {conversation.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-black/32">
                      {conversation.kind === "group"
                        ? `${conversation.members.length} member${conversation.members.length === 1 ? "" : "s"}`
                        : "personal chat"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-black/7 bg-white/55 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/34">
              {authenticated ? "verified account" : "local tester"}
            </p>
            <p className="mt-2 truncate font-mono text-xs text-black/62">
              {authenticatedIdentifier ?? phoneNumber ?? "verified with firebase"}
            </p>
            <button
              type="button"
              onClick={switchTester}
              className="mt-3 text-xs font-medium text-(--coral) hover:underline"
            >
              {authenticated ? "sign out" : "switch identity"}
            </button>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="relative flex h-18 shrink-0 items-center justify-between border-b border-black/6 bg-background/82 px-4 backdrop-blur-lg sm:px-7 lg:h-20 lg:px-9">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-(--coral) font-semibold text-white lg:hidden">
                {conversationKind === "group" ? "g" : "b"}
              </div>
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-sm font-semibold">
                  {conversationKind === "group"
                    ? conversationTitle
                    : user?.display_name
                      ? `${user.display_name} + dot`
                      : "you + dot"}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-black/40">
                  <span className="size-1.5 rounded-full bg-(--sage)" />
                  web
                  <span aria-hidden="true">·</span>
                  {conversationKind === "group"
                    ? `${members.length} member${members.length === 1 ? "" : "s"}`
                    : isOnboarding ? "getting to know you" : "ready"}
                </div>
              </div>
              <select
                aria-label="Choose conversation"
                value={conversationId}
                onChange={(event) => void connect(phoneNumber, event.target.value)}
                className="max-w-34 rounded-xl border border-black/8 bg-white/70 px-2 py-2 text-xs outline-none sm:hidden"
              >
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.title}
                  </option>
                ))}
              </select>
            </div>
            <nav className="absolute left-1/2 flex -translate-x-1/2 items-center rounded-full border border-black/7 bg-white/58 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab("chat")}
                className={`rounded-full px-4 py-2 transition ${
                  activeTab === "chat"
                    ? "bg-foreground text-white shadow-sm"
                    : "text-black/42 hover:text-black/65"
                }`}
              >
                chat
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("apps")}
                className={`rounded-full px-3 py-2 transition sm:px-4 ${
                  activeTab === "apps"
                    ? "bg-foreground text-white shadow-sm"
                    : "text-black/42 hover:text-black/65"
                }`}
              >
                apps
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("integrations")}
                className={`rounded-full px-3 py-2 transition sm:px-4 ${
                  activeTab === "integrations"
                    ? "bg-foreground text-white shadow-sm"
                    : "text-black/42 hover:text-black/65"
                }`}
              >
                integrations
              </button>
            </nav>
            <div className="flex items-center gap-2">
              {conversationKind === "group" && canInviteToGroup && (
                <button
                  type="button"
                  onClick={() => void copyGroupInvite()}
                  className="rounded-full border border-black/8 bg-white/65 px-3 py-2 text-[11px] font-medium text-black/48 transition hover:text-(--coral)"
                >
                  {inviteNotice ?? "invite"}
                </button>
              )}
              <button
                type="button"
                onClick={switchTester}
                className="rounded-full border border-black/8 bg-white/65 px-3 py-2 text-[11px] font-medium text-black/48 lg:hidden"
              >
                {authenticated ? "sign out" : "switch"}
              </button>
              <span className="hidden rounded-full border border-black/8 bg-white/60 px-3 py-1.5 text-[11px] text-black/42 xl:inline">
                {authenticated ? "verified web session" : "local test channel"}
              </span>
            </div>
          </header>

          {activeTab === "integrations" ? (
            <IntegrationsPanel phoneNumber={phoneNumber} getAuthToken={getAuthToken} />
          ) : activeTab === "apps" ? (
            <AppsPanel
              phoneNumber={phoneNumber}
              getAuthToken={getAuthToken}
              onCreate={(prompt) => {
                setActiveTab("chat");
                void submitMessage(prompt);
              }}
            />
          ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-7 sm:py-8">
              <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
                {messages.length === 0 ? (
                  <div className="my-auto py-10">
                    <p className="mb-4 text-sm font-semibold text-(--coral)">
                      {conversationKind === "group"
                        ? "your new group is ready."
                        : isOnboarding ? "hey, we haven’t properly met yet." : "hey, i’m dot."}
                    </p>
                    <h1 className="max-w-2xl text-4xl font-semibold leading-[1.06] tracking-[-0.05em] sm:text-6xl">
                      {conversationKind === "group"
                        ? `welcome to ${conversationTitle}.`
                        : isOnboarding ? "just say hi. we’ll take it from there." : "what’s on your mind?"}
                    </h1>
                    <p className="mt-5 max-w-xl text-[15px] leading-7 text-black/48 sm:text-base">
                      {conversationKind === "group"
                        ? "share the invite link, then mention dot whenever the group wants a hand."
                        : isOnboarding
                        ? "no forms. dot will get to know you naturally and ask when something needs clarifying."
                        : "ask a question, make a plan, or tell dot what you want handled."}
                    </p>
                    {conversationKind === "direct" && <div className="mt-8 grid gap-2.5 sm:grid-cols-3">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => void submitMessage(suggestion)}
                          className="rounded-2xl border border-black/7 bg-white/68 p-4 text-left text-sm leading-5 text-black/60 transition hover:-translate-y-0.5 hover:border-(--coral)/25 hover:bg-white hover:shadow-[0_12px_30px_rgba(46,38,28,0.06)]"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>}
                  </div>
                ) : (
                  <div className="mt-auto space-y-5 pb-2" aria-live="polite">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`group flex ${message.role === "user" && message.is_current_user ? "justify-end" : "justify-start"}`}
                      >
                        <div className="max-w-[88%] sm:max-w-[76%]">
                          {conversationKind === "group" && message.role === "user" && !message.is_current_user && (
                            <p className="mb-1 px-1 text-[10px] font-semibold text-black/36">
                              {message.sender_display_name ?? "group member"}
                            </p>
                          )}
                          <div
                            className={`whitespace-pre-wrap rounded-[24px] px-4 py-3 text-[15px] leading-6 sm:px-5 sm:py-3.5 ${
                              message.role === "user" && message.is_current_user
                                ? "rounded-br-md bg-foreground text-white"
                                : message.role === "user"
                                  ? "rounded-bl-md bg-(--sage)/12 text-black/70 ring-1 ring-(--sage)/10"
                                : "rounded-bl-md bg-white text-black/72 shadow-[0_5px_22px_rgba(42,35,27,0.045)] ring-1 ring-black/5"
                            }`}
                          >
                            <MessageContent content={message.content} />
                          </div>
                          <p
                            className={`mt-1.5 px-1 text-[10px] text-black/28 ${message.role === "user" && message.is_current_user ? "text-right" : "text-left"}`}
                          >
                            {timeLabel(message.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}

                    {isSending && isAwaitingBenji && (
                      <div className="flex justify-start" role="status" aria-label="Dot is typing">
                        <div className="flex h-11 items-center gap-1.5 rounded-[22px] rounded-bl-md bg-white px-5 shadow-sm ring-1 ring-black/5">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </div>
                      </div>
                    )}
                    <div ref={endOfMessagesRef} />
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 bg-linear-to-t from-background via-background to-transparent px-4 pb-4 pt-3 sm:px-7 sm:pb-7">
              <div className="mx-auto max-w-3xl">
                {error && conversationId && (
                  <div className="mb-3 flex items-start justify-between gap-4 rounded-2xl border border-(--danger)/15 bg-(--danger)/6 px-4 py-3 text-sm text-(--danger)">
                    <span>{error}</span>
                    {failedTurn && (
                      <button
                        type="button"
                        onClick={() =>
                          void submitMessage(
                            failedTurn.content,
                            failedTurn.clientMessageId,
                            false,
                          )
                        }
                        disabled={isSending}
                        className="shrink-0 font-semibold underline underline-offset-2"
                      >
                        retry
                      </button>
                    )}
                  </div>
                )}
                <form
                  onSubmit={handleSubmit}
                  className="flex items-end gap-2 rounded-[27px] border border-black/8 bg-white p-2 pl-4 shadow-[0_18px_55px_rgba(46,38,28,0.09)] focus-within:border-black/14"
                >
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      resizeComposer();
                    }}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    aria-label="Message Dot"
                    placeholder={conversationKind === "group" ? "message the group… mention dot for help" : "message dot…"}
                    disabled={isSending || isConnecting}
                    className="max-h-36 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-6 outline-none placeholder:text-black/28 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || isSending || isConnecting}
                    aria-label="Send message"
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-(--coral) text-lg font-medium text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                </form>
                <p className="mt-2.5 text-center text-[10px] text-black/28">
                  {conversationKind === "group"
                    ? "dot joins when mentioned · everyone here can see group replies"
                    : "same dot, different channel · double-check anything important"}
                </p>
              </div>
            </div>
          </div>
          )}
        </section>
      </div>
      {showGroupCreator && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/20 px-5 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowGroupCreator(false);
          }}
        >
          <form
            onSubmit={handleCreateGroup}
            className="w-full max-w-md rounded-[30px] border border-black/8 bg-(--paper) p-6 shadow-[0_28px_90px_rgba(39,35,31,0.2)] sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-(--sage)">
                  new group
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
                  bring people together
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowGroupCreator(false)}
                className="grid size-9 place-items-center rounded-full bg-white/70 text-black/42 ring-1 ring-black/7"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-black/48">
              name it now, then share a private invite link with anyone who already uses dot.
            </p>
            <label htmlFor="group-name" className="mt-6 block text-sm font-medium text-black/68">
              group name
            </label>
            <input
              id="group-name"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value.slice(0, 120))}
              autoFocus
              placeholder="safari crew"
              className="mt-2 h-13 w-full rounded-2xl border border-black/9 bg-white/72 px-4 outline-none transition focus:border-(--sage)/45 focus:ring-4 focus:ring-(--sage)/10"
            />
            <button
              type="submit"
              disabled={!groupName.trim() || isCreatingGroup}
              className="mt-4 h-13 w-full rounded-2xl bg-foreground text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-35"
            >
              {isCreatingGroup ? "creating…" : "create group"}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
