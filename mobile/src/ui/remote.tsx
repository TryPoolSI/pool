import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, usePathname, router } from "expo-router";
import { useEffect, type ReactNode } from "react";
import { Navigation, Unavailable } from "@/lib/navigation";
import { useSession } from "@/services/session";
import { Button, Paragraph, Box, Heading1 } from "./elements";
import { SessionProblem } from "./session-problem";
function useRemote<Props extends object, Result>(
  name: string,
  props: Props,
  load: (props: Props) => Promise<Result>,
  retain = false,
) {
  const { user, ready, error } = useSession();
  const query = useQuery({
    queryKey: ["account", user?.id ?? "public", name, props],
    queryFn: () => load(props),
    enabled: ready && !error,
    retry: false,
    placeholderData: retain ? keepPreviousData : undefined,
  });
  useEffect(() => {
    if (query.error instanceof Navigation)
      router.replace(query.error.target as never);
  }, [query.error]);
  return query;
}
export function createScreen<
  Props,
  Result extends { model?: unknown; early?: ReactNode },
>(
  load: (props: Props) => Promise<Result>,
  render: (model: NonNullable<Result["model"]>) => ReactNode,
) {
  return function Screen() {
    const session = useSession();
    const params = useLocalSearchParams<Record<string, string>>();
    const pathname = usePathname();
    const result = useRemote(pathname, params, async (values) =>
      load({
        params: Promise.resolve(values),
        searchParams: Promise.resolve(values),
      } as Props),
    );
    if (session.error) return <SessionProblem />;
    if (result.error instanceof Unavailable)
      return (
        <Box>
          <Heading1>Membership unavailable</Heading1>
          <Paragraph>{result.error.message}</Paragraph>
        </Box>
      );
    if (result.error && !result.data)
      return (
        <Box>
          <Paragraph role="alert">
            {result.error instanceof Navigation
              ? "Opening your account…"
              : result.error.message}
          </Paragraph>
          <Button onPress={() => result.refetch()}>Try again</Button>
        </Box>
      );
    if (!result.data)
      return (
        <Paragraph role="status">Loading your current information…</Paragraph>
      );
    const content =
      "early" in result.data
        ? result.data.early
        : render(result.data.model as NonNullable<Result["model"]>);
    return (
      <>
        {result.error && <RefreshError retry={() => result.refetch()} />}
        {content}
      </>
    );
  };
}
export function createPanel<
  Props extends object,
  Result extends { model?: unknown; early?: ReactNode },
>(
  cacheKey: string,
  load: (props: Props) => Promise<Result>,
  render: (model: NonNullable<Result["model"]>) => ReactNode,
) {
  return function Panel(props: Props) {
    const session = useSession();
    const result = useRemote(cacheKey, props, load, true);
    if (session.error) return <SessionProblem />;
    if (result.error instanceof Unavailable)
      return <Paragraph role="alert">{result.error.message}</Paragraph>;
    if (result.error && !result.data)
      return (
        <Box>
          <Paragraph role="alert">{result.error.message}</Paragraph>
          <Button onPress={() => result.refetch()}>Retry this section</Button>
        </Box>
      );
    if (!result.data) return <Paragraph>Loading details…</Paragraph>;
    const content =
      "early" in result.data
        ? result.data.early
        : render(result.data.model as NonNullable<Result["model"]>);
    return (
      <>
        {result.error && <RefreshError retry={() => result.refetch()} />}
        {content}
      </>
    );
  };
}
function RefreshError({ retry }: { retry: () => unknown }) {
  return (
    <Box>
      <Paragraph role="alert">
        Current data could not be refreshed. Displayed information may be out of
        date. Your draft is still here.
      </Paragraph>
      <Button
        onPress={() => {
          void retry();
        }}
      >
        Retry refresh
      </Button>
    </Box>
  );
}
