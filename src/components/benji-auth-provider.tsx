"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import type { Auth, User } from "firebase/auth";
import { getAuth, onIdTokenChanged } from "firebase/auth";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const FIREBASE_AUTH_CONFIGURED = Object.values(firebaseConfig).every(Boolean);

let cachedAuth: Auth | null | undefined;

export function getFirebaseAuth(): Auth | null {
  if (cachedAuth !== undefined) return cachedAuth;
  if (!FIREBASE_AUTH_CONFIGURED) {
    cachedAuth = null;
    return cachedAuth;
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  cachedAuth = getAuth(app);
  return cachedAuth;
}

type DotAuthContextValue = {
  configured: boolean;
  initialized: boolean;
  user: User | null;
  idToken?: string;
  error?: string;
};

const DotAuthContext = createContext<DotAuthContextValue>({
  configured: FIREBASE_AUTH_CONFIGURED,
  initialized: false,
  user: null,
});

export function useDotAuth() {
  return useContext(DotAuthContext);
}

export function BenjiAuthProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(!FIREBASE_AUTH_CONFIGURED);
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;

    let observation = 0;
    return onIdTokenChanged(auth, (nextUser) => {
      const currentObservation = ++observation;
      setError(undefined);
      if (!nextUser) {
        setUser(null);
        setIdToken(undefined);
        setInitialized(true);
        return;
      }

      void nextUser.getIdToken().then((token) => {
        if (currentObservation !== observation) return;
        setUser(nextUser);
        setIdToken(token);
        setInitialized(true);
      }).catch(() => {
        if (currentObservation !== observation) return;
        setUser(null);
        setIdToken(undefined);
        setError("Your secure session couldn’t be loaded. Please sign in again.");
        setInitialized(true);
      });
    });
  }, []);

  const value = useMemo<DotAuthContextValue>(() => ({
    configured: FIREBASE_AUTH_CONFIGURED,
    initialized,
    user,
    idToken,
    error,
  }), [error, idToken, initialized, user]);

  return <DotAuthContext.Provider value={value}>{children}</DotAuthContext.Provider>;
}
