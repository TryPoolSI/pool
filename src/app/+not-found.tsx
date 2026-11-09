import { AuthShell } from "@/ui/shell";
import { Heading1, Paragraph } from "@/ui/elements";
import Link from "@/ui/link";
export default function Missing() {
  return (
    <AuthShell>
      <Heading1>Page unavailable</Heading1>
      <Paragraph>This page could not be found.</Paragraph>
      <Link href="/app">Open Pool</Link>
    </AuthShell>
  );
}
