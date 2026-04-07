-- Correos recibidos (webhook Resend inbound) para notificaciones cuando un cliente escribe.
CREATE TABLE IF NOT EXISTS inbound_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resend_email_id TEXT UNIQUE,
  from_email TEXT NOT NULL,
  to_email TEXT[],
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  leido BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE inbound_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY inbound_emails_select ON inbound_emails
  FOR SELECT USING (auth.role() = 'authenticated');

COMMENT ON TABLE inbound_emails IS 'Correos entrantes via Resend Inbound; webhook receive-email';
