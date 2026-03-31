import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";

const ALLOWED_GITHUB_IDS = (process.env.ADMIN_GITHUB_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const isDev = process.env.NODE_ENV !== "production";
const devSecret = process.env.ADMIN_DEV_SECRET;

const providers: any[] = [
  GitHub({
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  }),
];

if (isDev && devSecret) {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Dev Login",
      credentials: {
        secret: { label: "Dev Secret", type: "password" },
      },
      async authorize(credentials) {
        if (credentials?.secret !== devSecret) return null;
        return {
          id: "dev-admin",
          name: "Dev Admin",
          email: "dev@localhost",
        };
      },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "dev-login") return true;
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
