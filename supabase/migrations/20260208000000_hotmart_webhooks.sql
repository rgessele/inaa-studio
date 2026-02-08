-- Hotmart webhook integration: event audit, purchase/subscription mirrors

CREATE TABLE IF NOT EXISTS public.hotmart_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  event_name TEXT NOT NULL,
  profile_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  subject_email TEXT NULL,
  transaction TEXT NULL,
  subscriber_code TEXT NULL,
  product_ucode TEXT NULL,
  creation_date_ms BIGINT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotmart_webhook_events_topic_check'
  ) THEN
    ALTER TABLE public.hotmart_webhook_events
    ADD CONSTRAINT hotmart_webhook_events_topic_check
    CHECK (topic IN ('purchase', 'subscription_cancellation'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotmart_webhook_events_status_check'
  ) THEN
    ALTER TABLE public.hotmart_webhook_events
    ADD CONSTRAINT hotmart_webhook_events_status_check
    CHECK (status IN ('received', 'processed', 'ignored', 'failed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS hotmart_webhook_events_provider_event_id_unique
  ON public.hotmart_webhook_events (provider_event_id);

CREATE INDEX IF NOT EXISTS hotmart_webhook_events_received_idx
  ON public.hotmart_webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS hotmart_webhook_events_event_idx
  ON public.hotmart_webhook_events (event_name, status);

CREATE INDEX IF NOT EXISTS hotmart_webhook_events_profile_id_idx
  ON public.hotmart_webhook_events (profile_id, received_at DESC);

CREATE INDEX IF NOT EXISTS hotmart_webhook_events_subject_email_idx
  ON public.hotmart_webhook_events (lower(subject_email), received_at DESC);

CREATE INDEX IF NOT EXISTS hotmart_webhook_events_transaction_idx
  ON public.hotmart_webhook_events (transaction);

CREATE INDEX IF NOT EXISTS hotmart_webhook_events_subscriber_code_idx
  ON public.hotmart_webhook_events (subscriber_code);


CREATE TABLE IF NOT EXISTS public.hotmart_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction TEXT NOT NULL,
  profile_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_email TEXT NULL,
  buyer_name TEXT NULL,
  product_id BIGINT NULL,
  product_ucode TEXT NULL,
  product_name TEXT NULL,
  purchase_status TEXT NULL,
  event_name TEXT NOT NULL,
  order_date_raw TEXT NULL,
  approved_date_ms BIGINT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_event_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS hotmart_purchases_transaction_unique
  ON public.hotmart_purchases (transaction);

CREATE INDEX IF NOT EXISTS hotmart_purchases_profile_id_idx
  ON public.hotmart_purchases (profile_id);

CREATE INDEX IF NOT EXISTS hotmart_purchases_buyer_email_idx
  ON public.hotmart_purchases (lower(buyer_email));

DROP TRIGGER IF EXISTS update_hotmart_purchases_updated_at ON public.hotmart_purchases;
CREATE TRIGGER update_hotmart_purchases_updated_at
  BEFORE UPDATE ON public.hotmart_purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE IF NOT EXISTS public.hotmart_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_code TEXT NOT NULL,
  subscription_hotmart_id BIGINT NULL,
  profile_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  subscriber_email TEXT NULL,
  subscriber_name TEXT NULL,
  product_id BIGINT NULL,
  product_ucode TEXT NULL,
  product_name TEXT NULL,
  plan_id BIGINT NULL,
  plan_name TEXT NULL,
  subscription_status TEXT NULL,
  next_charge_at TIMESTAMP WITH TIME ZONE NULL,
  cancellation_date_ms BIGINT NULL,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_event_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS hotmart_subscriptions_subscriber_code_unique
  ON public.hotmart_subscriptions (subscriber_code);

CREATE INDEX IF NOT EXISTS hotmart_subscriptions_profile_id_idx
  ON public.hotmart_subscriptions (profile_id);

CREATE INDEX IF NOT EXISTS hotmart_subscriptions_email_idx
  ON public.hotmart_subscriptions (lower(subscriber_email));

DROP TRIGGER IF EXISTS update_hotmart_subscriptions_updated_at ON public.hotmart_subscriptions;
CREATE TRIGGER update_hotmart_subscriptions_updated_at
  BEFORE UPDATE ON public.hotmart_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


ALTER TABLE public.hotmart_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotmart_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotmart_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view hotmart webhook events"
  ON public.hotmart_webhook_events
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can view hotmart purchases"
  ON public.hotmart_purchases
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can view hotmart subscriptions"
  ON public.hotmart_subscriptions
  FOR SELECT
  USING (public.is_admin());
