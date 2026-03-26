export interface AppSession {
  authenticated: boolean;
  team_id: string;
  user_id: string;
  user_name: string;
  is_admin: boolean;
}

export function useSession() {
  const session = useState<AppSession | null>("session", () => null);
  const authState = useState<"loading" | "unauthenticated" | "authenticated">(
    "authState",
    () => "loading"
  );

  async function fetchSession() {
    try {
      const res = await $fetch<AppSession>("/api/auth/me");
      if (res.authenticated) {
        session.value = res;
        authState.value = "authenticated";
      } else {
        authState.value = "unauthenticated";
      }
    } catch {
      authState.value = "unauthenticated";
    }
  }

  return { session, authState, fetchSession };
}
