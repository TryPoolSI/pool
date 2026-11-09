import { newRequestId } from "@/lib/request-id";
import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import { PageHeading, ActionDialog, Avatar } from "../presentation";
import Link from "@/ui/link";
import { createClient } from "@/lib/supabase/client";
import { RideForm, SeatField } from "../ride-form";
async function loadChildrenPage({
  searchParams,
}: {
  searchParams: Promise<{ family?: string }>;
}) {
  const query = await searchParams;
  const client = await createClient();
  const families = await client
    .from("families")
    .select("id,name")
    .order("name");
  if (families.error) throw new Error("Families could not be loaded");
  const family =
    families.data.find((item) => item.id === query.family) ??
    (!query.family ? families.data[0] : undefined);
  if (!family)
    return {
      early: (
        <>
          <UI.Heading1>Child setup</UI.Heading1>
          <UI.Paragraph>
            Select one of your families or create a family first.
          </UI.Paragraph>
          <Link href="/app">Families and circles</Link>
        </>
      ),
    };
  const children = await client
    .from("children")
    .select("*")
    .eq("family_id", family.id)
    .order("display_name");
  if (children.error) throw new Error("Children could not be loaded");
  return { model: { families, family, children } };
}

const ChildrenPage = createScreen(
  loadChildrenPage,
  ({ families, family, children }) => (
    <>
      <PageHeading title="Your children">{family.name}</PageHeading>
      {families.data.length > 1 && (
        <UI.Nav aria-label="Choose family">
          {families.data.map((item) => (
            <Link key={item.id} href={`/app/children?family=${item.id}`}>
              {item.name}
            </Link>
          ))}
        </UI.Nav>
      )}
      <UI.Box className="people-grid">
        {children.data.length ? (
          children.data.map((child) => (
            <UI.Section className="person-card" key={child.id}>
              <Avatar name={child.display_name} />
              <UI.Heading2>{child.display_name}</UI.Heading2>
              <UI.Paragraph>
                {child.seat_requirement === "booster"
                  ? "Booster seat"
                  : child.seat_requirement === "child-seat"
                    ? "Child seat"
                    : "Standard passenger seat"}
              </UI.Paragraph>
              <ActionDialog title={`Edit ${child.display_name}`}>
                <UI.Paragraph>
                  Changes apply to future enrollment. Re-save riders on an
                  existing ride to update its details.
                </UI.Paragraph>
                <RideForm
                  command="saveOwnChild"
                  fields={{
                    family_id: family.id,
                    child_id: child.id,
                    revision: String(child.revision),
                  }}
                  label="Update child"
                >
                  <UI.Label>
                    Child display name
                    <UI.Field
                      name="display_name"
                      defaultValue={child.display_name}
                      required
                      maxLength={80}
                    />
                  </UI.Label>
                  <SeatField value={child.seat_requirement} />
                </RideForm>
              </ActionDialog>
            </UI.Section>
          ))
        ) : (
          <UI.Paragraph>No children saved for this family.</UI.Paragraph>
        )}
      </UI.Box>
      <ActionDialog
        title="Add a child"
        tone="primary"
        inline={!children.data.length}
      >
        <RideForm
          key={family.id}
          command="saveOwnChild"
          fields={{
            family_id: family.id,
            child_id: newRequestId(),
            revision: "0",
          }}
          label="Save child"
        >
          <UI.Label>
            Child display name
            <UI.Field name="display_name" required maxLength={80} />
          </UI.Label>
          <SeatField />
        </RideForm>
      </ActionDialog>
    </>
  ),
);
export default ChildrenPage;
