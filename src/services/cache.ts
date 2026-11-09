import { QueryClient } from "@tanstack/react-query";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 15_000,
      gcTime: 300_000,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false, networkMode: "always" },
  },
});
export function revalidatePath(_path = "/app", _kind?: string) {
  void queryClient.invalidateQueries({ queryKey: ["account"] });
}
