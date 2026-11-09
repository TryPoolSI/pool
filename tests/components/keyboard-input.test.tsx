import { render, screen, fireEvent } from "@testing-library/react-native";
import { Button, Field, Form, Label } from "@/ui/elements";

test("native keyboard Done retains the draft until the explicit save action", async () => {
  const save = jest.fn();
  await render(
    <Form onValues={save}>
      <Label>
        Vehicle label
        <Field name="label" required />
      </Label>
      <Button type="submit">Save vehicle</Button>
    </Form>,
  );
  const input = screen.getByLabelText("Vehicle label");
  await fireEvent.changeText(input, "Native van");
  await fireEvent(input, "submitEditing");
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("Native van")).toBeTruthy();
  await fireEvent.press(screen.getByText("Save vehicle"));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith({ label: "Native van" });
});
