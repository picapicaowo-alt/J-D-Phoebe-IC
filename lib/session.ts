import type { SessionOptions } from "iron-session";

export type TaskUndoPayload =
  | { projectId: string; mode: "nodes"; nodeIds: string[] }
  | { projectId: string; mode: "bulk"; deletedAtISO: string };

export type AppSessionData = {
  userId?: string;
  isLoggedIn?: boolean;
  /** Last project task soft-delete batch (single task + subtasks, or delete-all), for Undo. */
  taskUndo?: TaskUndoPayload;
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
