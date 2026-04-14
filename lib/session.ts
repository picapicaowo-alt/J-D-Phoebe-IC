import type { SessionOptions } from "iron-session";

export type AppSessionData = {
  userId?: string;
  isLoggedIn?: boolean;
};

export const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_SECRET ??
    "dev-only-32-char-minimum-secret-key!!!!!!!!!!",
  cookieName: "jdphoebe_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  },
};
