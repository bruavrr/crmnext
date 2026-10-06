"use client";
import { useMemo, useState } from "react";
import Papa from "papaparse";
import Dialog from "./dialog";
import {
  Plus,
  X,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Instagram,
  Send,
  ShieldCheck,
  Search,
  Upload,
  ArrowRight,
  Check,
} from "lucide-react";
import type { CRMData, Prospect, Conversation, Message } from "@/lib/types";
const fmt = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const localDate = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
const statuses = [
  "Não abordado",
  "Abordado",
  "Respondeu",
  "Interessado",
  "Reunião marcada",
  "Convertido",
  "Sem interesse",
  "Sem resposta",
];
type Props = {
  data: CRMData;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
};
async function op(input: unknown) {
  const r = await fetch("/api/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const v = await r.json();
  if (!r.ok) throw new Error(v.error);
  return v;
}
export function Prospection({ data, refresh, notify }: Props) {
  const [modal, setModal] = useState(false),
    [selected, setSelected] = useState<Prospect | null>(null),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState(""),
    [search, setSearch] = useState("");
  const admin = data.actor.role === "admin";
  async function submit(v: unknown) {
    setBusy(true);
    try {
      await op(v);
      await refresh();
      setModal(false);
      setSelected(null);
      notify("Prospecção atualizada");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Conexões que começam com um oi</h3>
            <p>
              Registro manual de prospecção pelo Instagram. Nenhum Direct é
              enviado pelo CRM.
            </p>
          </div>
          <button className="primary" onClick={() => setModal(true)}>
            <Plus size={15} />
            Novo perfil
          </button>
        </div>
        <div className="prospect-filters">
          <label className="global-search">
            <Search size={15} />
            <input
              placeholder="Buscar perfil ou nome"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            value={filter}
            aria-label="Status da prospecção"
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">Todos os status</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Perfil</th>
                <th>Responsável</th>
                <th>Status</th>
                <th>Primeiro contato</th>
                <th>Próximo follow-up</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.prospects
                .filter(
                  (p) =>
                    (!filter || p.status === filter) &&
                    (!search ||
                      (p.name + " " + p.username)
                        .toLowerCase()
                        .includes(search.toLowerCase())),
                )
                .map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => {
                      setSelected(p);
                      setModal(true);
                    }}
                  >
                    <td>
                      <strong>{p.name}</strong>
                      <small className="block muted">@{p.username}</small>
                    </td>
                    <td>{p.owner}</td>
                    <td>
                      <span className="badge purple">{p.status}</span>
                    </td>
                    <td>{fmt(p.first_contact_at)}</td>
                    <td>{fmt(p.followup_at)}</td>
                    <td>
                      <ArrowRight size={15} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!data.prospects.length && (
          <div className="empty">
            <Instagram size={30} />
            <h3>Seu próximo relacionamento começa aqui</h3>
            <p>
              Cadastre um perfil. A equipe será avisada se ele já estiver sendo
              trabalhado.
            </p>
          </div>
        )}
        <div className="fairness-note">
          <ShieldCheck size={16} />
          Perfis únicos na equipe. Duplicidades são bloqueadas com o nome do
          responsável.
        </div>
      </section>
      {modal && (
        <Dialog
          title={
            selected ? "Atualizar prospecção" : "Adicionar perfil à prospecção"
          }
          close={() => {
            setModal(false);
            setSelected(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (selected)
                submit({
                  action: "prospect.update",
                  id: selected.id,
                  status: f.get("status"),
                  last_message: f.get("last_message"),
                  followup_at: f.get("followup_at")
                    ? new Date(f.get("followup_at") as string).toISOString()
                    : "",
                  notes: f.get("notes"),
                });
              else
                submit({ action: "prospect.create", ...Object.fromEntries(f) });
            }}
          >
            {selected ? (
              <>
                <p className="modal-subtitle">
                  @{selected.username} · {selected.owner}
                </p>
                <label>
                  Status
                  <select name="status" defaultValue={selected.status}>
                    {statuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Última mensagem registrada
                  <textarea
                    name="last_message"
                    defaultValue={selected.last_message || ""}
                  />
                </label>
                <label>
                  Próximo follow-up
                  <input
                    type="datetime-local"
                    name="followup_at"
                    defaultValue={
                      selected.followup_at
                        ? localDate(new Date(selected.followup_at))
                        : ""
                    }
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Nome
                  <input name="name" required minLength={2} />
                </label>
                <label>
                  Instagram
                  <input
                    name="username"
                    placeholder="@username"
                    pattern="@?[a-zA-Z0-9._]+"
                    required
                  />{" "}
                </label>
                {admin && (
                  <label>
                    Responsável
                    <select name="owner_id" required>
                      {data.users
                        .filter((u) => u.role === "sdr" && u.active)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </>
            )}
            <label>
              Observações
              <textarea name="notes" defaultValue={selected?.notes || ""} />
            </label>
            {selected && (
              <p className="form-hint">
                Ao marcar Convertido, um lead será criado e distribuído pelo
                rodízio. O perfil permanece registrado.
              </p>
            )}
            <button className="primary" disabled={busy}>
              {selected ? "Salvar prospecção" : "Cadastrar perfil"}
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function Agenda({ data, refresh, notify }: Props) {
  const [renderTime] = useState(() => Date.now());
  const [view, setView] = useState("month"),
    [anchor, setAnchor] = useState(new Date()),
    [modal, setModal] = useState(false),
    [busy, setBusy] = useState(false);
  const days = useMemo(() => {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    let count = 1;
    if (view === "month") {
      start.setDate(1);
      start.setDate(start.getDate() - start.getDay());
      count = 42;
    } else if (view === "week") {
      start.setDate(start.getDate() - start.getDay());
      count = 7;
    }
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [anchor, view]);
  const events = [
    ...data.meetings.map((m) => ({
      id: m.id,
      title: m.title,
      sub: m.lead_name,
      date: m.starts_at,
      type: "meeting",
    })),
    ...data.followups.map((f) => ({
      id: f.id,
      title: "Follow-up",
      sub: f.lead_name,
      date: f.due_at,
      type: "followup",
    })),
    ...data.tasks
      .filter((t) => !t.completed_at)
      .map((t) => ({
        id: t.id,
        title: t.title,
        sub: t.lead_name,
        date: t.due_at,
        type: "task",
      })),
  ];
  function navigate(n: number) {
    const d = new Date(anchor);
    if (view === "month") {
      d.setDate(1);
      d.setMonth(d.getMonth() + n);
    } else d.setDate(d.getDate() + n * (view === "week" ? 7 : 1));
    setAnchor(d);
  }
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>
              {anchor.toLocaleDateString("pt-BR", {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <p>Reuniões, follow-ups e tarefas da equipe</p>
          </div>
          <div className="inline">
            <button
              className="icon-button"
              aria-label="Período anterior"
              onClick={() => navigate(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button className="secondary" onClick={() => setAnchor(new Date())}>
              Hoje
            </button>
            <button
              className="icon-button"
              aria-label="Próximo período"
              onClick={() => navigate(1)}
            >
              <ChevronRight size={16} />
            </button>
            <select
              aria-label="Visualização da agenda"
              value={view}
              onChange={(e) => setView(e.target.value)}
            >
              <option value="day">Dia</option>
              <option value="week">Semana</option>
              <option value="month">Mês</option>
            </select>
            <button className="primary" onClick={() => setModal(true)}>
              <Plus size={14} />
              Reunião
            </button>
          </div>
        </div>
        <div className={`calendar-grid ${view}`}>
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className={
                "calendar-cell " +
                (d.toDateString() === new Date().toDateString()
                  ? "today "
                  : "") +
                (d.getMonth() !== anchor.getMonth() ? "other-month" : "")
              }
            >
              <header>
                <span>
                  {d.toLocaleDateString("pt-BR", { weekday: "short" })}
                </span>
                <b>{d.getDate()}</b>
              </header>
              {events
                .filter(
                  (e) => new Date(e.date).toDateString() === d.toDateString(),
                )
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((e) => (
                  <div key={e.id} className={"calendar-event " + e.type}>
                    <strong>
                      {new Date(e.date).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {e.title}
                    </strong>
                    <small>{e.sub}</small>
                    {e.type === "meeting" && (
                      <button
                        aria-label={`Cancelar ${e.title}`}
                        onClick={async () => {
                          try {
                            await op({ action: "meeting.cancel", id: e.id });
                            await refresh();
                            notify(
                              "Reunião cancelada e registrada no histórico",
                            );
                          } catch (err) {
                            notify((err as Error).message);
                          }
                        }}
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </section>
      <div className="fairness-note spaced">
        <CalendarDays size={16} />
        Agenda interna persistida. A sincronização com Google Calendar ainda não
        está conectada.
      </div>
      {modal && (
        <Dialog
          title="Uma conversa com hora marcada"
          close={() => setModal(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                await op({
                  action: "meeting.create",
                  title: f.get("title"),
                  lead_id: f.get("lead_id"),
                  starts_at: new Date(
                    f.get("starts_at") as string,
                  ).toISOString(),
                  ends_at: new Date(f.get("ends_at") as string).toISOString(),
                  notes: f.get("notes"),
                });
                await refresh();
                setModal(false);
                notify("Reunião agendada");
              } catch (err) {
                notify((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Título
              <input
                name="title"
                defaultValue="Reunião de diagnóstico"
                required
                minLength={2}
              />
            </label>
            <label>
              Lead
              <select name="lead_id" required>
                {data.leads
                  .filter((l) => l.owner_id)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Início
                <input
                  name="starts_at"
                  type="datetime-local"
                  defaultValue={localDate(new Date(renderTime + 86400000))}
                  required
                />
              </label>
              <label>
                Término
                <input
                  name="ends_at"
                  type="datetime-local"
                  defaultValue={localDate(new Date(renderTime + 90000000))}
                  required
                />
              </label>
            </div>
            <label>
              Observações
              <textarea name="notes" />
            </label>
            <button className="primary" disabled={busy}>
              Agendar reunião
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function Conversations({ data, refresh, notify }: Props) {
  const [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<Conversation | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [modal, setModal] = useState(false),
    [busy, setBusy] = useState(false);
  async function open(c: Conversation) {
    setSelected(c);
    setMessages([]);
    try {
      const r = await op({ action: "conversation.read", id: c.id });
      setMessages(r.messages);
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <>
      <div className="phase-banner">
        <MessageCircle size={24} />
        <div>
          <strong>Central de conversas · integrações desconectadas</strong>
          <p>
            Mensagens de demonstração estão identificadas. Envio e recebimento
            reais dependem da conexão oficial com Meta.
          </p>
        </div>
        {data.development && data.actor.role === "admin" && (
          <button className="secondary" onClick={() => setModal(true)}>
            Simular entrada local
          </button>
        )}
      </div>
      <section className="panel conversation-layout">
        <aside>
          <div className="conversation-filters">
            <select
              aria-label="Filtro de conversas"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Todas</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="unread">Não lidas</option>
              <option value="waiting">Aguardando resposta</option>
              {data.users
                .filter((u) => u.role === "sdr")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </div>
          {data.conversations
            .filter(
              (c) =>
                filter === "all" ||
                c.channel === filter ||
                (filter === "unread" && c.unread) ||
                (filter === "waiting" && c.awaiting_reply) ||
                c.owner_id === filter,
            )
            .map((c) => (
              <button
                className={
                  "conversation-item " +
                  (selected?.id === c.id ? "selected" : "")
                }
                key={c.id}
                onClick={() => open(c)}
              >
                <span className={"channel-icon " + c.channel}>
                  {c.channel === "instagram" ? (
                    <Instagram size={19} />
                  ) : (
                    <MessageCircle size={19} />
                  )}
                </span>
                <span>
                  <strong>
                    {c.lead_name}
                    {c.unread && <i />}
                  </strong>
                  <small>{c.last_message || "Nenhuma mensagem"}</small>
                  <small>
                    {c.owner} · {fmt(c.last_message_at)}
                  </small>
                </span>
              </button>
            ))}
          {!data.conversations.length && (
            <div className="empty">
              <MessageCircle size={25} />
              <p>Ainda não há conversas.</p>
            </div>
          )}
        </aside>
        <div className="conversation-main">
          {selected ? (
            <>
              <header>
                <div>
                  <h3>{selected.lead_name}</h3>
                  <p>
                    {selected.channel} · {selected.owner}
                  </p>
                </div>
                {selected.demo && (
                  <span className="badge amber">Demonstração</span>
                )}
              </header>
              <div className="messages">
                {messages.map((m) => (
                  <div className={"message " + m.direction} key={m.id}>
                    <p>{m.body}</p>
                    <small>{fmt(m.created_at)}</small>
                  </div>
                ))}
              </div>
              <footer>
                <ShieldCheck size={17} />
                <p>
                  Envio indisponível. Conecte a API oficial antes de conversar
                  com clientes.
                </p>
                <button
                  className="icon-button"
                  aria-label="Envio indisponível"
                  disabled
                >
                  <Send size={18} />
                </button>
              </footer>
            </>
          ) : (
            <div className="empty">
              <MessageCircle size={38} />
              <h3>Cada conversa tem uma história</h3>
              <p>Selecione um contato para acompanhar as mensagens.</p>
            </div>
          )}
        </div>
      </section>
      {modal && (
        <Dialog
          title="Mensagem fictícia de desenvolvimento"
          close={() => setModal(false)}
        >
          <p className="modal-subtitle">
            Este mock não chama serviços externos. A entrada será persistida e
            passará pela deduplicação e pelo Round Robin.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await op({
                  action: "demo.message",
                  ...Object.fromEntries(new FormData(e.currentTarget)),
                });
                await refresh();
                setModal(false);
                notify("Mensagem fictícia recebida");
              } catch (err) {
                notify((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Canal
              <select name="channel">
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
              </select>
            </label>
            <label>
              Nome
              <input name="name" required />
            </label>
            <label>
              Telefone
              <input name="phone" placeholder="Obrigatório para WhatsApp" />
            </label>
            <label>
              Instagram
              <input
                name="instagram"
                placeholder="Obrigatório para Instagram"
              />
            </label>
            <label>
              Mensagem
              <textarea name="body" required />
            </label>
            <button className="primary" disabled={busy}>
              Simular recebimento
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function CsvImport({
  close,
  refresh,
  notify,
}: {
  close: () => void;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [csv, setCsv] = useState(""),
    [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [count, setCount] = useState(0);
  return (
    <Dialog title="Importar oportunidades por CSV" close={close}>
      <p className="modal-subtitle">
        Mapeie as colunas. Duplicidades serão associadas a leads existentes;
        novos leads entram no rodízio. Até 500 linhas e 60 KB por arquivo.
      </p>
      <label className="csv-upload">
        <Upload size={25} />
        <span>Selecione um arquivo .csv</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 60000) {
              notify("Arquivo maior que 60 KB");
              return;
            }
            const text = await file.text(),
              parsed = Papa.parse<Record<string, string>>(text, {
                header: true,
                skipEmptyLines: "greedy",
              });
            if (parsed.errors.length) {
              notify("CSV inválido: " + parsed.errors[0].message);
              return;
            }
            setCsv(text);
            setHeaders(parsed.meta.fields || []);
            setCount(parsed.data.length);
            setMapping(
              Object.fromEntries(
                [
                  "name",
                  "phone",
                  "email",
                  "instagram",
                  "company",
                  "source",
                  "campaign",
                ].map((field) => [
                  field,
                  (parsed.meta.fields || []).find(
                    (h) => h.toLowerCase() === field,
                  ) || "",
                ]),
              ),
            );
          }}
        />
      </label>
      {headers.length > 0 && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await fetch("/api/csv", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  csv,
                  mapping: Object.fromEntries(
                    Object.entries(mapping).filter(([, v]) => v),
                  ),
                }),
              });
              const result = await r.json();
              if (!r.ok) throw new Error(result.error);
              await refresh();
              close();
              notify(
                `${result.created} leads criados; ${result.duplicates} entradas associadas a contatos existentes.`,
              );
            } catch (err) {
              notify((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="form-hint">
            {count} linhas encontradas. Nenhuma alteração será salva se uma
            linha falhar.
          </p>
          <div className="form-grid">
            {Object.entries({
              name: "Nome *",
              phone: "Telefone",
              email: "E-mail",
              instagram: "Instagram",
              company: "Empresa",
              source: "Origem",
              campaign: "Campanha",
            }).map(([field, label]) => (
              <label key={field}>
                {label}
                <select
                  required={field === "name"}
                  value={mapping[field] || ""}
                  onChange={(e) =>
                    setMapping({ ...mapping, [field]: e.target.value })
                  }
                >
                  <option value="">Não mapear</option>
                  {headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button className="primary" disabled={busy}>
            <Check size={15} />
            {busy ? "Importando…" : "Validar e importar"}
          </button>
        </form>
      )}
    </Dialog>
  );
}
export function Reports({ data }: { data: CRMData }) {
  const currency = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const m = data.metrics;
  return (
    <>
      <div className="stat-grid">
        {[
          { title: "Total de leads", v: m.total },
          { title: "Receita gerada", v: currency(m.revenue) },
          {
            title: "Ticket médio",
            v: currency(m.revenue / Math.max(1, m.won)),
          },
          {
            title: "Taxa de conversão",
            v: ((m.won / Math.max(1, m.total)) * 100).toFixed(1) + "%",
          },
        ].map((s) => (
          <section className="stat-card" key={s.title}>
            <span>{s.title}</span>
            <strong>{s.v}</strong>
            <small>Filtros e coorte de entrada selecionados</small>
          </section>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Desempenho por SDR</h3>
            <p>
              Reuniões registradas/agendadas · métricas calculadas em todo o
              conjunto filtrado
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>SDR</th>
                <th>Recebidos</th>
                <th>Contatados</th>
                <th>Reuniões</th>
                <th>Vendas</th>
                <th>Conversão</th>
                <th>1º atendimento</th>
              </tr>
            </thead>
            <tbody>
              {data.comparison.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.received}</td>
                  <td>{u.contacted}</td>
                  <td>{u.meetings}</td>
                  <td>{u.won}</td>
                  <td>
                    {((u.won / Math.max(1, u.received)) * 100).toFixed(1)}%
                  </td>
                  <td>{Math.round(u.avg_contact)} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {[
        { title: "Conversão por origem", rows: data.reports.bySource },
        { title: "Conversão por campanha", rows: data.reports.byCampaign },
        { title: "Leads por etapa", rows: data.reports.byStage },
      ].map((group) => (
        <section className="panel spaced" key={group.title}>
          <div className="panel-heading">
            <h3>{group.title}</h3>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Leads</th>
                  <th>Vendas</th>
                  <th>Conversão</th>
                  <th>Receita</th>
                  <th>1º atendimento</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((r) => (
                  <tr key={r.label}>
                    <td>
                      <strong>{r.label}</strong>
                      <div className="inline-report-bar">
                        <i
                          style={{
                            width: (r.leads / Math.max(1, m.total)) * 100 + "%",
                          }}
                        />
                      </div>
                    </td>
                    <td>{r.leads}</td>
                    <td>{r.won}</td>
                    <td>
                      {((r.won / Math.max(r.leads, 1)) * 100).toFixed(1)}%
                    </td>
                    <td>{currency(r.revenue)}</td>
                    <td>{Math.round(r.avg_contact)} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!group.rows.length && (
            <p className="empty">Sem dados para estes filtros.</p>
          )}
        </section>
      ))}
      <section className="panel spaced">
        <div className="panel-heading">
          <h3>Motivos de perda</h3>
        </div>
        {data.reports.losses.map((r) => (
          <div className="report-bar" key={r.label}>
            <span>{r.label}</span>
            <div>
              <i
                style={{ width: (r.leads / Math.max(1, m.lost)) * 100 + "%" }}
              />
            </div>
            <strong>{r.leads}</strong>
          </div>
        ))}
        {!data.reports.losses.length && (
          <p className="empty">Nenhuma perda registrada no período.</p>
        )}
      </section>
      <div className="fairness-note spaced">
        <ShieldCheck size={16} />O período filtra a data de entrada dos leads.
        Conversões e receita refletem o estado atual dessa coorte; vendas
        reabertas deixam de compor a receita exibida.
      </div>
    </>
  );
}
