export const AUTH_RECAPTCHA_CONTAINER_ID = "auth-recaptcha-container";

const FIREBASE_AUTH_MESSAGES: Record<string, string> = {
  "auth/admin-restricted-operation":
    "Sign-in is temporarily restricted. Try again in a moment.",
  "auth/argument-error":
    "Sign-in couldn’t start the security check. Refresh and try again.",
  "auth/billing-not-enabled":
    "SMS sign-in isn’t set up yet. Try again in a bit.",
  "auth/captcha-check-failed": "The security check expired. Please try again.",
  "auth/code-expired": "That code expired. Request a new one.",
  "auth/expired-action-code": "That email link expired. Request a fresh one.",
  "auth/internal-error": "Sign-in hit a snag. Refresh and try again.",
  "auth/invalid-action-code": "That email link is invalid or has already been used.",
  "auth/invalid-app-credential":
    "Sign-in couldn’t complete the security check. Refresh and try again.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/invalid-phone-number":
    "Use the full international number, including + and country code.",
  "auth/invalid-verification-code": "That code didn’t work. Check it and try again.",
  "auth/missing-client-identifier":
    "Sign-in couldn’t start the security check. Refresh and try again.",
  "auth/network-request-failed": "The connection dropped. Please try again.",
  "auth/operation-not-allowed":
    "That sign-in method isn’t available right now. Try the other one.",
  "auth/quota-exceeded": "Too many SMS sign-in attempts right now. Wait a bit and try again.",
  "auth/too-many-requests": "Too many attempts. Give it a little time, then try again.",
  "auth/unauthorized-domain":
    "This web address hasn’t been authorized for Dot sign-in yet.",
};

export function firebaseAuthErrorMessage(authError: unknown, fallback: string) {
  const code =
    typeof authError === "object" && authError && "code" in authError
      ? String(authError.code)
      : "";
  return FIREBASE_AUTH_MESSAGES[code] ?? fallback;
}
