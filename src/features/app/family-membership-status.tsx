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
        <UI.Paragraph role="alert">
          Pool couldn’t load your family. Check your connection and try again.
        </UI.Paragraph>
        <UI.Button onPress={() => void membership.refetch()}>
          Try again
        </UI.Button>
      </>
    );
  if (membership.isFetching || membership.isPending) return <UI.Loading />;
  return null;
}
