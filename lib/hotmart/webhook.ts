import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type HotmartTopic = "purchase" | "subscription_cancellation";
type AdminClient = ReturnType<typeof createAdminClient>;

type HotmartResponse = {
  status: "processed" | "ignored" | "duplicate" | "failed";
  message: string;
  eventId?: string;
};

type ProcessOutcome = {
  status: "processed" | "ignored";
  message: string;
  profileId?: string | null;
  subjectEmail?: string | null;
  transaction?: string | null;
  subscriberCode?: string | null;
  productUcode?: string | null;
};

type ProfileRow = {
  id: string;
  role: "admin" | "assinante";
  status: "active" | "inactive";
  blocked: boolean;
  blocked_reason: string | null;
};

const PURCHASE_GRANT_EVENTS = new Set([
  "PURCHASE_APPROVED",
  "PURCHASE_COMPLETE",
]);

const PURCHASE_BLOCK_EVENTS = new Set([
  "PURCHASE_CANCELED",
  "PURCHASE_REFUNDED",
  "PURCHASE_CHARGEBACK",
  "PURCHASE_EXPIRED",
  "PURCHASE_PROTEST",
]);

const PURCHASE_OBSERVE_EVENTS = new Set(["PURCHASE_BILLET_PRINTED"]);
const PURCHASE_DELAY_EVENT = "PURCHASE_DELAYED";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const out = value.trim();
  return out.length > 0 ? out : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const out = Number(value);
    if (Number.isFinite(out)) return out;
  }
  return null;
}

function normalizeEmail(raw: string | null): string | null {
  if (!raw) return null;
  const out = raw.trim().toLowerCase();
  return out.length > 0 ? out : null;
}

function toIsoFromMs(ms: number | null): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) {
    return new Date().toISOString();
  }

  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

function isEnabled(): boolean {
  return process.env.HOTMART_WEBHOOK_ENABLED === "true";
}

function graceDays(): number {
  const raw = Number(process.env.HOTMART_DELAYED_GRACE_DAYS ?? "3");
  if (!Number.isFinite(raw) || raw <= 0) return 3;
  return Math.floor(raw);
}

function parseAllowedProductUcodes(): Set<string> {
  const raw = process.env.HOTMART_ALLOWED_PRODUCT_UCODES ?? "";
  return new Set(
    raw
      .split(",")
      .map((token) => token.trim().toUpperCase())
      .filter((token) => token.length > 0)
  );
}

function secureEquals(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);

  if (leftBuf.length !== rightBuf.length) return false;
  return timingSafeEqual(leftBuf, rightBuf);
}

function isAuthorizedHotmartToken(receivedToken: string | null): boolean {
  if (!receivedToken) return false;

  const candidates = [
    process.env.HOTMART_HOTTOK,
    process.env.HOTMART_HOTTOK_PREVIOUS,
  ].filter((value): value is string => Boolean(value && value.length > 0));

  if (candidates.length === 0) return false;

  return candidates.some((candidate) => secureEquals(receivedToken, candidate));
}

function parseCommonEnvelope(payload: Record<string, unknown>) {
  const providerEventId = asString(payload.id);
  const eventName = asString(payload.event);
  const creationDateMs = asNumber(payload.creation_date);

  return {
    providerEventId,
    eventName,
    creationDateMs,
  };
}

function parsePurchasePayload(payload: Record<string, unknown>) {
  const data = isRecord(payload.data) ? payload.data : {};
  const product = isRecord(data.product) ? data.product : {};
  const buyer = isRecord(data.buyer) ? data.buyer : {};
  const purchase = isRecord(data.purchase) ? data.purchase : {};
  const subscription = isRecord(data.subscription) ? data.subscription : {};
  const subscriber = isRecord(subscription.subscriber)
    ? subscription.subscriber
    : {};

  return {
    productId: asNumber(product.id),
    productUcode: asString(product.ucode)?.toUpperCase() ?? null,
    productName: asString(product.name),
    buyerEmail: normalizeEmail(asString(buyer.email)),
    buyerName: asString(buyer.name),
    transaction: asString(purchase.transaction),
    purchaseStatus: asString(purchase.status),
    orderDateRaw: asString(purchase.order_date),
    approvedDateMs: asNumber(purchase.approved_date),
    subscriberCode: asString(subscriber.code),
    subscriberName: asString(subscriber.name),
    subscriberEmail: normalizeEmail(asString(subscriber.email)),
    subscriptionId: asNumber(subscription.id),
    subscriptionStatus: asString(subscription.status),
  };
}

function parseSubscriptionCancellationPayload(payload: Record<string, unknown>) {
  const data = isRecord(payload.data) ? payload.data : {};
  const product = isRecord(data.product) ? data.product : {};
  const subscriber = isRecord(data.subscriber) ? data.subscriber : {};
  const subscription = isRecord(data.subscription) ? data.subscription : {};
  const plan = isRecord(subscription.plan) ? subscription.plan : {};

  return {
    nextChargeDateMs: asNumber(data.date_next_charge),
    cancellationDateMs: asNumber(data.cancellation_date),
    productId: asNumber(product.id),
    productName: asString(product.name),
    subscriberCode: asString(subscriber.code),
    subscriberEmail: normalizeEmail(asString(subscriber.email)),
    subscriberName: asString(subscriber.name),
    subscriptionId: asNumber(subscription.id),
    planId: asNumber(plan.id),
    planName: asString(plan.name),
  };
}

async function findProfileByEmail(
  admin: AdminClient,
  email: string | null
): Promise<ProfileRow | null> {
  if (!email) return null;

  const { data, error } = await admin
    .from("profiles")
    .select("id, role, status, blocked, blocked_reason")
    .ilike("email", email)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id as string,
    role: (data.role as "admin" | "assinante") ?? "assinante",
    status: (data.status as "active" | "inactive") ?? "active",
    blocked: Boolean(data.blocked),
    blocked_reason: (data.blocked_reason as string | null) ?? null,
  };
}

async function loadProfileById(
  admin: AdminClient,
  userId: string
): Promise<ProfileRow | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, role, status, blocked, blocked_reason")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id as string,
    role: (data.role as "admin" | "assinante") ?? "assinante",
    status: (data.status as "active" | "inactive") ?? "active",
    blocked: Boolean(data.blocked),
    blocked_reason: (data.blocked_reason as string | null) ?? null,
  };
}

function isManualBlock(profile: ProfileRow): boolean {
  if (!profile.blocked) return false;
  if (!profile.blocked_reason) return true;
  return !profile.blocked_reason.startsWith("hotmart:");
}

async function ensureHotmartUser(
  admin: AdminClient,
  email: string,
  fullName: string | null
): Promise<ProfileRow> {
  const existing = await findProfileByEmail(admin, email);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: fullName ? { full_name: fullName } : undefined,
  });

  if (error) {
    throw new Error(`Falha ao convidar usuário Hotmart: ${error.message}`);
  }

  const userId = data.user?.id;
  if (!userId) {
    throw new Error("Falha ao criar usuário Hotmart");
  }

  const created = await loadProfileById(admin, userId);
  if (created) return created;

  throw new Error("Perfil não encontrado após criação do usuário Hotmart");
}

async function unblockIfHotmartManaged(
  admin: AdminClient,
  profile: ProfileRow
): Promise<void> {
  if (profile.role === "admin") return;
  if (profile.blocked && isManualBlock(profile)) return;

  const { error } = await admin
    .from("profiles")
    .update({
      status: "active",
      blocked: false,
      blocked_at: null,
      blocked_reason: null,
    })
    .eq("id", profile.id);

  if (error) throw new Error(error.message);

  const { error: authErr } = await admin.auth.admin.updateUserById(profile.id, {
    ban_duration: "none",
  });

  if (authErr) {
    throw new Error(authErr.message);
  }
}

async function grantAccess(
  admin: AdminClient,
  profile: ProfileRow,
  clearExpiry: boolean
): Promise<void> {
  if (profile.role === "admin") return;
  if (profile.blocked && isManualBlock(profile)) return;

  await unblockIfHotmartManaged(admin, profile);

  const patch: {
    status: "active";
    access_expires_at?: string | null;
  } = { status: "active" };

  if (clearExpiry) {
    patch.access_expires_at = null;
  }

  const { error } = await admin.from("profiles").update(patch).eq("id", profile.id);
  if (error) throw new Error(error.message);
}

async function applyDelayedGrace(
  admin: AdminClient,
  profile: ProfileRow
): Promise<void> {
  if (profile.role === "admin") return;
  if (profile.blocked && isManualBlock(profile)) return;

  await unblockIfHotmartManaged(admin, profile);

  const expiresAt = new Date(Date.now() + graceDays() * 86_400_000).toISOString();
  const { error } = await admin
    .from("profiles")
    .update({
      status: "active",
      access_expires_at: expiresAt,
    })
    .eq("id", profile.id);

  if (error) throw new Error(error.message);
}

async function setAccessExpiryFromCancellation(
  admin: AdminClient,
  profile: ProfileRow,
  nextChargeDateMs: number | null
): Promise<void> {
  if (profile.role === "admin") return;
  if (!nextChargeDateMs || !Number.isFinite(nextChargeDateMs)) return;

  const nextChargeIso = toIsoFromMs(nextChargeDateMs);

  const { error } = await admin
    .from("profiles")
    .update({
      access_expires_at: nextChargeIso,
    })
    .eq("id", profile.id);

  if (error) throw new Error(error.message);
}

async function blockAccess(
  admin: AdminClient,
  profile: ProfileRow,
  reason: string
): Promise<void> {
  if (profile.role === "admin") return;
  if (profile.blocked && isManualBlock(profile)) return;

  const { error } = await admin
    .from("profiles")
    .update({
      status: "inactive",
      blocked: true,
      blocked_at: new Date().toISOString(),
      blocked_reason: reason,
    })
    .eq("id", profile.id);

  if (error) throw new Error(error.message);

  const { error: authErr } = await admin.auth.admin.updateUserById(profile.id, {
    ban_duration: "876000h",
  });

  if (authErr) {
    throw new Error(authErr.message);
  }
}

async function hasAnyActiveEntitlement(
  admin: AdminClient,
  profileId: string
): Promise<boolean> {
  const { data: purchaseRows } = await admin
    .from("hotmart_purchases")
    .select("transaction")
    .eq("profile_id", profileId)
    .in("purchase_status", ["APPROVED", "COMPLETE"])
    .limit(1);

  return (purchaseRows ?? []).length > 0;
}

async function registerEventRow(
  admin: AdminClient,
  params: {
    providerEventId: string;
    topic: HotmartTopic;
    eventName: string;
    creationDateMs: number | null;
    payload: Record<string, unknown>;
  }
): Promise<{ eventRowId: string; duplicate: boolean }> {
  const { data, error } = await admin
    .from("hotmart_webhook_events")
    .insert({
      provider_event_id: params.providerEventId,
      topic: params.topic,
      event_name: params.eventName,
      creation_date_ms: params.creationDateMs,
      payload: params.payload,
      status: "received",
    })
    .select("id")
    .single();

  if (!error && data?.id) {
    return { eventRowId: data.id as string, duplicate: false };
  }

  const code = (error as { code?: string } | null)?.code;
  if (code !== "23505") {
    throw new Error(error?.message ?? "Falha ao registrar evento Hotmart");
  }

  const { data: existing, error: existingErr } = await admin
    .from("hotmart_webhook_events")
    .select("id, status")
    .eq("provider_event_id", params.providerEventId)
    .maybeSingle();

  if (existingErr || !existing?.id) {
    throw new Error(
      existingErr?.message ?? "Falha ao consultar evento Hotmart duplicado"
    );
  }

  const status = (existing.status as string | null) ?? "processed";
  if (status === "failed") {
    const { error: resetError } = await admin
      .from("hotmart_webhook_events")
      .update({ status: "received", error_message: null, processed_at: null })
      .eq("id", existing.id);

    if (resetError) {
      throw new Error(resetError.message);
    }

    return { eventRowId: existing.id as string, duplicate: false };
  }

  return { eventRowId: existing.id as string, duplicate: true };
}

async function markEventRow(
  admin: AdminClient,
  eventRowId: string,
  params: {
    status: "processed" | "ignored" | "failed";
    message: string;
    profileId?: string | null;
    subjectEmail?: string | null;
    transaction?: string | null;
    subscriberCode?: string | null;
    productUcode?: string | null;
  }
): Promise<void> {
  const { error } = await admin
    .from("hotmart_webhook_events")
    .update({
      status: params.status,
      error_message: params.status === "failed" ? params.message : null,
      profile_id: params.profileId ?? null,
      subject_email: params.subjectEmail ?? null,
      transaction: params.transaction ?? null,
      subscriber_code: params.subscriberCode ?? null,
      product_ucode: params.productUcode ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", eventRowId);

  if (error) {
    throw new Error(error.message);
  }
}

async function processPurchaseEvent(
  admin: AdminClient,
  payload: Record<string, unknown>,
  eventName: string,
  creationDateMs: number | null
): Promise<ProcessOutcome> {
  const parsed = parsePurchasePayload(payload);

  if (!parsed.transaction) {
    return {
      status: "ignored",
      message: "Evento sem purchase.transaction",
      subjectEmail: parsed.buyerEmail,
      productUcode: parsed.productUcode,
    };
  }

  const allowlist = parseAllowedProductUcodes();
  if (allowlist.size > 0) {
    if (!parsed.productUcode || !allowlist.has(parsed.productUcode)) {
      return {
        status: "ignored",
        message: "Produto fora da allowlist",
        subjectEmail: parsed.buyerEmail,
        transaction: parsed.transaction,
        productUcode: parsed.productUcode,
      };
    }
  }

  const eventIso = toIsoFromMs(creationDateMs);

  const { data: existingPurchase } = await admin
    .from("hotmart_purchases")
    .select("last_event_at")
    .eq("transaction", parsed.transaction)
    .maybeSingle();

  if (existingPurchase?.last_event_at) {
    const existingMs = new Date(existingPurchase.last_event_at as string).getTime();
    const incomingMs = new Date(eventIso).getTime();
    if (Number.isFinite(existingMs) && Number.isFinite(incomingMs) && incomingMs < existingMs) {
      return {
        status: "ignored",
        message: "Evento de compra fora de ordem",
        subjectEmail: parsed.buyerEmail,
        transaction: parsed.transaction,
        subscriberCode: parsed.subscriberCode,
        productUcode: parsed.productUcode,
      };
    }
  }

  let profile: ProfileRow | null = await findProfileByEmail(admin, parsed.buyerEmail);

  if (!profile && PURCHASE_GRANT_EVENTS.has(eventName) && parsed.buyerEmail) {
    profile = await ensureHotmartUser(admin, parsed.buyerEmail, parsed.buyerName);
  }

  const profileId = profile?.id ?? null;

  const { error: purchaseErr } = await admin.from("hotmart_purchases").upsert(
    {
      transaction: parsed.transaction,
      profile_id: profileId,
      buyer_email: parsed.buyerEmail,
      buyer_name: parsed.buyerName,
      product_id: parsed.productId,
      product_ucode: parsed.productUcode,
      product_name: parsed.productName,
      purchase_status: parsed.purchaseStatus,
      event_name: eventName,
      order_date_raw: parsed.orderDateRaw,
      approved_date_ms: parsed.approvedDateMs,
      payload,
      last_event_at: eventIso,
    },
    { onConflict: "transaction" }
  );

  if (purchaseErr) {
    throw new Error(purchaseErr.message);
  }

  if (parsed.subscriberCode) {
    const { error: subscriptionErr } = await admin.from("hotmart_subscriptions").upsert(
      {
        subscriber_code: parsed.subscriberCode,
        subscription_hotmart_id: parsed.subscriptionId,
        profile_id: profileId,
        subscriber_email: parsed.subscriberEmail ?? parsed.buyerEmail,
        subscriber_name: parsed.subscriberName ?? parsed.buyerName,
        product_id: parsed.productId,
        product_ucode: parsed.productUcode,
        product_name: parsed.productName,
        subscription_status: parsed.subscriptionStatus,
        event_name: eventName,
        payload,
        last_event_at: eventIso,
      },
      { onConflict: "subscriber_code" }
    );

    if (subscriptionErr) {
      throw new Error(subscriptionErr.message);
    }
  }

  if (PURCHASE_GRANT_EVENTS.has(eventName)) {
    if (profile) {
      await grantAccess(admin, profile, true);
      return {
        status: "processed",
        message: "Acesso liberado",
        profileId,
        subjectEmail: parsed.buyerEmail,
        transaction: parsed.transaction,
        subscriberCode: parsed.subscriberCode,
        productUcode: parsed.productUcode,
      };
    }

    return {
      status: "ignored",
      message: "Compra aprovada sem usuário identificável",
      subjectEmail: parsed.buyerEmail,
      transaction: parsed.transaction,
      subscriberCode: parsed.subscriberCode,
      productUcode: parsed.productUcode,
    };
  }

  if (eventName === PURCHASE_DELAY_EVENT) {
    if (profile) {
      await applyDelayedGrace(admin, profile);
      return {
        status: "processed",
        message: `Compra atrasada: carência aplicada (${graceDays()} dias)`,
        profileId,
        subjectEmail: parsed.buyerEmail,
        transaction: parsed.transaction,
        subscriberCode: parsed.subscriberCode,
        productUcode: parsed.productUcode,
      };
    }

    return {
      status: "ignored",
      message: "Compra atrasada sem usuário existente",
      subjectEmail: parsed.buyerEmail,
      transaction: parsed.transaction,
      subscriberCode: parsed.subscriberCode,
      productUcode: parsed.productUcode,
    };
  }

  if (PURCHASE_BLOCK_EVENTS.has(eventName)) {
    if (profile) {
      const hasOtherActiveEntitlement = await hasAnyActiveEntitlement(admin, profile.id);

      if (hasOtherActiveEntitlement) {
        return {
          status: "ignored",
          message: "Usuário mantém acesso por outra compra/assinatura ativa",
          profileId,
          subjectEmail: parsed.buyerEmail,
          transaction: parsed.transaction,
          subscriberCode: parsed.subscriberCode,
          productUcode: parsed.productUcode,
        };
      }

      await blockAccess(admin, profile, `hotmart:${eventName}`);
      return {
        status: "processed",
        message: "Acesso bloqueado",
        profileId,
        subjectEmail: parsed.buyerEmail,
        transaction: parsed.transaction,
        subscriberCode: parsed.subscriberCode,
        productUcode: parsed.productUcode,
      };
    }

    return {
      status: "ignored",
      message: "Evento de bloqueio sem usuário existente",
      subjectEmail: parsed.buyerEmail,
      transaction: parsed.transaction,
      subscriberCode: parsed.subscriberCode,
      productUcode: parsed.productUcode,
    };
  }

  if (PURCHASE_OBSERVE_EVENTS.has(eventName)) {
    return {
      status: "ignored",
      message: "Boleto impresso: evento registrado sem provisionamento",
      profileId,
      subjectEmail: parsed.buyerEmail,
      transaction: parsed.transaction,
      subscriberCode: parsed.subscriberCode,
      productUcode: parsed.productUcode,
    };
  }

  return {
    status: "ignored",
    message: "Evento de compra não mapeado",
    profileId,
    subjectEmail: parsed.buyerEmail,
    transaction: parsed.transaction,
    subscriberCode: parsed.subscriberCode,
    productUcode: parsed.productUcode,
  };
}

async function processSubscriptionCancellationEvent(
  admin: AdminClient,
  payload: Record<string, unknown>,
  eventName: string,
  creationDateMs: number | null
): Promise<ProcessOutcome> {
  const parsed = parseSubscriptionCancellationPayload(payload);

  if (!parsed.subscriberCode) {
    return {
      status: "ignored",
      message: "Evento sem subscriber.code",
      subjectEmail: parsed.subscriberEmail,
    };
  }

  if (eventName !== "SUBSCRIPTION_CANCELLATION") {
    return {
      status: "ignored",
      message: "Evento não suportado para cancelamento de assinatura",
      subjectEmail: parsed.subscriberEmail,
      subscriberCode: parsed.subscriberCode,
    };
  }

  const allowlist = parseAllowedProductUcodes();
  if (allowlist.size > 0) {
    const { data: existingSubscription } = await admin
      .from("hotmart_subscriptions")
      .select("product_ucode")
      .eq("subscriber_code", parsed.subscriberCode)
      .maybeSingle();

    const knownUcode = asString(existingSubscription?.product_ucode)?.toUpperCase() ?? null;
    if (!knownUcode || !allowlist.has(knownUcode)) {
      return {
        status: "ignored",
        message: "Cancelamento fora da allowlist ou sem produto mapeado",
        subjectEmail: parsed.subscriberEmail,
        subscriberCode: parsed.subscriberCode,
      };
    }
  }

  const eventIso = toIsoFromMs(creationDateMs);

  const { data: existingSubscriptionRow } = await admin
    .from("hotmart_subscriptions")
    .select("last_event_at")
    .eq("subscriber_code", parsed.subscriberCode)
    .maybeSingle();

  if (existingSubscriptionRow?.last_event_at) {
    const existingMs = new Date(existingSubscriptionRow.last_event_at as string).getTime();
    const incomingMs = new Date(eventIso).getTime();
    if (Number.isFinite(existingMs) && Number.isFinite(incomingMs) && incomingMs < existingMs) {
      return {
        status: "ignored",
        message: "Evento de assinatura fora de ordem",
        subjectEmail: parsed.subscriberEmail,
        subscriberCode: parsed.subscriberCode,
      };
    }
  }

  const profile = await findProfileByEmail(admin, parsed.subscriberEmail);
  const profileId = profile?.id ?? null;

  const { error: subscriptionErr } = await admin.from("hotmart_subscriptions").upsert(
    {
      subscriber_code: parsed.subscriberCode,
      subscription_hotmart_id: parsed.subscriptionId,
      profile_id: profileId,
      subscriber_email: parsed.subscriberEmail,
      subscriber_name: parsed.subscriberName,
      product_id: parsed.productId,
      product_name: parsed.productName,
      plan_id: parsed.planId,
      plan_name: parsed.planName,
      subscription_status: "CANCELLED_BY_CUSTOMER",
      next_charge_at: parsed.nextChargeDateMs ? toIsoFromMs(parsed.nextChargeDateMs) : null,
      cancellation_date_ms: parsed.cancellationDateMs,
      event_name: eventName,
      payload,
      last_event_at: eventIso,
    },
    { onConflict: "subscriber_code" }
  );

  if (subscriptionErr) {
    throw new Error(subscriptionErr.message);
  }

  if (profile) {
    await setAccessExpiryFromCancellation(admin, profile, parsed.nextChargeDateMs);

    return {
      status: "processed",
      message: "Cancelamento registrado com acesso até a próxima cobrança",
      profileId,
      subjectEmail: parsed.subscriberEmail,
      subscriberCode: parsed.subscriberCode,
    };
  }

  return {
    status: "ignored",
    message: "Cancelamento registrado sem usuário local correspondente",
    subjectEmail: parsed.subscriberEmail,
    subscriberCode: parsed.subscriberCode,
  };
}

export async function processHotmartWebhook(
  topic: HotmartTopic,
  payload: unknown
): Promise<HotmartResponse> {
  if (!isEnabled()) {
    return {
      status: "ignored",
      message: "Integração Hotmart desativada",
    };
  }

  if (!isRecord(payload)) {
    return {
      status: "ignored",
      message: "Payload inválido",
    };
  }

  const envelope = parseCommonEnvelope(payload);

  if (!envelope.providerEventId || !envelope.eventName) {
    return {
      status: "ignored",
      message: "Payload sem id/event",
    };
  }

  const admin = createAdminClient();

  let eventRowId: string | null = null;

  try {
    const eventRow = await registerEventRow(admin, {
      providerEventId: envelope.providerEventId,
      topic,
      eventName: envelope.eventName,
      creationDateMs: envelope.creationDateMs,
      payload,
    });

    eventRowId = eventRow.eventRowId;

    if (eventRow.duplicate) {
      return {
        status: "duplicate",
        message: "Evento já processado",
        eventId: envelope.providerEventId,
      };
    }

    const outcome =
      topic === "purchase"
        ? await processPurchaseEvent(
            admin,
            payload,
            envelope.eventName,
            envelope.creationDateMs
          )
        : await processSubscriptionCancellationEvent(
            admin,
            payload,
            envelope.eventName,
            envelope.creationDateMs
          );

    await markEventRow(admin, eventRowId, {
      status: outcome.status,
      message: outcome.message,
      profileId: outcome.profileId,
      subjectEmail: outcome.subjectEmail,
      transaction: outcome.transaction,
      subscriberCode: outcome.subscriberCode,
      productUcode: outcome.productUcode,
    });

    return {
      status: outcome.status,
      message: outcome.message,
      eventId: envelope.providerEventId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar webhook Hotmart";

    if (eventRowId) {
      try {
        await markEventRow(admin, eventRowId, {
          status: "failed",
          message,
        });
      } catch {
        // noop
      }
    }

    return {
      status: "failed",
      message,
      eventId: envelope.providerEventId,
    };
  }
}

export function validateHotmartHottok(receivedToken: string | null): boolean {
  if (!isEnabled()) {
    return true;
  }

  return isAuthorizedHotmartToken(receivedToken);
}
