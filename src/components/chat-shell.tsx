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
  AppWindow,
  ArrowUp,
  Cable,
  Check,
  LogOut,
  MessageCircle,
  Plus,
  Share2,
  UsersRound,
  X,
} from "lucide-react";
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
import {
  Button,
  DotBrand,
  DotMark,
  Eyebrow,
  Notice,
  Surface,
} from "@/components/dot-ui";

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
    return process.env.NODE_ENV === "development" ||
      process.env.NEXT_PUBLIC_DEV_IDENTITY_ENABLED === "true"
      ? <ChatClient />
      : <AuthUnavailable />;
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
    <AccessFrame
      eyebrow="not quite ready"
      title="Dot is getting ready."
      description="Secure sign-in isn’t configured on this deployment yet."
    >
      <div className="flex min-h-44 flex-col justify-between">
        <DotMark className="size-5 bg-(--coral)" />
        <p className="max-w-sm text-sm leading-6 text-muted">
          Try again once authentication is configured for this environment.
        </p>
      </div>
    </AccessFrame>
  );
}

function BenjiLoading() {
  return (
    <main className="relative grid min-h-dvh place-items-center bg-background text-foreground">
      <div className="absolute left-5 top-5 sm:left-8 sm:top-7">
        <DotBrand />
      </div>
      <div className="flex items-center gap-2 text-xs text-black/42" role="status">
        <span className="size-2 animate-pulse rounded-full bg-(--coral)" />
        opening your conversation
      </div>
    </main>
  );
}

function AccessFrame({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-background px-5 py-6 text-foreground sm:px-8 sm:py-8">
      <div className="relative mx-auto max-w-6xl">
        <DotBrand />
        <section className="grid min-h-[calc(100dvh-5rem)] items-center gap-10 py-12 md:grid-cols-[1.1fr_0.9fr] md:gap-20">
          <div className="dot-enter">
            <Eyebrow>One Dot, everywhere</Eyebrow>
            <p className="mt-4 max-w-xl text-[3.25rem] font-normal leading-[0.94] tracking-[-0.06em] sm:text-[4.8rem]">
              Your life, one conversation.
            </p>
            <p className="mt-6 max-w-md text-[15px] leading-7 text-muted">
              Pick up the same thread from messages, web, or mobile. Your context comes with you.
            </p>
          </div>
          <Surface className="dot-enter p-6 shadow-[var(--shadow-float)] sm:p-8">
            <Eyebrow className="text-(--coral)">{eyebrow}</Eyebrow>
            <h1 className="mt-3 text-3xl font-normal leading-[1.02] tracking-[-0.045em] sm:text-4xl">
              {title}
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted">{description}</p>
            {children}
          </Surface>
        </section>
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
  const authEyebrow = isPhoneCode
    ? "check your phone"
    : isEmailSent
      ? "check your email"
      : "welcome back";
  const authTitle = isPhoneCode
    ? "Enter your code."
    : isEmailSent
      ? "We sent you a link."
      : isEmailLink
        ? "Finish signing in."
        : "Open Dot.";
  const authDescription = isPhoneCode
    ? `We sent a verification code to ${identifierDraft}. It stays outside your Dot chat.`
    : isEmailSent
      ? `Open the private sign-in link sent to ${identifierDraft}. You can close this page afterward.`
      : isEmailLink
        ? "Confirm the email address that received this private link."
        : "Use the phone number or email address you already message Dot from. There’s no separate web signup.";

  return (
    <AccessFrame eyebrow={authEyebrow} title={authTitle} description={authDescription}>
        {isPhoneCode ? (
          <form onSubmit={verifyCode} className="mt-7 space-y-3">
            <label htmlFor="verification-code" className="block text-xs font-medium text-black/62">
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
              className="h-13 w-full rounded-[11px] border border-black/12 bg-[#fafaf7] px-4 font-mono text-xl tracking-[0.22em] outline-none transition focus:border-black/35"
            />
            {error && <Notice tone="danger">{error}</Notice>}
            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting || code.length < 4}
              className="w-full"
            >
              {isSubmitting ? "checking…" : "open dot"}
            </Button>
            <Button
              id="auth-resend-button"
              variant="ghost"
              onClick={() => void resendCode()}
              disabled={isSubmitting || resendAvailableIn > 0}
              className="w-full"
            >
              {resendAvailableIn > 0
                ? `send another code in ${resendAvailableIn}s`
                : "send another code"}
            </Button>
            <Button
              variant="ghost"
              onClick={resetFlow}
              className="w-full"
            >
              use a different phone or email
            </Button>
          </form>
        ) : isEmailSent ? (
          <div className="mt-7 space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-(--sage)/18 bg-(--sage-soft) px-4 py-3 text-sm text-black/62">
              <Check className="size-4 text-(--sage)" /> link sent
            </div>
            {error && <Notice tone="danger">{error}</Notice>}
            <Button variant="secondary" size="lg" onClick={resetFlow} className="w-full">
              use a different phone or email
            </Button>
          </div>
        ) : (
          <form onSubmit={beginAuthentication} className="mt-7 space-y-3">
            <label htmlFor="auth-identifier" className="block text-xs font-medium text-black/62">
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
              className="h-13 w-full rounded-[11px] border border-black/12 bg-[#fafaf7] px-4 text-[15px] outline-none transition placeholder:text-black/28 focus:border-black/35"
            />
            {!identifierLooksLikeEmail && (
              <p className="text-xs leading-5 text-black/38">
                Continuing with a phone number sends one verification SMS. Message and data
                rates may apply.
              </p>
            )}
            {error && <Notice tone="danger">{error}</Notice>}
            <Button
              id="auth-continue-button"
              type="submit"
              size="lg"
              disabled={isSubmitting || !identifierDraft.trim()}
              className="w-full"
            >
              {isSubmitting ? "checking…" : isEmailLink ? "finish signing in" : "continue"}
            </Button>
            {isEmailLink && (
              <Button variant="ghost" onClick={resetFlow} className="w-full">
                request a fresh link
              </Button>
            )}
          </form>
        )}
    </AccessFrame>
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
      <AccessFrame
        eyebrow="connection issue"
        title="Dot couldn’t load."
        description={error ?? "Your session is verified, but the conversation is unavailable right now."}
      >
        <div className="mt-7 space-y-2">
          <Button
            size="lg"
            onClick={() => void connect()}
            disabled={isConnecting}
            className="w-full"
          >
            {isConnecting ? "trying again…" : "try again"}
          </Button>
          <Button variant="ghost" onClick={switchTester} className="w-full">
            <LogOut className="size-3.5" /> sign out
          </Button>
        </div>
      </AccessFrame>
    );
  }

  if ((!authenticated && !phoneNumber) || !conversationId) {
    return (
      <AccessFrame
        eyebrow="local testing"
        title="Chat with Dot on the web."
        description="Use a tester phone number to open the same identity, onboarding, and history without spending a Linq message."
      >
          <form onSubmit={handleIdentitySubmit} className="mt-7 space-y-3">
            <label htmlFor="phone-number" className="block text-xs font-medium text-black/62">
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
              className="h-13 w-full rounded-[11px] border border-black/12 bg-[#fafaf7] px-4 text-[15px] outline-none transition placeholder:text-black/28 focus:border-black/35"
            />
            {error && <Notice tone="danger">{error}</Notice>}
            <Button
              type="submit"
              size="lg"
              disabled={isConnecting || !phoneDraft.trim()}
              className="w-full"
            >
              {isConnecting ? "connecting…" : "continue as tester"}
            </Button>
          </form>
          <p id="identity-note" className="mt-5 text-xs leading-5 text-black/38">
            Development only. This is an identity selector, not authentication. Firebase
            authentication replaces it when credentials are configured.
          </p>
      </AccessFrame>
    );
  }

  const isOnboarding = user?.onboarding_status !== "complete";
  const canInviteToGroup = members.some(
    (member) => member.user_id === user?.user_id && member.role === "owner",
  );

  return (
    <main className="h-dvh overflow-hidden bg-[#ebebe6] text-foreground lg:p-3">
      <div className="mx-auto flex h-full max-w-400 overflow-hidden bg-background lg:rounded-[18px] lg:border lg:border-black/10">
        <aside className="hidden w-68 shrink-0 border-r border-black/10 bg-[#f0f0eb] px-4 py-5 lg:flex lg:flex-col">
          <div className="flex items-center justify-between px-1">
            <DotBrand />
            <span className="text-[9px] uppercase tracking-[0.14em] text-black/30">web</span>
          </div>

          <div className="mt-10 min-h-0 flex-1">
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/34">
                conversations
              </p>
              <button
                type="button"
                onClick={() => setShowGroupCreator(true)}
                className="grid size-7 place-items-center rounded-[8px] border border-black/10 bg-white text-black/45 transition hover:border-black/20 hover:text-black"
                aria-label="Create a group"
                title="Create a group"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            <div className="dot-scrollbar mt-3 space-y-1 overflow-y-auto">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => void connect(phoneNumber, conversation.id)}
                  className={`flex w-full items-center gap-3 rounded-[11px] px-2.5 py-2.5 text-left transition ${
                    conversation.id === conversationId
                      ? "bg-white text-black/78 shadow-sm ring-1 ring-black/8"
                      : "text-black/46 hover:bg-white/55 hover:text-black/68"
                  }`}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-[9px] border border-black/8 bg-[#fafaf7] text-black/48">
                    {conversation.kind === "group" ? (
                      <UsersRound className="size-3.5" />
                    ) : (
                      <MessageCircle className="size-3.5" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">
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

          <div className="mt-4 border-t border-black/10 px-1 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/34">
              {authenticated ? "verified account" : "local tester"}
            </p>
            <p className="mt-2 truncate font-mono text-xs text-black/62">
              {authenticatedIdentifier ?? phoneNumber ?? "verified with firebase"}
            </p>
            <button
              type="button"
              onClick={switchTester}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-black/46 transition hover:text-black"
            >
              <LogOut className="size-3" />
              {authenticated ? "sign out" : "switch identity"}
            </button>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-[#fafaf7]">
          <header className="relative flex h-16 shrink-0 items-center justify-between border-b border-black/10 bg-white px-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <DotMark className="hidden size-2.5 lg:block" />
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-[13px] font-medium">
                  {conversationKind === "group"
                    ? conversationTitle
                    : user?.display_name
                      ? `${user.display_name} + dot`
                      : "you + dot"}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-black/38">
                  {conversationKind === "group"
                    ? `${members.length} member${members.length === 1 ? "" : "s"}`
                    : isOnboarding ? "getting to know you" : "ready"}
                </div>
              </div>
              <select
                aria-label="Choose conversation"
                value={conversationId}
                onChange={(event) => void connect(phoneNumber, event.target.value)}
                className="max-w-27 appearance-none rounded-[9px] border border-black/10 bg-[#fafaf7] py-2 pl-2.5 pr-6 text-[11px] outline-none sm:hidden"
              >
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.title}
                  </option>
                ))}
              </select>
            </div>
            <nav className="absolute left-1/2 flex -translate-x-1/2 items-center rounded-[11px] border border-black/10 bg-[#f4f4ef] p-1 text-[11px] font-medium" aria-label="Primary">
              <button
                type="button"
                onClick={() => setActiveTab("chat")}
                aria-pressed={activeTab === "chat"}
                aria-label="Chat"
                className={`flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 transition sm:px-3 ${
                  activeTab === "chat"
                    ? "bg-foreground text-white"
                    : "text-black/42 hover:text-black/68"
                }`}
              >
                <MessageCircle className="size-3 sm:hidden" />
                <span className="hidden sm:inline">chat</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("apps")}
                aria-pressed={activeTab === "apps"}
                aria-label="Apps"
                className={`flex h-8 items-center gap-1.5 rounded-[8px] px-2 transition sm:px-3 ${
                  activeTab === "apps"
                    ? "bg-foreground text-white"
                    : "text-black/42 hover:text-black/68"
                }`}
              >
                <AppWindow className="size-3 sm:hidden" />
                <span className="hidden sm:inline">apps</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("integrations")}
                aria-pressed={activeTab === "integrations"}
                aria-label="Integrations"
                className={`flex h-8 items-center gap-1.5 rounded-[8px] px-2 transition sm:px-3 ${
                  activeTab === "integrations"
                    ? "bg-foreground text-white"
                    : "text-black/42 hover:text-black/68"
                }`}
              >
                <Cable className="size-3 sm:hidden" />
                <span className="hidden sm:inline">integrations</span>
              </button>
            </nav>
            <div className="flex items-center gap-2">
              {conversationKind === "group" && canInviteToGroup && (
                <button
                  type="button"
                  onClick={() => void copyGroupInvite()}
                  className="hidden h-9 items-center gap-1.5 rounded-[10px] border border-black/10 bg-white px-3 text-[11px] font-medium text-black/48 transition hover:border-black/20 hover:text-black sm:flex"
                >
                  <Share2 className="size-3.5" />
                  {inviteNotice ?? "invite"}
                </button>
              )}
              <button
                type="button"
                onClick={switchTester}
                className="grid size-9 place-items-center rounded-[10px] border border-black/10 bg-white text-black/45 lg:hidden"
                aria-label={authenticated ? "Sign out" : "Switch identity"}
                title={authenticated ? "Sign out" : "Switch identity"}
              >
                <LogOut className="size-3.5" />
              </button>
              <span className="hidden text-[10px] text-black/34 xl:inline">
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
            <div className="dot-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8 sm:py-9">
              <div className="mx-auto flex min-h-full w-full max-w-[46rem] flex-col">
                {messages.length === 0 ? (
                  <div className="dot-enter my-auto py-10">
                    <Eyebrow className="mb-4 text-(--coral)">
                      {conversationKind === "group"
                        ? "your new group"
                        : isOnboarding ? "we haven’t properly met" : "you + dot"}
                    </Eyebrow>
                    <h1 className="max-w-2xl text-[2.8rem] font-normal leading-[0.98] tracking-[-0.06em] sm:text-[4.25rem]">
                      {conversationKind === "group"
                        ? `${conversationTitle} starts here.`
                        : isOnboarding ? "Say hi. We’ll take it from there." : "What’s on your mind?"}
                    </h1>
                    <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted">
                      {conversationKind === "group"
                        ? "Share the invite link. Dot will follow along and jump in when it’s useful."
                        : isOnboarding
                        ? "No form to fill out. Just talk normally and Dot will learn the useful context along the way."
                        : "Ask a question, make a plan, or tell Dot what you want handled."}
                    </p>
                    {conversationKind === "direct" && <div className="mt-9 grid overflow-hidden rounded-[14px] border border-black/10 bg-black/10 sm:grid-cols-3 sm:gap-px">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => void submitMessage(suggestion)}
                          className="group flex min-h-20 items-end justify-between border-b border-black/8 bg-white p-4 text-left text-sm leading-5 text-black/56 transition last:border-b-0 hover:bg-[#f7f7f3] hover:text-black sm:border-b-0"
                        >
                          <span>{suggestion}</span>
                          <ArrowUp className="size-3.5 rotate-45 text-black/25 transition group-hover:text-black/55" />
                        </button>
                      ))}
                    </div>}
                  </div>
                ) : (
                  <div className="mt-auto space-y-4 pb-2" aria-live="polite">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`group flex ${message.role === "user" && message.is_current_user ? "justify-end" : "justify-start"}`}
                      >
                        <div className="max-w-[90%] sm:max-w-[78%]">
                          {conversationKind === "group" && message.role === "user" && !message.is_current_user && (
                            <p className="mb-1 px-1 text-[10px] font-semibold text-black/36">
                              {message.sender_display_name ?? "group member"}
                            </p>
                          )}
                          <div
                            className={`whitespace-pre-wrap rounded-[16px] px-4 py-3 text-[15px] leading-6 ${
                              message.role === "user" && message.is_current_user
                                ? "rounded-br-[4px] bg-foreground text-white"
                                : message.role === "user"
                                  ? "rounded-bl-[4px] bg-(--sage-soft) text-black/70 ring-1 ring-(--sage)/12"
                                : "rounded-bl-[4px] border border-black/8 bg-white text-black/72"
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
                        <div className="flex h-10 items-center gap-1.5 rounded-[15px] rounded-bl-[4px] border border-black/8 bg-white px-4">
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

            <div className="shrink-0 border-t border-black/8 bg-[#fafaf7] px-4 pb-4 pt-3 sm:px-8 sm:pb-6 sm:pt-4">
              <div className="mx-auto max-w-[46rem]">
                {error && conversationId && (
                  <div className="mb-3 flex items-start justify-between gap-4 rounded-xl border border-(--danger)/18 bg-[#f8ebe8] px-4 py-3 text-sm text-(--danger)" role="alert">
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
                  className="flex items-end gap-2 rounded-[15px] border border-black/12 bg-white p-1.5 pl-4 shadow-[0_6px_20px_rgba(21,21,18,0.05)] transition focus-within:border-black/28"
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
                    placeholder={conversationKind === "group" ? "message the group…" : "message dot…"}
                    disabled={isSending || isConnecting}
                    className="max-h-36 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-6 outline-none placeholder:text-black/28 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || isSending || isConnecting}
                    aria-label="Send message"
                    className="grid size-11 shrink-0 place-items-center rounded-[11px] bg-foreground text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-25"
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </button>
                </form>
                <p className="mt-2.5 text-center text-[10px] text-black/28">
                  {conversationKind === "group"
                    ? "dot jumps in when useful · everyone here can see group replies"
                    : "same conversation, different channel · double-check anything important"}
                </p>
              </div>
            </div>
          </div>
          )}
        </section>
      </div>
      {showGroupCreator && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/24 px-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowGroupCreator(false);
          }}
        >
          <form
            onSubmit={handleCreateGroup}
            className="w-full max-w-md rounded-[18px] border border-black/12 bg-background p-6 shadow-[0_24px_70px_rgba(21,21,18,0.18)] sm:p-8"
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-creator-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") setShowGroupCreator(false);
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <Eyebrow className="text-(--sage)">
                  new group
                </Eyebrow>
                <h2 id="group-creator-title" className="mt-2 text-2xl font-medium tracking-[-0.04em]">
                  bring people together
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowGroupCreator(false)}
                className="grid size-9 place-items-center rounded-[10px] border border-black/10 bg-white text-black/42 transition hover:text-black"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-black/48">
              name it now, then share a private invite link with anyone who already uses dot.
            </p>
            <label htmlFor="group-name" className="mt-6 block text-xs font-medium text-black/62">
              group name
            </label>
            <input
              id="group-name"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value.slice(0, 120))}
              autoFocus
              placeholder="safari crew"
              className="mt-2 h-13 w-full rounded-[11px] border border-black/12 bg-white px-4 outline-none transition focus:border-black/30"
            />
            <Button
              type="submit"
              size="lg"
              disabled={!groupName.trim() || isCreatingGroup}
              className="mt-4 w-full"
            >
              {isCreatingGroup ? "creating…" : "create group"}
            </Button>
          </form>
        </div>
      )}
    </main>
  );
}
