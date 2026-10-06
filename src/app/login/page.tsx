"use client";
import { useSyncExternalStore, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, Layers3 } from "lucide-react";
const subscribe = () => () => {};
export default function Login() {
  const router = useRouter();
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="auth-shell">
      <section className="auth-brand">
        <div className="brand">
          <Layers3 />
          <b>
            nextgen<span>CRM</span>
          </b>
        </div>
        <div>
          <span className="eyebrow">MENOS ATRITO. MAIS CONVERSÃO.</span>
          <h1>
            Grandes relações.
            <br />
            Novos negócios.
          </h1>
          <p>
            O espaço da sua equipe para transformar cada oportunidade em um
            próximo passo.
          </p>
        </div>
        <small>NextDim · Seu comercial, conectado.</small>
      </section>
      <section className="auth-form">
        <form
          method="post"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            const r = await signIn("credentials", {
              email: f.get("email"),
              password: f.get("password"),
              redirect: false,
            });
            setBusy(false);
            if (r?.ok) {
              router.replace("/");
              router.refresh();
            } else
              setError(
                "Não foi possível entrar. Verifique suas credenciais e tente novamente.",
              );
          }}
        >
          <span className="eyebrow">BEM-VINDO DE VOLTA</span>
          <h2>Vamos fazer acontecer.</h2>
          <p>Acesse sua conta para acompanhar o comercial.</p>
          <label>
            E-mail
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="voce@empresa.com"
            />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy || !ready}>
            {busy ? "Entrando…" : "Entrar no CRM"}
            <ArrowRight size={17} />
          </button>
          <small>
            Primeiro acesso? Use o convite enviado pelo administrador.
          </small>
        </form>
      </section>
    </main>
  );
}
