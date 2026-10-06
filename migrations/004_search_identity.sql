CREATE TABLE lead_identifiers (kind text NOT NULL CHECK(kind IN ('phone','email','instagram')),value text NOT NULL,lead_id uuid NOT NULL REFERENCES leads(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(kind,value));
CREATE INDEX lead_identifiers_lead ON lead_identifiers(lead_id);
INSERT INTO lead_identifiers(kind,value,lead_id) SELECT 'phone',phone,id FROM leads WHERE phone IS NOT NULL AND deleted_at IS NULL UNION ALL SELECT 'email',email,id FROM leads WHERE email IS NOT NULL AND deleted_at IS NULL UNION ALL SELECT 'instagram',instagram,id FROM leads WHERE instagram IS NOT NULL AND deleted_at IS NULL;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX leads_search_trgm ON leads USING gin ((coalesce(name,'')||' '||coalesce(phone,'')||' '||coalesce(email,'')||' '||coalesce(company,'')||' '||coalesce(instagram,'')) gin_trgm_ops) WHERE deleted_at IS NULL;
