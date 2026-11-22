import { AuthShell } from "@/ui/shell";
import { Heading1, Paragraph } from "@/ui/elements";
import Link from "@/ui/link";
export default function Missing() {
  return (
    <AuthShell>
      <Heading1>Page not found</Heading1>
      <Paragraph>That link doesn’t lead anywhere in Pool.</Paragraph>
      <Link className="button primary" href="/app">
        Go to Pool
      </Link>
    </AuthShell>
  );
}
