"use client";
import { useSyncExternalStore, useState } from "react";
import { useRouter } from "next/navigation";
const subscribe = () => () => {};
export default function Invite() {
  const router = useRouter();
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="auth-shell single">
      <section className="auth-form">
        <form
          method="post"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const f = new FormData(e.currentTarget);
            if (f.get("password") !== f.get("confirm")) {
              setError("As senhas não coincidem");
              setBusy(false);
              return;
            }
            const r = await fetch("/api/invite", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: location.hash.slice(1),
                password: f.get("password"),
              }),
            });
            const data = await r.json();
            setBusy(false);
            if (r.ok) {
              history.replaceState(null, "", "/invite");
              router.replace("/login");
            } else setError(data.error);
          }}
        >
          <span className="eyebrow">NEXTGEN CRM</span>
          <h2>Seu próximo capítulo.</h2>
          <p>Crie uma senha com pelo menos 12 caracteres.</p>
          <label>
            Nova senha
            <input
              type="password"
              name="password"
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Confirmar senha
            <input
              type="password"
              name="confirm"
              minLength={12}
              autoComplete="new-password"
              required
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy || !ready} className="primary">
            {busy ? "Salvando…" : "Criar minha senha"}
          </button>
        </form>
      </section>
    </main>
  );
}
