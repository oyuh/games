import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

const ALLOWED_GITHUB_IDS = (process.env.ADMIN_GITHUB_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const login = (profile as Record<string, unknown>)?.login;
      if (typeof login !== "string") return false;
      if (ALLOWED_GITHUB_IDS.length === 0) return false;
      return ALLOWED_GITHUB_IDS.includes(login);
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as any).githubId = token.sub;
        (session.user as any).githubLogin = token.login;
      }
      return session;
    },
    async jwt({ token, profile }) {
      if (profile) {
        token.login = profile.login;
      }
      return token;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  trustHost: true,
});
