import { Redirect, useLocalSearchParams } from "expo-router";
import { FamilyMembershipStatus } from "@/features/app/family-membership-status";
import { familyPath, useActiveFamily } from "@/services/active-family";
import { Heading1, Paragraph } from "@/ui/elements";
import Link from "@/ui/link";

export default function LegacyChildrenRoute() {
  const { family: requestedId } = useLocalSearchParams();
  const membership = useActiveFamily();
  if (membership.isPending || membership.isFetching || membership.isError)
    return <FamilyMembershipStatus membership={membership} />;
  const family = membership.data;
  if (!family) return <Redirect href="/app/profile" />;

  if (
    typeof requestedId === "string" &&
    /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestedId) &&
    requestedId.toLowerCase() !== family.id
  )
    return (
      <>
        <Heading1>Family unavailable</Heading1>
        <Paragraph>This family is unavailable to your account.</Paragraph>
        <Link href={familyPath(family.id)}>Open My family</Link>
      </>
    );

  return <Redirect href={familyPath(family.id)} />;
}
