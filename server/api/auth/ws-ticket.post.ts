import { getSessionByToken } from "../../utils/db";

// Short-lived tickets for WebSocket authentication
// Since httpOnly cookies can't be read by JS, the client
// exchanges their session cookie for a one-time WS ticket
const tickets = new Map<string, { team_id: string; user_id: string }>();
const TICKET_TTL = 30_000; // 30 seconds

export function consumeTicket(ticket: string) {
  const data = tickets.get(ticket);
  if (data) tickets.delete(ticket);
  return data;
}

export default defineEventHandler((event) => {
  const token = getCookie(event, "session");
  if (!token) {
    throw createError({ statusCode: 401, message: "Not authenticated" });
  }

  const session = getSessionByToken(token);
  if (!session) {
    throw createError({ statusCode: 401, message: "Invalid session" });
  }

  const ticket = crypto.randomUUID();
  tickets.set(ticket, { team_id: session.team_id, user_id: session.user_id });

  // Clean up expired tickets
  setTimeout(() => tickets.delete(ticket), TICKET_TTL);

  return { ticket };
});
