import { useActiveFamily } from "@/services/active-family";
import { PageHeading } from "../presentation";
import { FamilyMembershipStatus } from "../family-membership-status";
import { AcceptInvitation } from "./accept-form";

export default function InvitationsPage() {
  const membership = useActiveFamily();
  return (
    <>
      <PageHeading title="Accept an invitation" />
      {membership.isError && <FamilyMembershipStatus membership={membership} />}
      <AcceptInvitation
        family={membership.data}
        membershipReady={membership.isSuccess && !membership.isFetching}
      />
    </>
  );
}
