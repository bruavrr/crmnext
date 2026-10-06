"use client";
import { useSyncExternalStore, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, ShieldCheck, Workflow, Target } from "lucide-react";
import Brand from "@/components/brand";
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
        <Brand />
        <div>
          <span className="eyebrow">NEXT GEN ADS · SALES WORKSPACE</span>
          <h1>
            Cada oportunidade.
            <br />
            Um próximo nível.
          </h1>
          <p>
            Distribuição inteligente. Atendimento no tempo certo. Sua operação
            comercial, em um só lugar.
          </p>
        </div>
        <div className="auth-capabilities">
          <span>
            <Workflow size={16} /> Distribuição equilibrada
          </span>
          <span>
            <Target size={16} /> Foco na conversão
          </span>
        </div>
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
          <div className="auth-mobile-brand">
            <Brand compact />
          </div>
          <span className="eyebrow">BEM-VINDO DE VOLTA</span>
          <h2>Seu próximo negócio começa aqui.</h2>
          <p>Entre no workspace comercial da Next Gen Ads.</p>
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
          <button
            className="primary"
            aria-label="Entrar no CRM"
            disabled={busy || !ready}
          >
            {busy ? "Entrando…" : "Entrar"}
            <ArrowRight size={17} />
          </button>
          <small>
            Primeiro acesso? Use o convite enviado pelo administrador.
          </small>
          <div className="auth-security">
            <ShieldCheck size={14} /> Acesso seguro e exclusivo da equipe
          </div>
        </form>
      </section>
    </main>
  );
}
