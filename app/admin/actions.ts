"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SUPPORT_WHATSAPP_URL_SETTING_KEY,
  normalizeHttpUrl,
} from "@/lib/app-settings";

type Role = "admin" | "assinante";
type Status = "active" | "inactive";

type ProfileAdminState = {
  role: Role;
  status: Status;
  blocked: boolean;
  access_expires_at: string | null;
};

function randomPassword(length = 40): string {
  const alphabet =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}:,.?";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function parseCsvSimple(text: string): Array<Record<string, string>> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const splitLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        out.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };

  const headers = splitLine(lines[0]).map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? "").trim();
    });
    rows.push(row);
  }

  return rows;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Usuário não autenticado");
  }

  // Best-effort bootstrap for reserved emails.
  try {
    await supabase.rpc("ensure_bootstrap_admin");
  } catch {
    // Ignore if not available.
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, status, blocked, access_expires_at")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    throw new Error("Não foi possível validar permissões");
  }

  if ((profile.status as string | null) === "inactive") {
    throw new Error("Acesso inativo");
  }

  if (profile.blocked) {
    throw new Error("Acesso bloqueado");
  }

  if (profile.access_expires_at) {
    const expiresAt = new Date(profile.access_expires_at);
    if (expiresAt.getTime() <= Date.now()) {
      throw new Error("Acesso expirado");
    }
  }

  if (profile.role !== "admin") {
    throw new Error("Permissão negada");
  }

  return { supabase, user };
}

async function audit(params: {
  actorUserId: string;
  targetUserId?: string | null;
  action: string;
  reason?: string | null;
  payload?: Record<string, unknown>;
}) {
  const { supabase } = await requireAdmin();
  await supabase.from("admin_audit_log").insert({
    actor_user_id: params.actorUserId,
    target_user_id: params.targetUserId ?? null,
    action: params.action,
    reason: params.reason ?? null,
    payload: params.payload ?? {},
  });
}

export async function adminUpdateUserFullName(
  userId: string,
  fullNameRaw: string
) {
  const { user } = await requireAdmin();

  const fullName = fullNameRaw.trim();
  if (!fullName) throw new Error("Nome inválido");

  const admin = createAdminClient();

  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { full_name: fullName },
  });
  if (authErr) throw new Error(authErr.message);

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", userId);
  if (profileErr) throw new Error(profileErr.message);

  await audit({
    actorUserId: user.id,
    targetUserId: userId,
    action: "update_user_full_name",
    payload: { full_name: fullName },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function adminCreateUser(params: {
  email: string;
  fullName?: string;
  role?: Role;
  status?: Status;
  accessExpiresAtIso?: string | null;
  sendInvite?: boolean;
}) {
  const { user } = await requireAdmin();

  const email = normalizeEmail(params.email);
  if (!email || !isValidEmail(email)) throw new Error("Email inválido");

  const role: Role = params.role ?? "assinante";
  const status: Status = params.status ?? "active";
  const fullName = (params.fullName ?? "").trim();
  const accessExpiresAtIso = params.accessExpiresAtIso ?? null;
  const sendInvite = params.sendInvite !== false;

  const admin = createAdminClient();

  // Prevent duplicates (by profile email).
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existing?.id) {
    throw new Error("Usuário já existe");
  }

  let createdUserId: string | null = null;
  let recoveryLink: string | null = null;

  if (sendInvite) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: fullName ? { full_name: fullName } : undefined,
    });
    if (error) throw new Error(error.message);
    createdUserId = data.user?.id ?? null;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });
    if (error) throw new Error(error.message);
    createdUserId = data.user?.id ?? null;

    if (createdUserId) {
      const { data: linkData, error: linkErr } =
        await admin.auth.admin.generateLink({
          type: "recovery",
          email,
        });
      if (linkErr) throw new Error(linkErr.message);
      recoveryLink = linkData.properties?.action_link ?? null;
    }
  }

  if (!createdUserId) throw new Error("Não foi possível criar o usuário");

  // Ensure profile has desired access fields.
  const update: Record<string, unknown> = {
    role,
    status,
  };
  if (fullName) update.full_name = fullName;
  if (accessExpiresAtIso !== null)
    update.access_expires_at = accessExpiresAtIso;

  const { error: updErr } = await admin
    .from("profiles")
    .update(update)
    .eq("id", createdUserId);
  if (updErr) throw new Error(updErr.message);

  await audit({
    actorUserId: user.id,
    targetUserId: createdUserId,
    action: "create_user",
    payload: {
      email,
      role,
      status,
      access_expires_at: accessExpiresAtIso,
      sendInvite,
    },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${createdUserId}`);

  return { userId: createdUserId, recoveryLink };
}

function isExpired(accessExpiresAt: string | null): boolean {
  if (!accessExpiresAt) return false;
  const t = new Date(accessExpiresAt).getTime();
  if (!Number.isFinite(t)) return false;
  return t <= Date.now();
}

function isActiveAdmin(profile: ProfileAdminState): boolean {
  return (
    profile.role === "admin" &&
    profile.status === "active" &&
    !profile.blocked &&
    !isExpired(profile.access_expires_at)
  );
}

async function getProfileAdminState(
  supabase: SupabaseClient,
  userId: string
): Promise<ProfileAdminState> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, status, blocked, access_expires_at")
    .eq("id", userId)
    .maybeSingle();

  if (data && !error) {
    return {
      role: data.role as Role,
      status: (data.status as Status) ?? "active",
      blocked: Boolean(data.blocked),
      access_expires_at: (data.access_expires_at as string | null) ?? null,
    };
  }

  // Fallback: read via privileged client (Secret key / service role).
  // This avoids fragile coupling to RLS/view behavior during admin actions.
  const admin = createAdminClient();
  const { data: adminData, error: adminError } = await admin
    .from("profiles")
    .select("role, status, blocked, access_expires_at")
    .eq("id", userId)
    .maybeSingle();

  if (adminError || !adminData) {
    throw new Error("Usuário não encontrado");
  }

  return {
    role: adminData.role as Role,
    status: (adminData.status as Status) ?? "active",
    blocked: Boolean(adminData.blocked),
    access_expires_at: (adminData.access_expires_at as string | null) ?? null,
  };
}

async function assertNotLastActiveAdminRemoving(targetUserId: string) {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("status", "active")
    .eq("blocked", false)
    .or(
      `access_expires_at.is.null,access_expires_at.gt.${new Date().toISOString()}`
    )
    .neq("id", targetUserId);

  if (error) {
    throw new Error(error.message);
  }

  if ((count ?? 0) < 1) {
    throw new Error("Não é possível remover o último admin ativo");
  }
}

export async function adminSetUserRole(userId: string, role: Role) {
  const { supabase, user } = await requireAdmin();

  if (userId === user.id && role !== "admin") {
    throw new Error("Você não pode rebaixar a si mesmo");
  }

  const current = await getProfileAdminState(supabase, userId);
  if (isActiveAdmin(current) && role !== "admin") {
    await assertNotLastActiveAdminRemoving(userId);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) throw new Error(error.message);

  await audit({
    actorUserId: user.id,
    targetUserId: userId,
    action: "set_role",
    payload: { role },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function adminSetUserAccessExpiresAt(
  userId: string,
  accessExpiresAtIso: string | null
) {
  const { supabase, user } = await requireAdmin();

  const current = await getProfileAdminState(supabase, userId);
  const willExpire = isExpired(accessExpiresAtIso);
  if (isActiveAdmin(current) && willExpire) {
    await assertNotLastActiveAdminRemoving(userId);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ access_expires_at: accessExpiresAtIso })
    .eq("id", userId);

  if (error) throw new Error(error.message);

  await audit({
    actorUserId: user.id,
    targetUserId: userId,
    action: "set_access_expires_at",
    payload: { access_expires_at: accessExpiresAtIso },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function adminBanUser(userId: string, reason: string | null) {
  const { supabase, user } = await requireAdmin();

  const current = await getProfileAdminState(supabase, userId);
  if (isActiveAdmin(current)) {
    await assertNotLastActiveAdminRemoving(userId);
  }

  const admin = createAdminClient();
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      blocked: true,
      blocked_at: new Date().toISOString(),
      blocked_reason: reason,
    })
    .eq("id", userId);

  if (profileError) throw new Error(profileError.message);

  // Auth-level ban + revoke sessions (requires secret/service role key).
  const banDuration = "876000h"; // ~100 years
  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: banDuration,
  });
  if (authErr) {
    throw new Error(authErr.message);
  }

  try {
    // Revoke refresh tokens / end sessions if supported.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maybeAdmin: any = admin.auth.admin;
    if (typeof maybeAdmin.signOut === "function") {
      await maybeAdmin.signOut(userId);
    }
  } catch {
    // Best-effort.
  }

  await audit({
    actorUserId: user.id,
    targetUserId: userId,
    action: "ban_user",
    reason,
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function adminUnbanUser(userId: string) {
  const { user } = await requireAdmin();

  const admin = createAdminClient();
  const { error: profileError } = await admin
    .from("profiles")
    .update({ blocked: false, blocked_at: null, blocked_reason: null })
    .eq("id", userId);

  if (profileError) throw new Error(profileError.message);

  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });
  if (authErr) throw new Error(authErr.message);

  await audit({
    actorUserId: user.id,
    targetUserId: userId,
    action: "unban_user",
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function adminSetUserStatus(userId: string, status: Status) {
  const { user } = await requireAdmin();

  if (userId === user.id && status !== "active") {
    throw new Error("Você não pode inativar a si mesmo");
  }

  const admin = createAdminClient();
  const current = await getProfileAdminState(admin, userId);
  const isRemovingActiveAdmin =
    current.role === "admin" &&
    current.status === "active" &&
    status !== "active";
  if (isRemovingActiveAdmin) {
    await assertNotLastActiveAdminRemoving(userId);
  }

  const { error } = await admin
    .from("profiles")
    .update({ status })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  if (status !== "active") {
    try {
      // Best-effort: revoke refresh tokens / end sessions if supported.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const maybeAdmin: any = admin.auth.admin;
      if (typeof maybeAdmin.signOut === "function") {
        await maybeAdmin.signOut(userId);
      }
    } catch {
      // Best-effort.
    }
  }

  await audit({
    actorUserId: user.id,
    targetUserId: userId,
    action: "set_status",
    payload: { status },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function adminUpdateUserEmail(userId: string, newEmail: string) {
  const { user } = await requireAdmin();

  const email = newEmail.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Email inválido");

  const admin = createAdminClient();
  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    email,
  });
  if (authErr) throw new Error(authErr.message);

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ email })
    .eq("id", userId);
  if (profileErr) throw new Error(profileErr.message);

  await audit({
    actorUserId: user.id,
    targetUserId: userId,
    action: "update_user_email",
    payload: { email },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function adminTransferProjects(params: {
  fromUserId: string;
  toEmail: string;
  reason?: string | null;
}) {
  const { user } = await requireAdmin();

  const email = params.toEmail.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Email inválido");

  // Resolve destination user by email. If missing, invite user (creates auth user).
  const admin = createAdminClient();

  let toUserId: string | null = null;
  {
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    toUserId = (existingProfile?.id as string | undefined) ?? null;
  }

  if (!toUserId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
    if (error) throw new Error(error.message);
    toUserId = data.user?.id ?? null;
  }

  if (!toUserId) {
    throw new Error("Não foi possível resolver o usuário destino");
  }

  const { error: transferErr } = await admin
    .from("projects")
    .update({ user_id: toUserId })
    .eq("user_id", params.fromUserId);

  if (transferErr) throw new Error(transferErr.message);

  await audit({
    actorUserId: user.id,
    targetUserId: params.fromUserId,
    action: "transfer_projects",
    reason: params.reason ?? null,
    payload: { to_user_id: toUserId, to_email: email },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${params.fromUserId}`);
  revalidatePath(`/admin/users/${toUserId}`);
}

export async function adminGeneratePasswordRecoveryLink(emailRaw: string) {
  const { user } = await requireAdmin();

  const email = normalizeEmail(emailRaw);
  if (!email || !isValidEmail(email)) {
    throw new Error("Email inválido");
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (error) throw new Error(error.message);
  const link = data.properties?.action_link ?? null;
  if (!link) throw new Error("Não foi possível gerar o link");

  await audit({
    actorUserId: user.id,
    action: "generate_recovery_link",
    payload: { email },
  });

  return { link };
}

export async function adminImportUsersCsv(formData: FormData) {
  const { user } = await requireAdmin();

  const sendInvites = String(formData.get("send_invites") ?? "") === "1";

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Arquivo CSV inválido");
  }

  const text = await file.text();
  const parsed = parseCsvSimple(text);

  const admin = createAdminClient();
  const { data: job, error: jobErr } = await admin
    .from("import_jobs")
    .insert({
      actor_user_id: user.id,
      file_name: file.name,
      summary: { total: parsed.length },
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    throw new Error(jobErr?.message ?? "Falha ao criar job");
  }

  let ok = 0;
  let failed = 0;
  let invited = 0;
  let updated = 0;

  for (let idx = 0; idx < parsed.length; idx++) {
    const raw = parsed[idx];
    const rowNumber = idx + 2; // header is row 1

    const email = normalizeEmail(raw.email ?? raw.Email ?? raw.EMAIL ?? "");
    const fullName = (raw.full_name ?? raw.nome ?? raw.name ?? "").trim();
    const roleRaw = (raw.role ?? "").trim().toLowerCase();
    const statusRaw = (raw.status ?? "").trim().toLowerCase();
    const expiresRaw = (raw.access_expires_at ?? raw.expires_at ?? "").trim();

    if (!email || !isValidEmail(email)) {
      failed++;
      await admin.from("import_job_rows").insert({
        job_id: job.id,
        row_number: rowNumber,
        email: email || null,
        status: "error",
        message: "Email inválido",
        payload: raw,
      });
      continue;
    }

    const desiredRole: Role | null =
      roleRaw === "admin"
        ? "admin"
        : roleRaw === "assinante"
          ? "assinante"
          : null;

    const desiredStatus: Status | null =
      statusRaw === "inactive" || statusRaw === "inativo"
        ? "inactive"
        : statusRaw === "active" || statusRaw === "ativo"
          ? "active"
          : null;

    const wantsBlocked = statusRaw === "blocked" || statusRaw === "bloqueado";

    const desiredExpiresIso = (() => {
      if (!expiresRaw) return null;
      const d = new Date(expiresRaw);
      return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    })();

    try {
      // Find existing profile by email.
      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();

      let targetUserId: string | null =
        (existing?.id as string | undefined) ?? null;

      if (!targetUserId) {
        if (sendInvites) {
          const { data, error } = await admin.auth.admin.inviteUserByEmail(
            email,
            {
              data: fullName ? { full_name: fullName } : undefined,
            }
          );
          if (error) throw new Error(error.message);
          targetUserId = data.user?.id ?? null;
          invited++;
        } else {
          const { data, error } = await admin.auth.admin.createUser({
            email,
            password: randomPassword(),
            email_confirm: true,
            user_metadata: fullName ? { full_name: fullName } : undefined,
          });
          if (error) throw new Error(error.message);
          targetUserId = data.user?.id ?? null;
        }
      }

      if (!targetUserId) {
        throw new Error("Não foi possível criar/identificar usuário");
      }

      // Apply updates (only if provided). Defaults for new users remain assinante/ativo.
      const update: Record<string, unknown> = {};
      if (desiredRole) update.role = desiredRole;
      if (desiredStatus) update.status = desiredStatus;
      if (desiredExpiresIso !== null)
        update.access_expires_at = desiredExpiresIso;

      if (desiredRole && desiredRole !== "admin" && targetUserId === user.id) {
        throw new Error("Você não pode rebaixar a si mesmo");
      }

      if (targetUserId && desiredRole && desiredRole !== "admin") {
        const current = await getProfileAdminState(admin, targetUserId);
        if (isActiveAdmin(current)) {
          await assertNotLastActiveAdminRemoving(targetUserId);
        }
      }

      if (
        targetUserId &&
        desiredExpiresIso !== null &&
        isExpired(desiredExpiresIso)
      ) {
        const current = await getProfileAdminState(admin, targetUserId);
        if (isActiveAdmin(current)) {
          await assertNotLastActiveAdminRemoving(targetUserId);
        }
      }

      if (Object.keys(update).length > 0) {
        const { error: updErr } = await admin
          .from("profiles")
          .update(update)
          .eq("id", targetUserId);
        if (updErr) throw new Error(updErr.message);
        updated++;
      }

      if (wantsBlocked) {
        // Mirror ban behavior: profile blocked + auth ban.
        if (targetUserId) {
          const current = await getProfileAdminState(admin, targetUserId);
          if (isActiveAdmin(current)) {
            await assertNotLastActiveAdminRemoving(targetUserId);
          }
        }

        const { error: profileErr } = await admin
          .from("profiles")
          .update({
            status: "inactive",
            blocked: true,
            blocked_at: new Date().toISOString(),
            blocked_reason: "Import CSV",
          })
          .eq("id", targetUserId);
        if (profileErr) throw new Error(profileErr.message);

        const { error: authErr } = await admin.auth.admin.updateUserById(
          targetUserId,
          { ban_duration: "876000h" }
        );
        if (authErr) throw new Error(authErr.message);

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const maybeAdmin: any = admin.auth.admin;
          if (typeof maybeAdmin.signOut === "function") {
            await maybeAdmin.signOut(targetUserId);
          }
        } catch {
          // Best-effort.
        }
      }

      ok++;
      await admin.from("import_job_rows").insert({
        job_id: job.id,
        row_number: rowNumber,
        email,
        status: "ok",
        message:
          targetUserId === (existing?.id as string | undefined)
            ? "Atualizado"
            : "Convidado",
        payload: {
          desiredRole,
          desiredStatus,
          desiredExpiresIso,
          wantsBlocked,
          fullName,
        },
      });
    } catch (e) {
      failed++;
      await admin.from("import_job_rows").insert({
        job_id: job.id,
        row_number: rowNumber,
        email,
        status: "error",
        message: e instanceof Error ? e.message : "Erro",
        payload: raw,
      });
    }
  }

  await admin
    .from("import_jobs")
    .update({
      summary: {
        total: parsed.length,
        ok,
        failed,
        invited,
        updated,
      },
    })
    .eq("id", job.id);

  await audit({
    actorUserId: user.id,
    action: "import_users_csv",
    payload: {
      job_id: job.id,
      total: parsed.length,
      ok,
      failed,
      invited,
      updated,
    },
  });

  revalidatePath("/admin/import");
  redirect(`/admin/import?job=${job.id}`);
}

type NotificationType = "info" | "warning" | "urgent";
type NotificationDeliveryMode = "now" | "schedule";

const NOTIFICATION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const NOTIFICATION_ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function normalizeNotificationType(raw: string | null | undefined): NotificationType {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "warning") return "warning";
  if (value === "urgent") return "urgent";
  return "info";
}

function normalizeNotificationDeliveryMode(
  raw: string | null | undefined
): NotificationDeliveryMode {
  const value = (raw ?? "").trim().toLowerCase();
  return value === "schedule" ? "schedule" : "now";
}

function sanitizeStorageFileName(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const base = trimmed.replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-");
  return base.slice(0, 120) || "image";
}

function normalizeOptionalHttpUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("URL de ação inválida");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL de ação deve usar http ou https");
  }
  return parsed.toString();
}

function extractAdminNotificationStoragePath(
  imageUrl: string | null | undefined
): string | null {
  const value = (imageUrl ?? "").trim();
  if (!value) return null;

  const marker = "/storage/v1/object/public/admin-notifications/";
  const idx = value.indexOf(marker);
  if (idx < 0) return null;

  const tail = value.slice(idx + marker.length);
  const path = tail.split("?")[0] ?? "";
  if (!path) return null;

  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

async function uploadAdminNotificationImage(params: {
  notificationId: string;
  file: File;
}) {
  if (!NOTIFICATION_ALLOWED_IMAGE_MIME.has(params.file.type)) {
    throw new Error("Imagem inválida. Formatos aceitos: JPG, PNG, WEBP");
  }
  if (params.file.size > NOTIFICATION_IMAGE_MAX_BYTES) {
    throw new Error("A imagem deve ter no máximo 5MB");
  }

  const admin = createAdminClient();
  const baseName = sanitizeStorageFileName(params.file.name || "image");
  const path = `admin/${params.notificationId}/${Date.now()}-${baseName}`;

  const uploadRes = await admin.storage
    .from("admin-notifications")
    .upload(path, params.file, {
      upsert: false,
      contentType: params.file.type,
    });

  if (uploadRes.error) {
    throw new Error(`Falha ao enviar imagem: ${uploadRes.error.message}`);
  }

  const { data: publicData } = admin.storage
    .from("admin-notifications")
    .getPublicUrl(path);

  const imageUrl = publicData.publicUrl;
  if (!imageUrl) {
    throw new Error("Falha ao gerar URL pública da imagem");
  }

  return {
    imageUrl,
    imageMimeType: params.file.type,
    imageSizeBytes: params.file.size,
  };
}

export async function adminCreateNotification(params: {
  title: string;
  body: string;
  type?: string | null;
  actionUrl?: string | null;
  deliveryMode?: string | null;
  scheduledAtIso?: string | null;
  expiresAtIso?: string | null;
  imageFile?: File | null;
  imageAlt?: string | null;
}) {
  const { user, supabase } = await requireAdmin();

  const title = params.title.trim();
  const body = params.body.trim();
  const type = normalizeNotificationType(params.type);
  const deliveryMode = normalizeNotificationDeliveryMode(params.deliveryMode);
  const actionUrl = normalizeOptionalHttpUrl(params.actionUrl);
  const imageAlt = (params.imageAlt ?? "").trim() || null;

  if (!title) throw new Error("Título é obrigatório");
  if (!body) throw new Error("Conteúdo é obrigatório");

  let scheduledAtIso: string | null = null;
  if (deliveryMode === "schedule") {
    const raw = (params.scheduledAtIso ?? "").trim();
    if (!raw) {
      throw new Error("Data/hora de agendamento é obrigatória");
    }
    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.getTime())) {
      throw new Error("Data/hora de agendamento inválida");
    }
    if (parsed.getTime() <= Date.now()) {
      throw new Error("Data/hora de agendamento deve estar no futuro");
    }
    scheduledAtIso = parsed.toISOString();
  }

  let expiresAtIso: string | null = null;
  const expiresRaw = (params.expiresAtIso ?? "").trim();
  if (expiresRaw) {
    const parsed = new Date(expiresRaw);
    if (!Number.isFinite(parsed.getTime())) {
      throw new Error("Data/hora de expiração inválida");
    }
    if (parsed.getTime() <= Date.now()) {
      throw new Error("Data/hora de expiração deve estar no futuro");
    }
    expiresAtIso = parsed.toISOString();
  }

  if (scheduledAtIso && expiresAtIso) {
    const scheduledMs = new Date(scheduledAtIso).getTime();
    const expiresMs = new Date(expiresAtIso).getTime();
    if (expiresMs <= scheduledMs) {
      throw new Error(
        "A expiração deve ser posterior ao horário de agendamento"
      );
    }
  }

  const admin = createAdminClient();
  const { data: inserted, error: insertError } = await admin
    .from("admin_notifications")
    .insert({
      title,
      body,
      type,
      action_url: actionUrl,
      status: "draft",
      created_by: user.id,
      image_alt: imageAlt,
      expires_at: expiresAtIso,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    throw new Error(insertError?.message ?? "Falha ao criar notificação");
  }

  const notificationId = inserted.id as string;

  const maybeImage = params.imageFile;
  if (maybeImage && maybeImage.size > 0) {
    const image = await uploadAdminNotificationImage({
      notificationId,
      file: maybeImage,
    });

    const { error: imageUpdateError } = await admin
      .from("admin_notifications")
      .update({
        image_url: image.imageUrl,
        image_mime_type: image.imageMimeType,
        image_size_bytes: image.imageSizeBytes,
        image_alt: imageAlt,
      })
      .eq("id", notificationId);

    if (imageUpdateError) {
      throw new Error(imageUpdateError.message);
    }
  }

  if (deliveryMode === "schedule") {
    const { error: scheduleError } = await supabase.rpc(
      "schedule_admin_notification",
      {
        p_notification_id: notificationId,
        p_scheduled_at: scheduledAtIso,
      }
    );
    if (scheduleError) {
      throw new Error(scheduleError.message);
    }
  } else {
    const { error: publishError } = await supabase.rpc(
      "publish_admin_notification",
      {
        p_notification_id: notificationId,
      }
    );
    if (publishError) {
      throw new Error(publishError.message);
    }
  }

  await audit({
    actorUserId: user.id,
    action: "admin_notification_create",
    payload: {
      notification_id: notificationId,
      title,
      type,
      delivery_mode: deliveryMode,
      scheduled_at: scheduledAtIso,
      expires_at: expiresAtIso,
      has_image: Boolean(maybeImage && maybeImage.size > 0),
    },
  });

  revalidatePath("/admin/notifications");
  revalidatePath("/dashboard");

  return { notificationId };
}

export async function adminPublishNotification(notificationId: string) {
  const { user, supabase } = await requireAdmin();
  const id = notificationId.trim();
  if (!id) throw new Error("Notificação inválida");

  const { data, error } = await supabase.rpc("publish_admin_notification", {
    p_notification_id: id,
  });

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      "Não foi possível publicar esta notificação (talvez já enviada, cancelada ou expirada)."
    );
  }

  await audit({
    actorUserId: user.id,
    action: "admin_notification_publish",
    payload: { notification_id: id },
  });

  revalidatePath("/admin/notifications");
  revalidatePath("/dashboard");
}

export async function adminCancelNotification(notificationId: string) {
  const { user, supabase } = await requireAdmin();
  const id = notificationId.trim();
  if (!id) throw new Error("Notificação inválida");

  const { error } = await supabase.rpc("cancel_admin_notification", {
    p_notification_id: id,
  });

  if (error) throw new Error(error.message);

  await audit({
    actorUserId: user.id,
    action: "admin_notification_cancel",
    payload: { notification_id: id },
  });

  revalidatePath("/admin/notifications");
}

export async function adminDeleteNotification(notificationId: string) {
  const { user } = await requireAdmin();
  const id = notificationId.trim();
  if (!id) throw new Error("Notificação inválida");

  const admin = createAdminClient();

  const { data: existing, error: fetchError } = await admin
    .from("admin_notifications")
    .select("id, status, image_url")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!existing?.id) throw new Error("Notificação não encontrada");

  const storagePath = extractAdminNotificationStoragePath(
    (existing.image_url as string | null) ?? null
  );
  if (storagePath) {
    try {
      await admin.storage.from("admin-notifications").remove([storagePath]);
    } catch {
      // best-effort: a notificação ainda será removida do banco.
    }
  }

  const { error: deleteError } = await admin
    .from("admin_notifications")
    .delete()
    .eq("id", id);

  if (deleteError) throw new Error(deleteError.message);

  await audit({
    actorUserId: user.id,
    action: "admin_notification_delete",
    payload: {
      notification_id: id,
      status: existing.status ?? null,
    },
  });

  revalidatePath("/admin/notifications");
  revalidatePath("/dashboard");
}

export async function adminApplyBulkNotificationAction(params: {
  action: string;
  notificationIds: string[];
}) {
  const { user, supabase } = await requireAdmin();

  const action = (params.action ?? "").trim().toLowerCase();
  const allowedActions = new Set(["publish", "cancel", "delete"]);
  if (!allowedActions.has(action)) {
    throw new Error("Ação em massa inválida");
  }

  const ids = Array.from(
    new Set(
      (params.notificationIds ?? [])
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );

  if (ids.length === 0) {
    throw new Error("Selecione ao menos uma notificação");
  }

  if (ids.length > 300) {
    throw new Error("Selecione no máximo 300 notificações por vez");
  }

  let ok = 0;
  let failed = 0;

  if (action === "publish") {
    for (const id of ids) {
      const { data, error } = await supabase.rpc("publish_admin_notification", {
        p_notification_id: id,
      });
      if (error || !data) failed++;
      else ok++;
    }
  } else if (action === "cancel") {
    for (const id of ids) {
      const { data, error } = await supabase.rpc("cancel_admin_notification", {
        p_notification_id: id,
      });
      if (error || !data) failed++;
      else ok++;
    }
  } else {
    // Bulk delete with best-effort storage cleanup.
    const admin = createAdminClient();

    const { data: existing, error: fetchError } = await admin
      .from("admin_notifications")
      .select("id, image_url")
      .in("id", ids);

    if (fetchError) throw new Error(fetchError.message);

    const byId = new Map(
      ((existing ?? []) as Array<{ id: string; image_url: string | null }>).map(
        (row) => [row.id, row]
      )
    );
    const existingIds = ids.filter((id) => byId.has(id));

    if (existingIds.length === 0) {
      throw new Error("Nenhuma notificação válida selecionada");
    }

    const paths = existingIds
      .map((id) => extractAdminNotificationStoragePath(byId.get(id)?.image_url))
      .filter((value): value is string => Boolean(value));
    if (paths.length > 0) {
      try {
        await admin.storage.from("admin-notifications").remove(paths);
      } catch {
        // best-effort only
      }
    }

    const { error: deleteError } = await admin
      .from("admin_notifications")
      .delete()
      .in("id", existingIds);

    if (deleteError) throw new Error(deleteError.message);

    ok = existingIds.length;
    failed = ids.length - ok;
  }

  await audit({
    actorUserId: user.id,
    action: "admin_notification_bulk_action",
    payload: {
      bulk_action: action,
      requested: ids.length,
      ok,
      failed,
    },
  });

  revalidatePath("/admin/notifications");
  revalidatePath("/dashboard");

  return { action, requested: ids.length, ok, failed };
}

export async function adminSetSupportWhatsappUrl(rawUrl: string) {
  const { user, supabase } = await requireAdmin();

  const normalizedUrl = normalizeHttpUrl(rawUrl);
  if (!normalizedUrl) {
    throw new Error("URL de suporte inválida");
  }

  const { error } = await supabase.from("app_settings").upsert(
    {
      key: SUPPORT_WHATSAPP_URL_SETTING_KEY,
      value: normalizedUrl,
      is_public: true,
      updated_by: user.id,
    },
    {
      onConflict: "key",
    }
  );
  if (error) throw new Error(error.message);

  await audit({
    actorUserId: user.id,
    action: "app_setting_update",
    payload: {
      key: SUPPORT_WHATSAPP_URL_SETTING_KEY,
      value: normalizedUrl,
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}
