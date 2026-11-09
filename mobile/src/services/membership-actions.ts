import { Fields, type CommandInput } from "./fields";

import { revalidatePath } from "@/services/cache";
import { createClient } from "@/lib/supabase/client";
import { verifiedUser } from "@/lib/auth/identity";
import {
  membershipError,
  requiredText,
  uuid,
  type MembershipState,
} from "@/lib/membership";

async function executeMembership(
  _previous: MembershipState,
  data: Fields,
): Promise<MembershipState> {
  const client = await createClient();
  if (!(await verifiedUser(client))) return { error: membershipError("PT401") };
  // Every hidden field and previous state is untrusted. RPCs repeat authority
  // checks for callers that bypass these actions. Never log bearer tokens.
  try {
    const command = requiredText(data, "command");
    let result: { data: unknown; error: { code: string } | null };
    let path: string | undefined;
    switch (command) {
      case "create-family":
        result = await client.rpc("create_family", {
          p_name: requiredText(data, "name"),
          p_display_name: requiredText(data, "display_name"),
        });
        if (!result.error) path = `/app/families/${result.data}`;
        break;
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
          !["guardian", "circle"].includes(kind) ||
          !/^[a-f0-9]{64}$/.test(token)
        )
          throw new Error("validation");
        if (command === "preview-invitation") {
          const preview = await client.rpc("invitation_preview", {
            p_kind: kind,
            p_token: token,
          });
          if (preview.error)
            return { error: membershipError(preview.error.code) };
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
        result = await client.rpc("accept_invitation", {
          p_kind: kind,
          p_token: token,
          p_display_name: requiredText(data, "display_name"),
          ...(familyChoice === "new"
            ? { p_new_family_name: requiredText(data, "name") }
            : familyChoice
              ? { p_family_id: uuid(data, "family_choice") }
              : {}),
        });
        if (!result.error) path = `/app/families/${result.data}`;
        if (result.error) return { error: membershipError(result.error.code) };
        revalidatePath("/app", "layout");
        return {
          message:
            "Membership accepted. Open your family to see the saved result.",
          path,
        };
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
    if (result.error) return { error: membershipError(result.error.code) };
    revalidatePath("/app", "layout");
    return { message: "Saved. Membership is up to date.", path };
  } catch (error) {
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
  previous: Record<string, unknown>,
  input: CommandInput,
) {
  return executeMembership(previous, new Fields(input));
}
