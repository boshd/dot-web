"use client";

import { createStytchClient, StytchProvider } from "@stytch/nextjs";
import { ReactNode, useMemo } from "react";

const publicToken = process.env.NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN;

export function BenjiAuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(
    () => (publicToken ? createStytchClient(publicToken) : null),
    [],
  );

  if (!client) return children;
  return <StytchProvider stytch={client}>{children}</StytchProvider>;
}
