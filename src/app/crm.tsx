"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Modal from "@/components/dialog";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  Columns3,
  MessageCircle,
  Compass,
  CheckSquare,
  CalendarDays,
  ChartNoAxesCombined,
  UsersRound,
  Plug,
  Settings,
  Search,
  Bell,
  Plus,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
  Clock,
  Target,
  TrendingUp,
  UserPlus,
  Layers3,
  PanelLeftClose,
  Menu,
  X,
  Check,
  Phone,
  Flame,
  Sun,
  Snowflake,
  RefreshCw,
  LogOut,
  ShieldCheck,
  AlertCircle,
  MoveRight,
  Calendar,
  GripVertical,
} from "lucide-react";
import {
  Agenda,
  Prospection,
  Conversations,
  CsvImport,
  Reports,
} from "@/components/operations";
import type { CRMData, Lead, Stage } from "@/lib/types";
const nav = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Meu Dia", icon: Sun },
  { name: "Leads", icon: Users },
  { name: "Pipeline", icon: Columns3 },
  { name: "Conversas", icon: MessageCircle },
  { name: "Prospecção", icon: Compass },
  { name: "Tarefas", icon: CheckSquare },
  { name: "Agenda", icon: CalendarDays },
  { name: "Relatórios", icon: ChartNoAxesCombined },
  { name: "Equipe", icon: UsersRound },
  { name: "Integrações", icon: Plug },
  { name: "Configurações", icon: Settings },
];
const money = (v: number | string) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const initials = (s: string) =>
  s
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
const tempLabel: Record<string, string> = {
  hot: "Quente",
  warm: "Morno",
  cold: "Frio",
  unclassified: "Não classificado",
};
function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return <span className={`avatar a${index % 3}`}>{initials(name)}</span>;
}
function Status({ lead }: { lead: Lead }) {
  return (
    <span
      className={`badge ${lead.stage_kind === "won" ? "green" : lead.stage_kind === "lost" ? "red" : lead.stage_position > 3 ? "purple" : "blue"}`}
    >
      <i />
      {lead.stage}
    </span>
  );
}
function Temperature({ value }: { value: string }) {
  const Icon = value === "hot" ? Flame : value === "cold" ? Snowflake : Sun;
  return (
    <span className={`temperature ${value}`}>
      <Icon size={13} />
      {tempLabel[value]}
    </span>
  );
}
async function request(url: string, method: string, body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || "Falha na operação");
  return result;
}
function LeadTable({
  rows,
  onOpen,
}: {
  rows: Lead[];
  onOpen: (lead: Lead) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Nome do lead</th>
            <th>Origem</th>
            <th>Responsável</th>
            <th>Etapa</th>
            <th>Temperatura</th>
            <th>Próxima ação</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((l, i) => (
            <tr
              key={l.id}
              onClick={() => onOpen(l)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") onOpen(l);
              }}
            >
              <td>
                <div className="person">
                  <Avatar name={l.name} index={i} />
                  <div>
                    <strong>{l.name}</strong>
                    <small>{l.company || l.email || l.phone}</small>
                  </div>
                </div>
              </td>
              <td>
                <span className="source-dot" /> {l.source}
              </td>
              <td>
                {l.owner ? (
                  <span className="owner">
                    <Avatar
                      name={l.owner}
                      index={l.owner.includes("Bruna") ? 1 : 2}
                    />
                    {l.owner}
                  </span>
                ) : (
                  <span className="muted">Aguardando distribuição</span>
                )}
              </td>
              <td>
                <Status lead={l} />
              </td>
              <td>
                <Temperature value={l.temperature} />
              </td>
              <td>
                {l.sla_breached ? (
                  <span className="sla">
                    <AlertCircle size={13} />
                    Sem atendimento
                  </span>
                ) : l.next_followup ? (
                  <span
                    className={
                      new Date(l.next_followup) < new Date() ? "sla" : ""
                    }
                  >
                    {date(l.next_followup)}
                  </span>
                ) : (
                  <span className="muted">
                    {l.first_contact_at
                      ? "Definir próxima ação"
                      : "Primeiro contato"}
                  </span>
                )}
              </td>
              <td>
                <ArrowUpRight size={15} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty">
          <Users size={28} />
          <h3>Nenhum lead por aqui</h3>
          <p>Crie um lead ou ajuste os filtros para começar.</p>
        </div>
      )}
    </div>
  );
}
export default function CRM() {
  const [renderTime] = useState(() => Date.now());
  const [followupDate, setFollowupDate] = useState(() => {
    const d = new Date(Date.now() + 86400000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [tagFilter, setTagFilter] = useState(""),
    [lastAfter, setLastAfter] = useState(""),
    [lastBefore, setLastBefore] = useState(""),
    [followupAfter, setFollowupAfter] = useState(""),
    [followupBefore, setFollowupBefore] = useState("");
  const [tab, setTab] = useState("Dashboard"),
    [data, setData] = useState<CRMData | null>(null),
    [search, setSearch] = useState(""),
    [period, setPeriod] = useState("all"),
    [owner, setOwner] = useState(""),
    [source, setSource] = useState(""),
    [campaign, setCampaign] = useState(""),
    [stageFilter, setStageFilter] = useState(""),
    [temperature, setTemperature] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [sideOpen, setSideOpen] = useState(false),
    [notificationOpen, setNotificationOpen] = useState(false),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState<Lead | null>(null),
    [timeline, setTimeline] = useState<
      {
        id: string;
        description: string;
        created_at: string;
        actor: string | null;
        type: string;
      }[]
    >([]),
    [targetStage, setTargetStage] = useState<Stage | null>(null),
    [invite, setInvite] = useState(""),
    [customStart, setCustomStart] = useState(""),
    [customEnd, setCustomEnd] = useState("");
  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (owner) p.set("owner", owner);
      if (source) p.set("source", source);
      if (campaign) p.set("campaign", campaign);
      if (search) p.set("search", search);
      if (stageFilter) p.set("stage", stageFilter);
      if (temperature) p.set("temperature", temperature);
      if (tagFilter) p.set("tag", tagFilter);
      for (const [key, value] of Object.entries({
        last_after: lastAfter,
        last_before: lastBefore,
        followup_after: followupAfter,
        followup_before: followupBefore,
      })) {
        if (value) {
          const d = new Date(value + "T00:00:00");
          if (key.endsWith("before")) d.setDate(d.getDate() + 1);
          p.set(key, d.toISOString());
        }
      }

      const now = new Date(),
        start = new Date();
      start.setHours(0, 0, 0, 0);
      let end: Date | null = null;
      if (period === "today") {
        /* start já está no início de hoje. */
      } else if (period === "yesterday") {
        start.setDate(start.getDate() - 1);
        end = new Date(start);
        end.setDate(end.getDate() + 1);
      } else if (period === "7" || period === "30") {
        start.setDate(start.getDate() - Number(period) + 1);
      } else if (period === "month") {
        start.setDate(1);
      } else if (period === "previous") {
        start.setDate(1);
        end = new Date(start);
        start.setMonth(start.getMonth() - 1);
      } else if (period === "custom" && customStart && customEnd) {
        const a = new Date(`${customStart}T00:00:00`),
          b = new Date(`${customEnd}T00:00:00`);
        b.setDate(b.getDate() + 1);
        p.set("start", a.toISOString());
        p.set("end", b.toISOString());
      }
      if (period !== "all" && period !== "custom") {
        p.set("start", start.toISOString());
        p.set(
          "end",
          (
            end ||
            new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
          ).toISOString(),
        );
      }
      const [r, operations] = await Promise.all([
        request("/api/crm?" + p, "GET"),
        request("/api/operations", "GET"),
      ]);
      setData({ ...r, ...operations });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [
    owner,
    source,
    campaign,
    search,
    period,
    customStart,
    customEnd,
    stageFilter,
    temperature,
    tagFilter,
    lastAfter,
    lastBefore,
    followupAfter,
    followupBefore,
  ]);
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function mutate(
    url: string,
    method: string,
    v: unknown,
    message = "Alteração salva",
  ) {
    setBusy(true);
    try {
      const r = await request(url, method, v);
      await load();
      setToast(message);
      return r;
    } catch (e) {
      setToast((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function openLead(lead: Lead) {
    setSelected(lead);
    setModal("lead");
    setTimeline([]);
    try {
      const r = await request(`/api/leads/${lead.id}`, "GET");
      setTimeline(r.timeline);
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function changeStage(lead: Lead, stage: Stage) {
    if (stage.id === lead.stage_id) return;
    setSelected(lead);
    setTargetStage(stage);
    if (stage.kind === "open") {
      try {
        await mutate(`/api/leads/${lead.id}`, "PATCH", {
          action: "stage",
          stage_id: stage.id,
        });
      } catch {
        /* A falha já é exibida ao usuário por mutate(). */
      }
    } else setModal("stage");
  }
  async function action(v: unknown) {
    if (!selected) return;
    await mutate(`/api/leads/${selected.id}`, "PATCH", v);
    setModal("");
  }
  const leads = useMemo(
    () =>
      data?.leads.filter(
        (l) =>
          (!stageFilter || l.stage_id === stageFilter) &&
          (!temperature || l.temperature === temperature),
      ) || [],
    [data, stageFilter, temperature],
  );
  const admin = data?.actor.role === "admin";
  const overdue =
    data?.followups.filter((f) => new Date(f.due_at) < new Date()) || [];
  const sources = Array.from(new Set(data?.leads.map((l) => l.source) || []));
  function newModal(name: string) {
    setModal(name);
    setInvite("");
  }

  if (!data)
    return (
      <div className="loading">
        <Layers3 size={36} />
        <h2>NextGen CRM</h2>
        <p>{error || "Preparando seu espaço de trabalho…"}</p>
        {error && (
          <button className="primary" onClick={load}>
            Tentar novamente
          </button>
        )}
      </div>
    );
  const m = data.metrics;
  const statCards = [
    {
      title: "Leads recebidos hoje",
      value: m.today,
      icon: UserPlus,
      color: "green",
      sub: `${m.month} neste mês`,
    },
    {
      title: "Aguardando contato",
      value: m.waiting,
      icon: Clock,
      color: "amber",
      sub: "Vamos dar o primeiro passo",
    },
    {
      title: "Reuniões agendadas",
      value: m.meetings,
      icon: CalendarDays,
      color: "purple",
      sub: "Oportunidades em movimento",
    },
    {
      title: "Vendas realizadas",
      value: m.won,
      icon: TrendingUp,
      color: "blue",
      sub: money(m.revenue) + " em receita",
    },
  ];
  const chart = Array.from({ length: 7 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - 6 + i);
    return {
      label: day
        .toLocaleDateString("pt-BR", { weekday: "short" })
        .replace(".", ""),
      count:
        data.daily.find(
          (d) =>
            d.day ===
            day.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        )?.count || 0,
    };
  });
  const max = Math.max(...chart.map((d) => d.count), 4);
  const points = chart
    .map((d, i) => `${45 + i * 91},${180 - (d.count / max) * 125}`)
    .join(" ");
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (sideOpen ? "open" : "")}>
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Layers3 size={23} />
          </span>
          <b>
            nextgen<span>CRM</span>
          </b>
        </Link>
        <button className="workspace" onClick={() => setTab("Configurações")}>
          <span className="workspace-avatar">N</span>
          <span>
            <strong>NextDim</strong>
            <small>Workspace comercial</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <span className="nav-label">ESPAÇO DE TRABALHO</span>
        <nav>
          {nav
            .filter(
              (n) =>
                admin ||
                !["Equipe", "Integrações", "Configurações"].includes(n.name),
            )
            .map(({ name, icon: Icon }) => (
              <button
                key={name}
                className={tab === name ? "active" : ""}
                onClick={() => {
                  setTab(name);
                  setSideOpen(false);
                  setStageFilter("");
                }}
              >
                <Icon size={18} />
                <span>{name}</span>
                {name === "Leads" && (
                  <span className="nav-count">{m.total}</span>
                )}
                {name === "Meu Dia" && overdue.length > 0 && (
                  <span className="nav-alert" />
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="rotation-mini">
            <span>
              <span className="live-dot" /> Distribuição automática
            </span>
            <small>SDRs disponíveis no rodízio</small>
          </div>
          <button
            className="profile"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <Avatar name={data.actor.name} />
            <span>
              <strong>{data.actor.name}</strong>
              <small>{admin ? "Administrador" : "SDR"} · Sair</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {sideOpen && (
        <button
          aria-label="Fechar menu"
          className="side-scrim"
          onClick={() => setSideOpen(false)}
        />
      )}
      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setSideOpen(true)}
            >
              <Menu size={20} />
            </button>
            <PanelLeftClose size={17} />
            <span>Workspace</span>
            <span>/</span>
            <b>{tab}</b>
          </div>
          <div className="top-actions">
            <label className="global-search">
              <Search size={16} />
              <input
                placeholder="Buscar leads, empresas…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (e.target.value) setTab("Leads");
                }}
              />
              <kbd>⌕</kbd>
            </label>
            <button
              className="icon-button notification-button"
              aria-label="Notificações"
              onClick={() => setNotificationOpen(!notificationOpen)}
            >
              <Bell size={19} />
              {data.notifications.some((n) => !n.read_at) && <i />}
            </button>
            <span className="top-divider" />
            <Avatar name={data.actor.name} />
          </div>
          {notificationOpen && (
            <div className="notification-panel">
              <h3>Notificações</h3>
              {data.notifications.length ? (
                data.notifications.map((n) => (
                  <div
                    key={n.id}
                    className={n.read_at ? "notification-read" : ""}
                  >
                    <button
                      className="icon-button"
                      aria-label="Marcar notificação como lida"
                      disabled={!!n.read_at}
                      onClick={async () => {
                        try {
                          await mutate(
                            "/api/operations",
                            "POST",
                            { action: "notification.read", id: n.id },
                            "Notificação lida",
                          );
                        } catch {
                          /* A falha já é exibida ao usuário por mutate(). */
                        }
                      }}
                    >
                      <Bell size={15} />
                    </button>
                    <span>
                      {n.message}
                      <small>{date(n.created_at)}</small>
                    </span>
                  </div>
                ))
              ) : (
                <p>Nenhuma notificação.</p>
              )}
            </div>
          )}
        </header>
        <div className="content">
          {data.demoMode && (
            <div className="demo-notice">
              <ShieldCheck size={14} />
              Ambiente de demonstração · dados fictícios de desenvolvimento
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">SEU COMERCIAL, EM MOVIMENTO</div>
              <h1>{tab === "Dashboard" ? "Visão geral" : tab}</h1>
              <p>
                {tab === "Dashboard"
                  ? `Olá, ${data.actor.name.split(" ")[0]}. Acompanhe os resultados e encontre seu próximo passo.`
                  : tab === "Meu Dia"
                    ? "As ações que merecem sua atenção, na ordem certa."
                    : tab === "Pipeline"
                      ? "Cada conversa, um passo mais perto do próximo negócio."
                      : tab === "Leads"
                        ? "Relacionamentos bem cuidados começam aqui."
                        : "Organize sua operação comercial com clareza."}
              </p>
            </div>
            <div className="heading-actions">
              <span className="live-status">
                <i />
                Atualiza a cada 30s
              </span>
              <button className="primary" onClick={() => newModal("newLead")}>
                <Plus size={17} />
                Novo lead
              </button>
            </div>
          </div>
          <div className="filters">
            <div className="filter-group">
              <Calendar size={15} />
              <select
                aria-label="Período"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="all">Todo o período</option>
                <option value="today">Hoje</option>
                <option value="yesterday">Ontem</option>
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="month">Este mês</option>
                <option value="previous">Mês anterior</option>
                <option value="custom">Personalizado</option>
              </select>
              {period === "custom" && (
                <>
                  <input
                    type="date"
                    aria-label="Data inicial"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                  <input
                    type="date"
                    aria-label="Data final"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </>
              )}
            </div>
            {admin && (
              <select
                aria-label="Responsável"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              >
                <option value="">Todos os SDRs</option>
                {data.users
                  .filter((u) => u.role === "sdr")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            )}
            <select
              aria-label="Origem"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">Todas as origens</option>
              {Array.from(
                new Set([
                  ...sources,
                  "Meta Ads",
                  "Google Ads",
                  "Instagram",
                  "WhatsApp",
                  "Landing Page",
                  "Site",
                  "Indicação",
                  "Prospecção ativa",
                  "Outro",
                ]),
              ).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Campanha"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
            >
              <option value="">Todas as campanhas</option>
              {Array.from(
                new Set(data.leads.map((l) => l.campaign).filter(Boolean)),
              ).map((c) => (
                <option key={c} value={c!}>
                  {c}
                </option>
              ))}
            </select>
            <button
              className="subtle filters-reset"
              onClick={() => {
                setPeriod("all");
                setOwner("");
                setSource("");
                setCampaign("");
                setSearch("");
                setTemperature("");
                setStageFilter("");
              }}
            >
              Limpar filtros
            </button>
            <button
              aria-label="Atualizar"
              className="icon-button"
              onClick={load}
            >
              <RefreshCw size={15} />
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {tab === "Dashboard" && (
            <>
              <div className="stat-grid">
                {statCards.map(({ title, value, icon: Icon, color, sub }) => (
                  <section className="stat-card" key={title}>
                    <div>
                      <span>{title}</span>
                      <span className={`stat-icon ${color}`}>
                        <Icon size={18} />
                      </span>
                    </div>
                    <strong>{value.toLocaleString("pt-BR")}</strong>
                    <small>{sub}</small>
                  </section>
                ))}
              </div>
              <div className="secondary-stats">
                {[
                  { label: "Leads no mês", value: m.month },
                  { label: "Em atendimento", value: m.attending },
                  { label: "Propostas enviadas", value: m.proposals },
                  { label: "Leads perdidos", value: m.lost },
                  {
                    label: "Conversão",
                    value:
                      ((m.won / Math.max(1, m.total)) * 100).toFixed(1) + "%",
                  },
                  {
                    label: "1º atendimento",
                    value: Math.round(m.avg_contact) + " min",
                  },
                ].map((s) => (
                  <div key={s.label}>
                    <span>{s.label}</span>
                    <strong>{s.value}</strong>
                  </div>
                ))}
              </div>
              <div className="dashboard-charts">
                <section className="panel chart-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Entrada de leads</h3>
                      <p>Novas oportunidades nos últimos 7 dias</p>
                    </div>
                    <span className="chart-legend">
                      <i />
                      Leads recebidos
                    </span>
                  </div>
                  <div className="line-chart">
                    <svg
                      viewBox="0 0 650 225"
                      role="img"
                      aria-label={chart
                        .map((d) => `${d.label}: ${d.count} leads`)
                        .join(", ")}
                    >
                      <defs>
                        <linearGradient
                          id="chartFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#17a879"
                            stopOpacity=".19"
                          />
                          <stop
                            offset="100%"
                            stopColor="#17a879"
                            stopOpacity="0"
                          />
                        </linearGradient>
                      </defs>
                      {[0, 1, 2, 3].map((i) => (
                        <g key={i}>
                          <line
                            x1="40"
                            x2="620"
                            y1={55 + i * 42}
                            y2={55 + i * 42}
                            stroke="#edf0f3"
                            strokeDasharray="4 5"
                          />
                          <text x="10" y={59 + i * 42} className="chart-label">
                            {Math.round((max * (3 - i)) / 3)}
                          </text>
                        </g>
                      ))}
                      <polygon
                        points={`45,180 ${points} 591,180`}
                        fill="url(#chartFill)"
                      />
                      <polyline
                        points={points}
                        fill="none"
                        stroke="#18a878"
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                      />
                      {chart.map((d, i) => (
                        <g key={i}>
                          <circle
                            cx={45 + i * 91}
                            cy={180 - (d.count / max) * 125}
                            r="4"
                            fill="white"
                            stroke="#18a878"
                            strokeWidth="2"
                          />
                          <text
                            x={45 + i * 91}
                            y="210"
                            textAnchor="middle"
                            className="chart-label"
                          >
                            {d.label}
                          </text>
                        </g>
                      ))}
                    </svg>
                  </div>
                </section>
                <section className="panel funnel-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Seu funil, em resumo</h3>
                      <p>Do primeiro contato ao fechamento</p>
                    </div>
                    <Target size={18} className="muted" />
                  </div>
                  {[
                    { label: "Leads recebidos", n: m.total, color: "#a4decc" },
                    {
                      label: "Em atendimento",
                      n: m.attending,
                      color: "#71c7ae",
                    },
                    {
                      label: "Reuniões agendadas",
                      n: m.meetings,
                      color: "#45b594",
                    },
                    {
                      label: "Propostas enviadas",
                      n: m.proposals,
                      color: "#249c78",
                    },
                    { label: "Vendas realizadas", n: m.won, color: "#147957" },
                  ].map((s) => (
                    <div className="funnel-row" key={s.label}>
                      <span>{s.label}</span>
                      <strong>{s.n}</strong>
                      <div>
                        <i
                          style={{
                            width:
                              Math.max(3, (s.n / Math.max(m.total, 1)) * 100) +
                              "%",
                            background: s.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="conversion">
                    <span>Taxa de conversão</span>
                    <b>
                      {((m.won / Math.max(1, m.total)) * 100).toFixed(1)}%
                      <TrendingUp size={15} />
                    </b>
                  </div>
                </section>
              </div>
              <section className="panel team-performance">
                <div className="panel-heading">
                  <div>
                    <h3>Uma equipe. Muitas conquistas.</h3>
                    <p>Acompanhe a distribuição e o desempenho das SDRs</p>
                  </div>
                  <button
                    className="subtle"
                    onClick={() => setTab("Relatórios")}
                  >
                    Ver relatório
                    <ArrowUpRight size={14} />
                  </button>
                </div>
                <div className="performance-grid">
                  {data.comparison.map((u, i) => (
                    <div className="performance-card" key={u.id}>
                      <div className="performance-person">
                        <Avatar name={u.name} index={i + 1} />
                        <div>
                          <strong>{u.name}</strong>
                          <small>Sales Development Representative</small>
                        </div>
                        <span className="badge green">
                          {data.users.find((x) => x.id === u.id)
                            ?.availability === "available"
                            ? "Disponível"
                            : "Indisponível"}
                        </span>
                      </div>
                      <div className="performance-metrics">
                        {[
                          ["Recebidos", u.received],
                          ["Contatados", u.contacted],
                          ["Reuniões", u.meetings],
                          ["Vendas", u.won],
                        ].map(([label, n]) => (
                          <div key={label}>
                            <strong>{n}</strong>
                            <span>{label}</span>
                          </div>
                        ))}
                      </div>
                      <div className="performance-footer">
                        <span>
                          <Clock size={13} />
                          {Math.round(u.avg_contact)} min · 1º contato
                        </span>
                        <b>
                          {((u.won / Math.max(u.received, 1)) * 100).toFixed(1)}
                          % conversão
                        </b>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="fairness-note">
                  <ShieldCheck size={16} />
                  <span>
                    <strong>Distribuição justa, automaticamente.</strong> Apenas
                    SDRs ativos e disponíveis entram no rodízio. Nenhuma
                    oportunidade fica esquecida.
                  </span>
                </div>
              </section>
              <div className="bottom-grid">
                <section className="panel recent-leads">
                  <div className="panel-heading">
                    <div>
                      <h3>Leads mais recentes</h3>
                      <p>Novas conexões para a sua equipe</p>
                    </div>
                    <button className="subtle" onClick={() => setTab("Leads")}>
                      Ver todos
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <LeadTable rows={data.leads.slice(0, 5)} onOpen={openLead} />
                </section>
                <section className="panel next-actions">
                  <div className="panel-heading">
                    <div>
                      <h3>Não deixe para depois</h3>
                      <p>Seu próximo passo está aqui</p>
                    </div>
                    <Clock size={18} className="muted" />
                  </div>
                  <button onClick={() => setTab("Meu Dia")}>
                    <span className="action-icon amber">
                      <Phone size={16} />
                    </span>
                    <span>
                      <strong>{m.waiting} leads sem primeiro contato</strong>
                      <small>Uma boa conversa faz diferença</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                  <button onClick={() => setTab("Meu Dia")}>
                    <span className="action-icon red">
                      <Clock size={16} />
                    </span>
                    <span>
                      <strong>{overdue.length} follow-ups atrasados</strong>
                      <small>Retome as oportunidades</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                  <button onClick={() => setTab("Tarefas")}>
                    <span className="action-icon purple">
                      <CheckSquare size={16} />
                    </span>
                    <span>
                      <strong>
                        {data.tasks.filter((t) => !t.completed_at).length}{" "}
                        tarefas pendentes
                      </strong>
                      <small>Pequenas ações, grandes resultados</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                  <div className="contact-time">
                    <span>Tempo médio até 1º contato</span>
                    <strong>
                      {Math.round(m.avg_contact)} <small>min</small>
                    </strong>
                    <span>
                      SLA definido: {data.settings.sla_minutes} minutos
                    </span>
                  </div>
                </section>
              </div>
            </>
          )}
          {tab === "Leads" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>
                    Todos os leads <span className="count-chip">{m.total}</span>
                  </h3>
                  <p>Responsável, contexto e próxima ação em um só lugar</p>
                </div>
                <div className="inline">
                  {admin && (
                    <button
                      className="secondary"
                      onClick={() => newModal("csv")}
                    >
                      Importar CSV
                    </button>
                  )}
                  <a className="secondary" href="/api/csv">
                    Exportar CSV
                  </a>
                  <button
                    className="secondary"
                    onClick={() => newModal("filters")}
                  >
                    Filtros avançados
                  </button>
                  <select
                    aria-label="Etapa"
                    value={stageFilter}
                    onChange={(e) => setStageFilter(e.target.value)}
                  >
                    <option value="">Todas as etapas</option>
                    {data.stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Temperatura"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                  >
                    <option value="">Todas as temperaturas</option>
                    {Object.entries(tempLabel).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <LeadTable rows={leads} onOpen={openLead} />
              <div className="table-footer">
                {leads.length} leads exibidos · máximo de {data.listLimit} por
                consulta
              </div>
            </section>
          )}
          {tab === "Pipeline" && (
            <div className="kanban">
              {data.stages.map((s) => {
                const rows = leads.filter((l) => l.stage_id === s.id);
                return (
                  <section
                    className="kanban-column"
                    key={s.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const lead = leads.find(
                        (l) => l.id === e.dataTransfer.getData("text/plain"),
                      );
                      if (lead) changeStage(lead, s);
                    }}
                  >
                    <header>
                      <i className={s.kind} />
                      <h3>{s.name}</h3>
                      <span>{rows.length}</span>
                    </header>
                    <div className="column-value">
                      {money(
                        rows.reduce((n, l) => n + Number(l.potential_value), 0),
                      )}
                    </div>
                    {rows.map((l, i) => (
                      <article
                        draggable
                        onDragStart={(e) =>
                          e.dataTransfer.setData("text/plain", l.id)
                        }
                        className="kanban-card"
                        key={l.id}
                      >
                        <div className="inline justify">
                          <span className="badge neutral">{l.source}</span>
                          <GripVertical size={14} className="muted" />
                        </div>
                        <button
                          className="card-name"
                          onClick={() => openLead(l)}
                        >
                          {l.name}
                        </button>
                        <small>{l.company || l.email}</small>
                        <Temperature value={l.temperature} />
                        <strong className="card-value">
                          {money(l.potential_value)}
                        </strong>
                        <footer>
                          <span className="owner">
                            <Avatar name={l.owner || "Fila"} index={i} />
                            {l.owner?.split(" ")[0] || "Sem SDR"}
                          </span>
                          <button
                            aria-label="Mover etapa"
                            className="icon-button"
                            onClick={() => {
                              setSelected(l);
                              newModal("move");
                            }}
                          >
                            <MoveRight size={16} />
                          </button>
                        </footer>
                        {l.sla_breached && (
                          <span className="sla">
                            <AlertCircle size={12} />
                            SLA de contato vencido
                          </span>
                        )}
                      </article>
                    ))}
                    {!rows.length && (
                      <div className="kanban-empty">
                        Arraste uma oportunidade para cá
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
          {tab === "Meu Dia" && (
            <>
              <div className="day-banner">
                <Sun size={30} />
                <div>
                  <h3>Seu dia começa com uma boa conversa.</h3>
                  <p>
                    Priorize quem ainda espera por você. Depois, retome os
                    follow-ups.
                  </p>
                </div>
                <span>
                  {new Date().toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </span>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h3>1. Leads aguardando primeiro contato</h3>
                  <span className="count-chip">
                    {
                      data.leads.filter(
                        (l) => !l.first_contact_at && l.stage_kind === "open",
                      ).length
                    }
                  </span>
                </div>
                <LeadTable
                  rows={data.leads
                    .filter(
                      (l) => !l.first_contact_at && l.stage_kind === "open",
                    )
                    .sort((a, b) => a.created_at.localeCompare(b.created_at))}
                  onOpen={openLead}
                />
              </section>
              <section className="panel spaced">
                <div className="panel-heading">
                  <h3>2. Follow-ups atrasados e de hoje</h3>
                  <Clock size={18} />
                </div>
                {data.followups
                  .filter(
                    (f) =>
                      new Date(f.due_at).toDateString() ===
                        new Date().toDateString() ||
                      new Date(f.due_at) < new Date(),
                  )
                  .map((f) => (
                    <div className="list-row" key={f.id}>
                      <span
                        className={
                          new Date(f.due_at) < new Date() ? "sla" : "muted"
                        }
                      >
                        <Clock size={16} />
                      </span>
                      <div>
                        <strong>{f.lead_name}</strong>
                        <small>{date(f.due_at)}</small>
                      </div>
                      <button
                        className="secondary"
                        onClick={async () => {
                          try {
                            await mutate(
                              "/api/tasks",
                              "PATCH",
                              { id: f.id, kind: "followups" },
                              "Follow-up concluído",
                            );
                          } catch {
                            /* A falha já é exibida ao usuário por mutate(). */
                          }
                        }}
                      >
                        <Check size={14} />
                        Concluir
                      </button>
                    </div>
                  ))}
                {!data.followups.length && (
                  <p className="empty">Nenhum follow-up pendente.</p>
                )}
              </section>
            </>
          )}
          {tab === "Meu Dia" && (
            <section className="panel spaced">
              <div className="panel-heading">
                <h3>3. Tarefas de hoje e atrasadas</h3>
                <CheckSquare size={18} />
              </div>
              {data.tasks
                .filter(
                  (t) =>
                    !t.completed_at &&
                    (new Date(t.due_at).toDateString() ===
                      new Date().toDateString() ||
                      new Date(t.due_at) < new Date()),
                )
                .map((t) => (
                  <div className="list-row" key={t.id}>
                    <CheckSquare size={17} />
                    <div>
                      <strong>{t.title}</strong>
                      <small>
                        {t.lead_name} · {date(t.due_at)}
                      </small>
                    </div>
                    <button
                      className="secondary"
                      onClick={async () => {
                        try {
                          await mutate("/api/tasks", "PATCH", {
                            id: t.id,
                            kind: "tasks",
                          });
                        } catch {
                          /* A falha já é exibida ao usuário por mutate(). */
                        }
                      }}
                    >
                      Concluir
                    </button>
                  </div>
                ))}
            </section>
          )}
          {tab === "Meu Dia" && (
            <section className="panel spaced">
              <div className="panel-heading">
                <h3>4. Conversas aguardando resposta e reuniões de hoje</h3>
              </div>
              {data.conversations
                .filter((c) => c.awaiting_reply)
                .map((c) => (
                  <div className="list-row" key={c.id}>
                    <MessageCircle size={17} />
                    <div>
                      <strong>{c.lead_name}</strong>
                      <small>
                        {c.channel}
                        {c.demo ? " · Demonstração" : ""}
                      </small>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => setTab("Conversas")}
                    >
                      Ver conversa
                    </button>
                  </div>
                ))}
              {data.meetings
                .filter(
                  (m) =>
                    new Date(m.starts_at).toDateString() ===
                    new Date().toDateString(),
                )
                .map((m) => (
                  <div className="list-row" key={m.id}>
                    <CalendarDays size={17} />
                    <div>
                      <strong>{m.title}</strong>
                      <small>
                        {m.lead_name} · {date(m.starts_at)}
                      </small>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => setTab("Agenda")}
                    >
                      Ver agenda
                    </button>
                  </div>
                ))}
            </section>
          )}
          {tab === "Tarefas" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Próximas ações</h3>
                  <p>As tarefas acompanham o responsável pelo lead</p>
                </div>
                <button className="primary" onClick={() => newModal("task")}>
                  <Plus size={16} />
                  Criar tarefa
                </button>
              </div>
              {data.tasks.map((t) => (
                <div className="list-row" key={t.id}>
                  <button
                    className={"task-check " + (t.completed_at ? "done" : "")}
                    aria-label="Concluir tarefa"
                    disabled={!!t.completed_at || busy}
                    onClick={async () => {
                      try {
                        await mutate("/api/tasks", "PATCH", {
                          id: t.id,
                          kind: "tasks",
                        });
                      } catch {
                        /* A falha já é exibida ao usuário por mutate(). */
                      }
                    }}
                  >
                    {t.completed_at && <Check size={14} />}
                  </button>
                  <div>
                    <strong>{t.title}</strong>
                    <small>
                      {t.lead_name} · {date(t.due_at)}
                    </small>
                  </div>
                  <span
                    className={
                      "badge " +
                      (t.completed_at
                        ? "green"
                        : new Date(t.due_at) < new Date()
                          ? "red"
                          : "neutral")
                    }
                  >
                    {t.completed_at
                      ? "Concluída"
                      : new Date(t.due_at) < new Date()
                        ? "Atrasada"
                        : "Pendente"}
                  </span>
                  <span className="muted">
                    {t.priority === "high"
                      ? "Alta"
                      : t.priority === "low"
                        ? "Baixa"
                        : "Normal"}
                  </span>
                </div>
              ))}
              {!data.tasks.length && (
                <div className="empty">
                  <CheckSquare size={28} />
                  <h3>Espaço para o próximo passo</h3>
                  <p>Crie uma tarefa relacionada a um lead.</p>
                </div>
              )}
            </section>
          )}
          {tab === "Equipe" && admin && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Quem faz acontecer</h3>
                  <p>Disponibilidade e participação no rodízio</p>
                </div>
                <button className="primary" onClick={() => newModal("user")}>
                  <UserPlus size={16} />
                  Convidar pessoa
                </button>
              </div>
              {data.users.map((u, i) => (
                <div className="team-row" key={u.id}>
                  <Avatar name={u.name} index={i} />
                  <div>
                    <strong>{u.name}</strong>
                    <small>
                      {u.email} · {u.role === "sdr" ? "SDR" : "Administrador"}
                    </small>
                  </div>
                  {u.role === "sdr" && (
                    <>
                      <select
                        aria-label={`Disponibilidade de ${u.name}`}
                        value={u.availability}
                        disabled={busy}
                        onChange={async (e) => {
                          try {
                            await mutate("/api/team", "PATCH", {
                              id: u.id,
                              availability: e.target.value,
                              active: u.active,
                              rotation_enabled: u.rotation_enabled,
                            });
                          } catch {
                            /* A falha já é exibida ao usuário por mutate(). */
                          }
                        }}
                      >
                        <option value="available">Disponível</option>
                        <option value="unavailable">Indisponível</option>
                        <option value="leave">Férias / Afastamento</option>
                      </select>
                      <label className="toggle-label">
                        <input
                          type="checkbox"
                          checked={u.rotation_enabled}
                          disabled={busy}
                          onChange={async (e) => {
                            try {
                              await mutate("/api/team", "PATCH", {
                                id: u.id,
                                availability: u.availability,
                                active: u.active,
                                rotation_enabled: e.target.checked,
                              });
                            } catch {
                              /* A falha já é exibida ao usuário por mutate(). */
                            }
                          }}
                        />
                        No rodízio
                      </label>
                      <label className="toggle-label">
                        <input
                          type="checkbox"
                          checked={u.active}
                          disabled={busy}
                          onChange={async (e) => {
                            try {
                              await mutate("/api/team", "PATCH", {
                                id: u.id,
                                availability: u.availability,
                                active: e.target.checked,
                                rotation_enabled: u.rotation_enabled,
                              });
                            } catch {
                              /* A falha já é exibida ao usuário por mutate(). */
                            }
                          }}
                        />
                        Ativo
                      </label>
                    </>
                  )}
                </div>
              ))}
              <div className="fairness-note">
                <ShieldCheck size={18} />
                <span>
                  A disponibilidade é persistida. Ao reativar uma SDR, a fila de
                  leads aguardando distribuição é processada automaticamente.
                </span>
              </div>
            </section>
          )}
          {tab === "Configurações" && admin && (
            <section className="panel settings-panel">
              <div className="panel-heading">
                <div>
                  <h3>Velocidade que vira oportunidade</h3>
                  <p>Defina o prazo máximo para o primeiro contato</p>
                </div>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  try {
                    await mutate("/api/settings", "PATCH", {
                      sla_minutes: Number(f.get("sla")),
                    });
                  } catch {
                    /* A falha já é exibida ao usuário por mutate(). */
                  }
                }}
              >
                <label>
                  SLA de atendimento (minutos)
                  <input
                    type="number"
                    name="sla"
                    min={1}
                    max={1440}
                    defaultValue={data.settings.sla_minutes}
                    required
                  />
                </label>
                <p>
                  Leads sem tentativa de contato após esse prazo recebem um
                  alerta no dashboard, na lista e no pipeline.
                </p>
                <button className="primary" disabled={busy}>
                  Salvar configuração
                </button>
              </form>
              <div className="panel-heading">
                <div>
                  <h3>Etiquetas da equipe</h3>
                  <p>Classifique oportunidades sem perder contexto</p>
                </div>
                <button className="secondary" onClick={() => newModal("tag")}>
                  Nova etiqueta
                </button>
              </div>
              <div className="settings-tags">
                {data.tags.map((t) => (
                  <span className="badge neutral" key={t.id}>
                    {t.name}
                  </span>
                ))}
              </div>
              <div className="panel-heading">
                <h3>Regras de score</h3>
              </div>
              {data.scoreRules.map((r) => (
                <form
                  className="score-rule"
                  key={r.event}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await mutate("/api/operations", "POST", {
                        action: "score.rule",
                        event: r.event,
                        points: Number(
                          new FormData(e.currentTarget).get("points"),
                        ),
                      });
                    } catch {
                      /* A falha já é exibida ao usuário por mutate(). */
                    }
                  }}
                >
                  <label>
                    {
                      (
                        {
                          reply: "Lead respondeu",
                          meeting: "Reunião solicitada/agendada",
                          high_intent: "Alta intenção",
                          no_response: "Sem resposta",
                        } as Record<string, string>
                      )[r.event]
                    }
                    <input
                      name="points"
                      type="number"
                      min={-100}
                      max={100}
                      defaultValue={r.points}
                      required
                    />
                  </label>
                  <button className="secondary" disabled={busy}>
                    Salvar
                  </button>
                </form>
              ))}
              <div className="panel-heading">
                <div>
                  <h3>Etapas do pipeline</h3>
                  <p>
                    Reorganize etapas sem perder o histórico das oportunidades
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => newModal("pipelineNew")}
                >
                  <Plus size={14} />
                  Nova etapa
                </button>
              </div>
              {data.stages.map((s, i) => (
                <div className="list-row pipeline-setting" key={s.id}>
                  <span className="count-chip">{i + 1}</span>
                  <strong>{s.name}</strong>
                  <span className="muted">
                    {s.kind === "won"
                      ? "Ganho"
                      : s.kind === "lost"
                        ? "Perda"
                        : "Aberta"}
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`Mover ${s.name} para cima`}
                    disabled={i === 0 || busy}
                    onClick={async () => {
                      const ids = data.stages.map((s) => s.id);
                      [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                      try {
                        await mutate("/api/pipeline", "POST", {
                          action: "reorder",
                          ids,
                        });
                      } catch {
                        /* A falha já é exibida ao usuário por mutate(). */
                      }
                    }}
                  >
                    ↑
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Mover ${s.name} para baixo`}
                    disabled={i === data.stages.length - 1 || busy}
                    onClick={async () => {
                      const ids = data.stages.map((s) => s.id);
                      [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
                      try {
                        await mutate("/api/pipeline", "POST", {
                          action: "reorder",
                          ids,
                        });
                      } catch {
                        /* A falha já é exibida ao usuário por mutate(). */
                      }
                    }}
                  >
                    ↓
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setTargetStage(s);
                      newModal("pipelineEdit");
                    }}
                  >
                    Editar
                  </button>
                  {s.kind === "open" && (
                    <button
                      className="icon-button"
                      aria-label={`Excluir ${s.name}`}
                      onClick={() => {
                        setTargetStage(s);
                        newModal("pipelineDelete");
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              <div className="fairness-note">
                <ShieldCheck size={18} />
                <span>
                  Ações importantes são auditadas no banco. Contatos e histórico
                  permanecem restritos ao administrador ou à SDR responsável.
                </span>
              </div>
            </section>
          )}
          {tab === "Relatórios" && <Reports data={data} />}
          {tab === "Agenda" && (
            <Agenda data={data} refresh={load} notify={setToast} />
          )}
          {tab === "Prospecção" && (
            <Prospection data={data} refresh={load} notify={setToast} />
          )}
          {tab === "Conversas" && (
            <Conversations data={data} refresh={load} notify={setToast} />
          )}
          {tab === "Integrações" && (
            <>
              <div className="phase-banner">
                <Plug size={22} />
                <div>
                  <strong>
                    {tab === "Integrações"
                      ? "Conexões oficiais, no seu tempo."
                      : "Módulo reservado para a Fase 2"}
                  </strong>
                  <p>
                    As integrações externas ainda não estão conectadas. Nenhuma
                    mensagem é recebida ou enviada por estes módulos.
                  </p>
                </div>
              </div>
              <div className="integration-grid">
                {data.integrations.map((p, i) => (
                  <section className="panel integration-card" key={p.id}>
                    <span className={`integration-icon a${i % 3}`}>
                      {p.provider === "WhatsApp" ? (
                        <MessageCircle />
                      ) : p.provider === "Google Calendar" ? (
                        <CalendarDays />
                      ) : (
                        <Plug />
                      )}
                    </span>
                    <span className="badge neutral">Não conectado</span>
                    <h3>{p.provider}</h3>
                    <p>
                      {p.provider === "Formulários/Webhooks"
                        ? "Endpoint de leads com HMAC, deduplicação e idempotência disponível no backend."
                        : "Adapter reservado para integração oficial. Requer configuração e credenciais externas."}
                    </p>
                    <small>
                      Última sincronização:{" "}
                      {p.last_sync_at ? date(p.last_sync_at) : "nenhuma"}
                    </small>
                    <button
                      className="secondary"
                      onClick={() => newModal("integration")}
                    >
                      Ver requisitos
                      <ArrowUpRight size={14} />
                    </button>
                  </section>
                ))}
              </div>
            </>
          )}
          <footer className="page-footer">
            <span>
              NextGen CRM <span>·</span> Feito para o próximo passo.
            </span>
            <span>NextDim · Comercial</span>
          </footer>
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <AlertCircle size={17} />
          {toast}
          <button aria-label="Fechar aviso" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal === "filters" && (
        <Modal title="Filtros avançados de leads" close={() => setModal("")}>
          <label>
            Etiqueta
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            >
              <option value="">Todas as etiquetas</option>
              {data.tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              Último contato a partir de
              <input
                type="date"
                value={lastAfter}
                onChange={(e) => setLastAfter(e.target.value)}
              />
            </label>
            <label>
              Último contato até
              <input
                type="date"
                value={lastBefore}
                onChange={(e) => setLastBefore(e.target.value)}
              />
            </label>
            <label>
              Follow-up a partir de
              <input
                type="date"
                value={followupAfter}
                onChange={(e) => setFollowupAfter(e.target.value)}
              />
            </label>
            <label>
              Follow-up até
              <input
                type="date"
                value={followupBefore}
                onChange={(e) => setFollowupBefore(e.target.value)}
              />
            </label>
          </div>
          <p className="form-hint">
            Os filtros são combinados no banco. Registros sem contato ou
            follow-up não entram em intervalos dessas datas.
          </p>
          <button className="primary" onClick={() => setModal("")}>
            Aplicar filtros
          </button>
        </Modal>
      )}
      {modal === "csv" && (
        <CsvImport
          close={() => setModal("")}
          refresh={load}
          notify={setToast}
        />
      )}
      {modal === "newLead" && (
        <Modal title="Uma nova oportunidade" close={() => setModal("")}>
          <p className="modal-subtitle">
            O responsável será definido automaticamente pelo Round Robin.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                const r = await mutate(
                  "/api/leads",
                  "POST",
                  Object.fromEntries(f),
                  "",
                );
                setModal("");
                setToast(
                  r.duplicate
                    ? "Contato já existente: nova entrada registrada no histórico."
                    : r.owner_id
                      ? "Lead criado e distribuído automaticamente."
                      : "Lead criado na fila de distribuição.",
                );
              } catch {
                /* A falha já é exibida ao usuário por mutate(). */
              }
            }}
          >
            <div className="form-grid">
              <label className="wide">
                Nome completo
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={150}
                  placeholder="Como podemos chamar esse lead?"
                />
              </label>
              <label>
                Telefone / WhatsApp
                <input name="phone" placeholder="(11) 99999-9999" />
              </label>
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  placeholder="contato@empresa.com"
                />
              </label>
              <label>
                Instagram
                <input name="instagram" placeholder="@perfil" />
              </label>
              <label>
                Empresa
                <input name="company" placeholder="Nome da empresa" />
              </label>
              <label>
                Origem
                <select name="source">
                  {[
                    "Cadastro manual",
                    "Meta Ads",
                    "Google Ads",
                    "Instagram",
                    "WhatsApp",
                    "Landing Page",
                    "Site",
                    "Indicação",
                    "Prospecção ativa",
                    "Outro",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Campanha
                <input name="campaign" placeholder="Opcional" />
              </label>
            </div>
            <div className="form-hint">
              <ShieldCheck size={16} />
              Telefone, e-mail e Instagram são verificados para evitar
              duplicidades.
            </div>
            <button className="primary" disabled={busy}>
              <Plus size={16} />
              {busy ? "Criando…" : "Criar e distribuir lead"}
            </button>
          </form>
        </Modal>
      )}
      {modal === "editLead" && selected && (
        <Modal title="Editar oportunidade" close={() => setModal("lead")}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await action({
                  action: "update",
                  ...Object.fromEntries(f),
                  potential_value: Number(f.get("potential_value")),
                });
              } catch {
                /* A falha já é exibida ao usuário por mutate(). */
              }
            }}
          >
            <div className="form-grid">
              {[
                { key: "name", label: "Nome", v: selected.name },
                { key: "phone", label: "Telefone", v: selected.phone },
                { key: "email", label: "E-mail", v: selected.email },
                { key: "instagram", label: "Instagram", v: selected.instagram },
                { key: "company", label: "Empresa", v: selected.company },
                { key: "job_title", label: "Cargo", v: selected.job_title },
                { key: "city", label: "Cidade", v: selected.city },
                { key: "state", label: "Estado", v: selected.state },
              ].map((f) => (
                <label key={f.key}>
                  {f.label}
                  <input
                    name={f.key}
                    defaultValue={f.v || ""}
                    required={f.key === "name"}
                    type={f.key === "email" ? "email" : "text"}
                  />
                </label>
              ))}
              <label>
                Valor potencial (R$)
                <input
                  name="potential_value"
                  type="number"
                  min="0"
                  step="0.01"
                  max="1000000000000"
                  defaultValue={selected.potential_value}
                  required
                />
              </label>
            </div>
            <label>
              Notas
              <textarea
                name="notes"
                defaultValue={selected.notes || ""}
                maxLength={5000}
              />
            </label>
            <button className="primary" disabled={busy}>
              Salvar dados do lead
            </button>
          </form>
        </Modal>
      )}
      {modal === "lead" && selected && (
        <Modal title={selected.name} close={() => setModal("")}>
          <div className="lead-meta">
            <Status lead={selected} />
            <Temperature value={selected.temperature} />
          </div>
          <div className="detail-grid">
            <div>
              <small>Responsável</small>
              <strong>{selected.owner || "Aguardando distribuição"}</strong>
            </div>
            <div>
              <small>Origem</small>
              <strong>{selected.source}</strong>
            </div>
            <div>
              <small>Telefone / WhatsApp</small>
              <strong>{selected.phone || "—"}</strong>
            </div>
            <div>
              <small>E-mail</small>
              <strong>{selected.email || "—"}</strong>
            </div>
            <div>
              <small>Instagram</small>
              <strong>
                {selected.instagram ? "@" + selected.instagram : "—"}
              </strong>
            </div>
            <div>
              <small>Empresa / Cargo</small>
              <strong>
                {selected.company || "—"}
                {selected.job_title ? " · " + selected.job_title : ""}
              </strong>
            </div>
            <div>
              <small>Cidade / Estado</small>
              <strong>
                {selected.city || "—"} / {selected.state || "—"}
              </strong>
            </div>
            <div>
              <small>Entrada</small>
              <strong>{date(selected.created_at)}</strong>
            </div>
            <div>
              <small>Primeiro contato</small>
              <strong>{date(selected.first_contact_at)}</strong>
            </div>
            <div>
              <small>Último contato</small>
              <strong>{date(selected.last_contact_at)}</strong>
            </div>
            <div>
              <small>Próximo follow-up</small>
              <strong>{date(selected.next_followup)}</strong>
            </div>
            <div>
              <small>Campanha</small>
              <strong>{selected.campaign || "—"}</strong>
            </div>
            <div>
              <small>Valor potencial</small>
              <strong>{money(selected.potential_value)}</strong>
            </div>
          </div>
          <div className="individual-sla">
            <Clock size={14} />
            {selected.first_contact_at
              ? `Primeiro atendimento em ${Math.max(0, Math.round((new Date(selected.first_contact_at).getTime() - new Date(selected.created_at).getTime()) / 60000))} min`
              : "Aguardando primeiro contato"}{" "}
            · SLA de {data.settings.sla_minutes} min
          </div>
          {selected.notes && <p className="lead-notes">{selected.notes}</p>}
          <div className="detail-actions">
            <button className="secondary" onClick={() => setModal("editLead")}>
              Editar dados
            </button>
            <button className="primary" onClick={() => setModal("contact")}>
              <Phone size={15} />
              Registrar contato
            </button>
            <button className="secondary" onClick={() => setModal("followup")}>
              <Clock size={15} />
              Follow-up
            </button>
            <button className="secondary" onClick={() => setModal("move")}>
              <MoveRight size={15} />
              Mover etapa
            </button>
            <button className="secondary" onClick={() => setModal("note")}>
              Nota
            </button>
            {admin && (
              <button className="secondary" onClick={() => setModal("assign")}>
                Redistribuir
              </button>
            )}
            <select
              aria-label="Alterar temperatura"
              value={selected.temperature}
              onChange={async (e) => {
                try {
                  await action({
                    action: "temperature",
                    temperature: e.target.value,
                  });
                } catch {
                  /* A falha já é exibida ao usuário por mutate(). */
                }
              }}
            >
              {Object.entries(tempLabel).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="lead-tags">
            <h3>Etiquetas</h3>
            <div>
              {data.tags.map((t) => (
                <label key={t.id}>
                  <input
                    type="checkbox"
                    checked={data.leadTags.some(
                      (x) => x.lead_id === selected.id && x.tag_id === t.id,
                    )}
                    disabled={busy}
                    onChange={async (e) => {
                      try {
                        await mutate("/api/operations", "POST", {
                          action: "tag.assign",
                          lead_id: selected.id,
                          tag_id: t.id,
                          remove: !e.target.checked,
                        });
                      } catch {
                        /* A falha já é exibida ao usuário por mutate(). */
                      }
                    }}
                  />
                  {t.name}
                </label>
              ))}
            </div>
          </div>
          <div className="score-controls">
            <span>
              Score do lead: <strong>{selected.score}</strong>
            </span>
            <select
              aria-label="Registrar evento de score"
              defaultValue=""
              onChange={async (e) => {
                if (e.target.value) {
                  try {
                    await mutate("/api/operations", "POST", {
                      action: "score",
                      lead_id: selected.id,
                      event: e.target.value,
                    });
                    setModal("");
                  } catch {
                    /* A falha já é exibida ao usuário por mutate(). */
                  }
                }
              }}
            >
              <option value="">Registrar sinal</option>
              <option value="reply">Lead respondeu</option>
              <option value="high_intent">Alta intenção</option>
              <option value="no_response">Sem resposta por dias</option>
            </select>
          </div>
          <h3 className="timeline-heading">Histórico da oportunidade</h3>
          <div className="timeline">
            {timeline.map((t) => (
              <div key={t.id}>
                <span
                  className={
                    "timeline-dot " + (t.type === "assignment" ? "purple" : "")
                  }
                />
                <div>
                  <strong>{t.description}</strong>
                  <small>
                    {date(t.created_at)} · {t.actor || "Sistema"}
                  </small>
                </div>
              </div>
            ))}
            {!timeline.length && <p>Carregando histórico…</p>}
          </div>
        </Modal>
      )}
      {["contact", "note"].includes(modal) && selected && (
        <Modal
          title={
            modal === "contact"
              ? "Registrar tentativa de contato"
              : "Adicionar nota"
          }
          close={() => setModal("lead")}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const note = new FormData(e.currentTarget).get("note");
              try {
                await action({ action: modal, note });
              } catch {
                /* A falha já é exibida ao usuário por mutate(). */
              }
            }}
          >
            <label>
              {modal === "contact"
                ? "Como foi o contato?"
                : "O que precisamos saber?"}
              <textarea
                name="note"
                required
                maxLength={3000}
                placeholder="Registre o canal, o contexto e o próximo passo…"
              />
            </label>
            <p className="form-hint">
              {modal === "contact"
                ? "O primeiro contato e o último contato serão registrados agora."
                : "Esta nota será preservada na timeline."}
            </p>
            <button className="primary" disabled={busy}>
              Salvar no histórico
            </button>
          </form>
        </Modal>
      )}
      {modal === "followup" && selected && (
        <Modal title="O próximo contato importa" close={() => setModal("lead")}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const due = new FormData(e.currentTarget).get("due") as string;
              try {
                await action({
                  action: "followup",
                  due_at: new Date(due).toISOString(),
                });
              } catch {
                /* A falha já é exibida ao usuário por mutate(). */
              }
            }}
          >
            <label>
              Quando devemos retomar?
              <input
                type="datetime-local"
                name="due"
                required
                value={followupDate}
                onChange={(e) => setFollowupDate(e.target.value)}
              />
            </label>
            <div className="followup-presets">
              {[
                { days: 0, label: "Hoje" },
                { days: 1, label: "Amanhã" },
                { days: 2, label: "Em 2 dias" },
                { days: 3, label: "Em 3 dias" },
                { days: 7, label: "Em 7 dias" },
              ].map((p) => (
                <button
                  type="button"
                  className="secondary"
                  key={p.days}
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + p.days);
                    setFollowupDate(
                      new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                        .toISOString()
                        .slice(0, 16),
                    );
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="form-hint">
              O follow-up anterior pendente será concluído e o novo ficará no
              Meu Dia.
            </p>
            <button className="primary" disabled={busy}>
              Agendar follow-up
            </button>
          </form>
        </Modal>
      )}
      {modal === "move" && selected && (
        <Modal title="Próximo passo no pipeline" close={() => setModal("lead")}>
          <div className="stage-options">
            {data.stages.map((s) => (
              <button
                key={s.id}
                className="secondary"
                disabled={s.id === selected.stage_id || busy}
                onClick={() => {
                  setModal("");
                  changeStage(selected, s);
                }}
              >
                {s.name}
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {modal === "stage" && targetStage && selected && (
        <Modal
          title={
            targetStage.kind === "won"
              ? "Mais uma conquista!"
              : "Registrar motivo de perda"
          }
          close={() => setModal("")}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const v =
                targetStage.kind === "won"
                  ? {
                      amount: Number(f.get("amount")),
                      service: f.get("service"),
                      closed_at: new Date(
                        f.get("closed_at") as string,
                      ).toISOString(),
                    }
                  : { reason: f.get("reason"), notes: f.get("notes") };
              try {
                await action({
                  action: "stage",
                  stage_id: targetStage.id,
                  ...v,
                });
              } catch {
                /* A falha já é exibida ao usuário por mutate(). */
              }
            }}
          >
            {targetStage.kind === "won" ? (
              <>
                <label>
                  Valor vendido (R$)
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="1000000000000"
                    name="amount"
                    required
                  />
                </label>
                <label>
                  Produto / Serviço
                  <input name="service" required />
                </label>
                <label>
                  Data do fechamento
                  <input
                    type="datetime-local"
                    name="closed_at"
                    required
                    defaultValue={new Date(
                      renderTime -
                        new Date(renderTime).getTimezoneOffset() * 60000,
                    )
                      .toISOString()
                      .slice(0, 16)}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Motivo
                  <select name="reason">
                    {[
                      "Sem resposta",
                      "Sem interesse",
                      "Preço",
                      "Já possui agência",
                      "Não é o momento",
                      "Não qualificado",
                      "Concorrente",
                      "Outro",
                    ].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Observação adicional
                  <textarea name="notes" />
                </label>
              </>
            )}
            <button className="primary" disabled={busy}>
              Confirmar e registrar
            </button>
          </form>
        </Modal>
      )}
      {modal === "assign" && selected && admin && (
        <Modal title="Redistribuir oportunidade" close={() => setModal("lead")}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await action({
                  action: "assign",
                  owner_id: new FormData(e.currentTarget).get("owner"),
                });
              } catch {
                /* A falha já é exibida ao usuário por mutate(). */
              }
            }}
          >
            <p className="modal-subtitle">
              Responsável atual: {selected.owner || "nenhum"}. A alteração
              ficará registrada no histórico.
            </p>
            <label>
              Novo responsável
              <select name="owner" required>
                {data.users
                  .filter((u) => u.role === "sdr" && u.active)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </label>
            <button className="primary" disabled={busy}>
              Confirmar redistribuição
            </button>
          </form>
        </Modal>
      )}
      {modal === "task" && (
        <Modal title="Um próximo passo bem definido" close={() => setModal("")}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await mutate("/api/tasks", "POST", {
                  title: f.get("title"),
                  description: f.get("description"),
                  lead_id: f.get("lead_id"),
                  due_at: new Date(f.get("due") as string).toISOString(),
                  priority: f.get("priority"),
                });
                setModal("");
              } catch {
                /* A falha já é exibida ao usuário por mutate(). */
              }
            }}
          >
            <label>
              Título
              <input
                name="title"
                required
                maxLength={200}
                placeholder="Ex.: Enviar apresentação"
              />
            </label>
            <label>
              Lead relacionado
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
            <label>
              Descrição
              <textarea name="description" />
            </label>
            <div className="form-grid">
              <label>
                Data e horário
                <input type="datetime-local" name="due" required />
              </label>
              <label>
                Prioridade
                <select name="priority">
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="low">Baixa</option>
                </select>
              </label>
            </div>
            <button className="primary" disabled={busy}>
              Criar tarefa
            </button>
          </form>
        </Modal>
      )}
      {modal === "tag" && (
        <Modal title="Nova etiqueta" close={() => setModal("")}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await mutate("/api/operations", "POST", {
                  action: "tag.create",
                  name: new FormData(e.currentTarget).get("name"),
                });
                setModal("");
              } catch {
                /* A falha já é exibida ao usuário por mutate(). */
              }
            }}
          >
            <label>
              Nome
              <input name="name" required minLength={2} maxLength={50} />
            </label>
            <button className="primary" disabled={busy}>
              Criar etiqueta
            </button>
          </form>
        </Modal>
      )}
      {modal === "user" && admin && (
        <Modal
          title="Mais pessoas, mais possibilidades"
          close={() => setModal("")}
        >
          {invite ? (
            <div className="invite-result">
              <ShieldCheck size={30} />
              <h3>Convite criado</h3>
              <p>
                Envie este link por um canal seguro. Expira em 24 horas e só
                pode ser usado uma vez.
              </p>
              <input readOnly value={invite} />
              <button
                className="primary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(invite);
                    setToast("Convite copiado");
                  } catch {
                    setToast("Selecione o link para copiar manualmente");
                  }
                }}
              >
                Copiar convite
              </button>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const r = await mutate(
                    "/api/team",
                    "POST",
                    Object.fromEntries(new FormData(e.currentTarget)),
                    "Pessoa adicionada à equipe",
                  );
                  setInvite(r.invite);
                } catch {
                  /* A falha já é exibida ao usuário por mutate(). */
                }
              }}
            >
              <label>
                Nome
                <input name="name" required minLength={2} />
              </label>
              <label>
                E-mail
                <input name="email" type="email" required />
              </label>
              <label>
                Perfil
                <select name="role">
                  <option value="sdr">SDR</option>
                  <option value="admin">Administrador</option>
                </select>
              </label>
              <p className="form-hint">
                A pessoa define sua própria senha através do convite.
              </p>
              <button className="primary" disabled={busy}>
                Criar convite seguro
              </button>
            </form>
          )}
        </Modal>
      )}
      {["pipelineNew", "pipelineEdit", "pipelineDelete"].includes(modal) && (
        <Modal
          title={
            modal === "pipelineNew"
              ? "Nova etapa"
              : modal === "pipelineEdit"
                ? "Renomear etapa"
                : "Excluir etapa"
          }
          close={() => setModal("")}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await mutate(
                  "/api/pipeline",
                  "POST",
                  modal === "pipelineNew"
                    ? { action: "create", name: f.get("name") }
                    : modal === "pipelineEdit"
                      ? {
                          action: "rename",
                          id: targetStage?.id,
                          name: f.get("name"),
                        }
                      : { action: "delete", id: targetStage?.id },
                );
                setModal("");
              } catch {
                /* A falha já é exibida ao usuário por mutate(). */
              }
            }}
          >
            {modal === "pipelineDelete" ? (
              <p className="modal-subtitle">
                Excluir “{targetStage?.name}”? Etapas com leads ou histórico são
                protegidas e não podem ser excluídas.
              </p>
            ) : (
              <label>
                Nome da etapa
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={80}
                  defaultValue={
                    modal === "pipelineEdit" ? targetStage?.name : ""
                  }
                />
              </label>
            )}
            <button className="primary" disabled={busy}>
              {modal === "pipelineDelete" ? "Excluir etapa" : "Salvar etapa"}
            </button>
          </form>
        </Modal>
      )}
      {modal === "integration" && (
        <Modal title="Configuração de integrações" close={() => setModal("")}>
          <div className="integration-info">
            <p>
              Meta Ads, WhatsApp e Instagram exigem aplicativo Meta, ativos
              empresariais, permissões e aprovação das APIs oficiais. A conexão
              real será implementada na Fase 2.
            </p>
            <p>
              O webhook genérico já está disponível em{" "}
              <code>POST /api/webhooks/leads</code>. Usa HMAC SHA-256,
              timestamp, chave de idempotência e limite de 60 chamadas/minuto.
            </p>
            <p>
              Configure <code>WEBHOOK_SECRET</code> exclusivamente no servidor e
              consulte o README para assinar requisições. Nenhum token deve ser
              inserido no frontend.
            </p>
            <p>Google Calendar será conectado por OAuth na Fase 3.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
