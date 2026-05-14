/// <reference types="@cloudflare/workers-types" />

declare module "@moikapy/magic-link" {
  export function sendMagicLink(email: string, config: {
    db: D1Database;
    sendEmail?: { send: (msg: EmailMessage) => Promise<{ messageId: string }> };
    resendApiKey?: string;
    fromEmail: string;
    appName: string;
    baseUrl?: string;
    verifyPath?: string;
    tokenExpiry?: number;
    sessionExpiry?: number;
    encryptKey?: string;
    validateSend?: (email: string) => Promise<void>;
  }): Promise<{ ok: boolean; message?: string; error?: string }>;

  export function verifyMagicToken(token: string | null, config: {
    db: D1Database;
    encryptKey?: string;
    baseUrl?: string;
  }): Promise<{ ok: boolean; sessionId?: string; user?: { id: string; email: string; displayName: string | null }; error?: string }>;

  export function getSession(sessionId: string | null, config: {
    db: D1Database;
    encryptKey?: string;
    sessionExpiry?: number;
  }): Promise<{ user: { id: string; email: string; displayName: string | null } | null }>;

  export function deleteSession(db: D1Database, sessionId: string): Promise<void>;

  export function validateOrigin(request: Request): boolean;

  export const VERIFY_SECURITY_HEADERS: Record<string, string>;
}

declare module "@moikapy/magic-link/react" {
  import { ReactNode } from "react";

  export interface MagicLinkAuthProps {
    appName: string;
    redirectUrl?: string;
    sendEndpoint?: string;
    sessionEndpoint?: string;
    logoutEndpoint?: string;
    className?: string;
    children?: (state: MagicLinkState) => ReactNode;
    labels?: {
      emailPlaceholder?: string;
      sendButton?: string;
      sendingButton?: string;
      successMessage?: string;
      errorMessage?: string;
      logoutButton?: string;
      greeting?: string;
    };
  }

  export interface MagicLinkState {
    status: "idle" | "sending" | "sent" | "error" | "authenticated";
    user: { id: string; email: string; displayName: string | null } | null;
    error: string | null;
    sendEmail: (email: string) => void;
    logout: () => void;
  }

  export function MagicLinkAuth(props: MagicLinkAuthProps): JSX.Element;

  export interface UseMagicLinkOptions {
    sessionEndpoint?: string;
    logoutEndpoint?: string;
  }

  export function useMagicLink(options?: UseMagicLinkOptions): {
    user: { id: string; email: string; displayName: string | null } | null;
    loading: boolean;
    logout: () => void;
  };
}

declare module "@moikapy/magic-link/next" {
  export function sendMagicLink(email: string, config: {
    db: D1Database;
    resendApiKey: string;
    fromEmail: string;
    appName: string;
    baseUrl?: string;
    verifyPath?: string;
  }): Promise<{ ok: boolean; message?: string; error?: string }>;

  export function verifyMagicToken(token: string | null, config: {
    db: D1Database;
    encryptKey?: string;
    baseUrl?: string;
  }): Promise<{ ok: boolean; sessionId?: string; error?: string }>;

  export function getSession(config: {
    db: D1Database;
    encryptKey?: string;
  }): Promise<{ user: { id: string; email: string; displayName: string | null } | null }>;

  export function deleteSession(config: { db: D1Database }): Promise<void>;
  export function setSessionCookie(sessionId: string): void;
  export function validateOrigin(request: Request): boolean;
  export const VERIFY_SECURITY_HEADERS: Record<string, string>;
}

declare module "@moikapy/openrouter-auth/react" {
  export function OpenRouterConnect(props: any): JSX.Element;
  export function OpenRouterCallback(props: { redirectUrl?: string }): JSX.Element;
}

declare module "@moikapy/openrouter-auth/next" {
  export function exchangeCodeAndSetCookie(code: string, verifier: string, config: {
    encryptKey: string;
    previousKeys?: string[];
  }): Promise<void>;

  export function getApiKeyFromCookie(config: {
    encryptKey: string;
    previousKeys?: string[];
    sessionMaxAge?: number;
  }): Promise<string | null>;
}