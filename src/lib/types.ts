export type Lead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  company: string | null;
  job_title: string | null;
  city: string | null;
  state: string | null;
  owner_id: string | null;
  owner: string | null;
  stage_id: string;
  stage: string;
  stage_kind: string;
  stage_position: number;
  source: string;
  campaign: string | null;
  temperature: string;
  potential_value: string;
  created_at: string;
  first_contact_at: string | null;
  last_contact_at: string | null;
  next_followup: string | null;
  sla_breached: boolean;
  notes: string | null;
  score: number;
};
export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  availability: string;
  active: boolean;
  rotation_enabled: boolean;
};
export type Stage = {
  id: string;
  name: string;
  position: number;
  kind: string;
};
export type Task = {
  id: string;
  title: string;
  lead_id: string;
  lead_name: string;
  due_at: string;
  priority: string;
  completed_at: string | null;
};
export type Followup = {
  id: string;
  lead_id: string;
  lead_name: string;
  due_at: string;
};
export type Comparison = {
  id: string;
  name: string;
  received: number;
  contacted: number;
  meetings: number;
  won: number;
  avg_contact: number;
};
export type CRMData = OperationsData & {
  daily: { day: string; count: number }[];
  reports: {
    bySource: Breakdown[];
    byCampaign: Breakdown[];
    byStage: Breakdown[];
    losses: { label: string; leads: number }[];
  };
  actor: { id: string; name: string; role: string };
  leads: Lead[];
  users: User[];
  stages: Stage[];
  tasks: Task[];
  followups: Followup[];
  metrics: {
    total: number;
    today: number;
    month: number;
    waiting: number;
    attending: number;
    meetings: number;
    proposals: number;
    won: number;
    lost: number;
    avg_contact: number;
    revenue: number;
  };
  comparison: Comparison[];
  notifications: {
    id: string;
    message: string;
    created_at: string;
    read_at: string | null;
  }[];
  integrations: {
    id: string;
    provider: string;
    status: string;
    last_sync_at: string | null;
  }[];
  settings: { sla_minutes: number; company: string };
  listLimit: number;
};
export type Prospect = {
  id: string;
  username: string;
  name: string;
  owner_id: string;
  owner: string;
  status: string;
  first_contact_at: string | null;
  last_message: string | null;
  followup_at: string | null;
  notes: string | null;
  lead_id: string | null;
};
export type Meeting = {
  id: string;
  lead_id: string;
  lead_name: string;
  owner_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
};
export type Conversation = {
  id: string;
  lead_id: string;
  lead_name: string;
  channel: string;
  owner_id: string;
  owner: string;
  unread: boolean;
  awaiting_reply: boolean;
  demo: boolean;
  last_message: string | null;
  last_message_at: string | null;
};
export type Message = {
  id: string;
  body: string;
  direction: string;
  created_at: string;
};
export type OperationsData = {
  prospects: Prospect[];
  meetings: Meeting[];
  conversations: Conversation[];
  tags: { id: string; name: string }[];
  leadTags: { lead_id: string; tag_id: string }[];
  scoreRules: { event: string; points: number }[];
  development: boolean;
  demoMode: boolean;
};

export type Breakdown = {
  label: string;
  leads: number;
  won: number;
  revenue: number;
  avg_contact: number;
};
