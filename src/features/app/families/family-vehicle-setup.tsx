import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as UI from "@/ui/elements";
import { AddVehicleForm } from "../driver-form";
import { OutcomeFocus } from "../outcome-focus";

export function FamilyVehicleSetup({
  userId,
  familyId,
}: {
  userId: string;
  familyId: string;
}) {
  const [skipped, setSkipped] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ["account", userId, "family-has-active-vehicle", familyId];
  const { data, isError, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const { data, error } = await createClient()
        .rpc("family_has_active_vehicle", { p_family_id: familyId })
        .abortSignal(signal);
      if (error) throw new Error("Car setup could not be checked.");
      return data;
    },
  });

  useFocusEffect(
    useCallback(() => {
      void refetch();
      return () => {
        setSkipped(false);
        setAdding(false);
        setSaved(false);
      };
    }, [refetch]),
  );

  if (saved) {
    return (
      <OutcomeFocus state={{ message: "Car added" }}>
        <UI.Paragraph role="status">Car added</UI.Paragraph>
      </OutcomeFocus>
    );
  }
  if (skipped) return null;
  if (isError && !adding) {
    return (
      <UI.Box>
        <UI.Paragraph role="alert">Car setup could not be checked.</UI.Paragraph>
        <UI.Button onPress={() => void refetch()}>Retry car setup</UI.Button>
      </UI.Box>
    );
  }
  if (!adding && (data !== false || isFetching)) return null;

  return (
    <UI.Section className="panel">
      <UI.Paragraph>Add the car you usually drive.</UI.Paragraph>
      {adding ? (
        <AddVehicleForm
          onVehicleSaved={async () => {
            await queryClient.cancelQueries({ queryKey, exact: true });
            queryClient.setQueryData(queryKey, true);
            setAdding(false);
            setSaved(true);
          }}
        />
      ) : (
        <UI.Button onPress={() => setAdding(true)}>Add your car</UI.Button>
      )}
      <UI.Button
        onPress={() => {
          setAdding(false);
          setSkipped(true);
        }}
      >
        Skip
      </UI.Button>
    </UI.Section>
  );
}
