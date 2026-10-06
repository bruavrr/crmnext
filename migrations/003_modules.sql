ALTER TABLE pipeline_stages ADD COLUMN system_key text UNIQUE;
UPDATE pipeline_stages SET system_key=CASE name WHEN 'Lead novo' THEN 'new' WHEN 'Tentativa de contato' THEN 'attempt' WHEN 'Contato realizado' THEN 'contact' WHEN 'Qualificado' THEN 'qualified' WHEN 'Reunião agendada' THEN 'meeting_scheduled' WHEN 'Reunião realizada' THEN 'meeting_held' WHEN 'Proposta enviada' THEN 'proposal' WHEN 'Negociação' THEN 'negotiation' WHEN 'Fechado / Ganho' THEN 'won' WHEN 'Perdido' THEN 'lost' END;
ALTER TABLE conversations ADD COLUMN demo boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX conversations_lead_channel ON conversations(lead_id,channel);
ALTER TABLE notifications ADD COLUMN event_key text UNIQUE;
CREATE TABLE score_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid NOT NULL REFERENCES leads(id),event text NOT NULL REFERENCES score_rules(event),points integer NOT NULL,actor_id uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(lead_id,event));
