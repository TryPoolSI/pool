import * as UI from "@/ui/elements";
import type { useActiveFamily } from "@/services/active-family";

export function FamilyMembershipStatus({
  membership,
}: {
  membership: ReturnType<typeof useActiveFamily>;
}) {
  if (membership.isError)
    return (
      <>
        <UI.Paragraph role="alert">{membership.error.message}</UI.Paragraph>
        <UI.Button onPress={() => void membership.refetch()}>
          Retry membership
        </UI.Button>
      </>
    );
  if (membership.isFetching || membership.isPending)
    return (
      <UI.Paragraph role="status">
        Checking your family membership…
      </UI.Paragraph>
    );
  return null;
}
