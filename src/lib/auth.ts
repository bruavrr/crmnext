import { NextAuthOptions, getServerSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import argon2 from "argon2";
import { and, eq } from "drizzle-orm";
import { users } from "./schema";
import { db, pool, AppError } from "./db";
import { randomBytes, createHash } from "node:crypto";
import { consumeRate, Actor } from "./crm";
const dummyHash = argon2.hash(randomBytes(32).toString("hex"), {
  type: argon2.argon2id,
});
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 28800 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "NextGen",
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase() || "";
        if (
          !email ||
          email.length > 254 ||
          !credentials?.password ||
          credentials.password.length > 128
        )
          return null;
        await consumeRate(
          `login:${createHash("sha256").update(email).digest("hex")}`,
          10,
        );
        const r = await pool.query(
          "SELECT * FROM users WHERE email=$1 AND active",
          [email],
        );
        const u = r.rows[0];
        const valid = await argon2.verify(
          u?.password_hash || (await dummyHash),
          credentials.password,
        );
        if (!u?.password_hash || !valid) return null;
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          sessionVersion: u.session_version,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.version = (
          user as typeof user & { sessionVersion: number }
        ).sessionVersion;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user)
        Object.assign(session.user, { id: token.uid, version: token.version });
      return session;
    },
  },
};
export async function currentActor(): Promise<Actor> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string; version?: number } | undefined)
    ?.id;
  if (!id) throw new AppError(401, "Faça login");
  const [u] = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      sessionVersion: users.sessionVersion,
    })
    .from(users)
    .where(and(eq(users.id, id), eq(users.active, true)));
  if (
    !u ||
    u.sessionVersion !==
      (session?.user as unknown as { version: number }).version
  )
    throw new AppError(401, "Conta indisponível");
  return u;
}
