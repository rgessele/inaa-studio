"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
