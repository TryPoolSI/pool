import { Fields, type CommandInput } from "./fields";

import { queryClient, revalidatePath } from "@/services/cache";
import { familyPath, loadActiveFamily } from "@/services/active-family";
import { forgetInvitation } from "@/services/invitation-link";
import { createClient } from "@/lib/supabase/client";
import { verifiedUser } from "@/lib/auth/identity";
import {
  membershipError,
  requiredText,
  uuid,
  type MembershipState,
} from "@/lib/membership";

async function refreshMembership(userId: string) {
  const account = { queryKey: ["account", userId] };
  await queryClient.cancelQueries(account);
  void queryClient.invalidateQueries(account);
}

function invitationError(
  code: string,
  reason?: string,
  kind?: "guardian" | "circle",
): MembershipState {
  return {
    error: membershipError(code, reason, kind),
    ...(code === "PT404" ? { issue: "invite-unavailable" } : {}),
    ...(code === "PT409" && reason === "active_family_exists"
      ? { issue: "active-family" }
      : {}),
  };
}

async function executeMembership(
  previous: MembershipState,
  data: Fields,
): Promise<MembershipState> {
  const client = await createClient();
  // Every hidden field and previous state is untrusted. RPCs repeat authority
  // checks for callers that bypass these actions. Never log bearer tokens.
  const command = data.get("command");
  const familyWrite =
    command === "create-family" || command === "accept-invitation";
  const checkBeforeRetry: MembershipState = {
    error:
      "Pool could not confirm the result. Check your current family before trying again.",
    issue: "retry-membership",
  };
  const user = await verifiedUser(client).catch(() => null);
  if (!user) return { error: membershipError("PT401"), issue: previous.issue };
  try {
    if (familyWrite && previous.issue === "retry-membership") {
      const current = await loadActiveFamily(client, user.id);
      if (current && command === "create-family") {
        await refreshMembership(user.id);
        return {
          error: membershipError("PT409", "active_family_exists"),
          issue: "active-family",
        };
      }
    }
    let result: {
      data: unknown;
      error: { code: string; message: string } | null;
    };
    let path: string | undefined;
    switch (command) {
      case "create-family": {
        const created = await client.rpc("create_family", {
          p_name: requiredText(data, "name"),
          p_display_name: requiredText(data, "display_name"),
        });
        if (
          created.error?.code === "PT409" &&
          created.error.message === "active_family_exists"
        ) {
          await refreshMembership(user.id);
          return {
            error: membershipError(created.error.code, created.error.message),
            issue: "active-family",
          };
        }
        if (!created.error) {
          await refreshMembership(user.id);
          return { path: familyPath(created.data) };
        }
        result = created;
        break;
      }
      case "create-circle":
        result = await client.rpc("create_circle", {
          p_family_id: uuid(data, "family_id"),
          p_name: requiredText(data, "name"),
        });
        if (!result.error) path = `/app/circles/${result.data}`;
        break;
      case "create-invitation": {
        const kind = requiredText(data, "kind");
        if (!["guardian", "circle"].includes(kind))
          throw new Error("validation");
        const invitation = await client.rpc("create_invitation", {
          p_kind: kind,
          p_scope_id: uuid(data, "scope_id"),
          p_email: requiredText(data, "email", 254),
        });
        if (invitation.error)
          return { error: membershipError(invitation.error.code) };
        revalidatePath("/app", "layout");
        return {
          token: invitation.data[0].token,
          kind,
          message:
            "Invitation created. Copy the link and deliver it manually. It expires in seven days.",
        };
      }
      case "preview-invitation":
      case "accept-invitation": {
        const kind = requiredText(data, "kind");
        const token = requiredText(data, "token", 64);
        if (
          (kind !== "guardian" && kind !== "circle") ||
          !/^[a-f0-9]{64}$/.test(token)
        )
          throw new Error("validation");
        if (command === "preview-invitation") {
          const preview = await client.rpc("invitation_preview", {
            p_kind: kind,
            p_token: token,
          });
          if (preview.error) return invitationError(preview.error.code);
          return {
            preview: {
              name: preview.data[0].scope_name,
              expires: preview.data[0].expires_at,
            },
          };
        }
        if (data.get("accept") !== "yes") throw new Error("validation");
        const familyChoice =
          kind === "circle" ? requiredText(data, "family_choice") : null;
        const accepted = await client.rpc("accept_invitation", {
          p_kind: kind,
          p_token: token,
          p_display_name: requiredText(data, "display_name"),
          ...(familyChoice === "new"
            ? { p_new_family_name: requiredText(data, "name") }
            : familyChoice
              ? { p_family_id: uuid(data, "family_choice") }
              : {}),
        });
        if (accepted.error) {
          if (!accepted.error.code) {
            await refreshMembership(user.id);
            return checkBeforeRetry;
          }
          if (accepted.error.code === "PT409") await refreshMembership(user.id);
          return invitationError(
            accepted.error.code,
            accepted.error.message,
            kind,
          );
        }
        await refreshMembership(user.id);
        void forgetInvitation(token).catch(() => {});
        return { path: familyPath(accepted.data) };
      }
      case "revoke-invitation":
        result = await client.rpc("revoke_invitation", {
          p_id: uuid(data, "invitation_id"),
        });
        break;
      case "remove-guardian":
        if (data.get("confirm") !== "yes") throw new Error("validation");
        result = await client.rpc("remove_family_member", {
          p_family_id: uuid(data, "family_id"),
          p_user_id: uuid(data, "user_id"),
        });
        break;
      case "remove-family":
        if (data.get("confirm") !== "yes") throw new Error("validation");
        result = await client.rpc("remove_circle_family", {
          p_circle_id: uuid(data, "circle_id"),
          p_family_id: uuid(data, "family_id"),
        });
        break;
      default:
        throw new Error("validation");
    }
    if (result.error) {
      if (familyWrite && !result.error.code) {
        await refreshMembership(user.id);
        return checkBeforeRetry;
      }
      return {
        error: membershipError(result.error.code, result.error.message),
      };
    }
    revalidatePath("/app", "layout");
    return { message: "Saved. Membership is up to date.", path };
  } catch (error) {
    if (
      familyWrite &&
      !(error instanceof Error && error.message === "validation")
    ) {
      await refreshMembership(user.id);
      return checkBeforeRetry;
    }
    return {
      error: membershipError(
        error instanceof Error && error.message === "validation"
          ? "PT400"
          : "unknown",
      ),
    };
  }
}

export function membershipAction(
  previous: MembershipState,
  input: CommandInput,
) {
  return executeMembership(previous, new Fields(input));
}
