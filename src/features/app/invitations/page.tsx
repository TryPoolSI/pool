import * as UI from "@/ui/elements";
import { useActiveFamily } from "@/services/active-family";
import { FamilyMembershipStatus } from "../family-membership-status";
import { AcceptInvitation } from "./accept-form";

export default function InvitationsPage() {
  const membership = useActiveFamily();
  return (
    <>
      <UI.Heading1>Accept an invitation</UI.Heading1>
      <FamilyMembershipStatus membership={membership} />
      <AcceptInvitation
        family={membership.data}
        membershipReady={membership.isSuccess && !membership.isFetching}
      />
    </>
  );
}
