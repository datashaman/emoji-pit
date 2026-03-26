import { deleteSession } from "../../utils/db";

export default defineEventHandler((event) => {
  const token = getCookie(event, "session");
  if (token) {
    deleteSession(token);
    deleteCookie(event, "session", { path: "/" });
  }

  return { ok: true };
});
