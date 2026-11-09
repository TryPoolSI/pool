import { useSession } from "@/services/session";
import { Box, Button, Paragraph } from "./elements";

export function SessionProblem() {
  const { error, retry } = useSession();
  return (
    <Box>
      <Paragraph role="alert">{error}</Paragraph>
      <Button onPress={retry}>Retry session</Button>
    </Box>
  );
}
