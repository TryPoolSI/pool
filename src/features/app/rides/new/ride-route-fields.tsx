import { useState } from "react";
import { newRequestId } from "@/lib/request-id";
import {
  saveRoute,
  useSavedRoutes,
  type RouteLocations,
} from "@/services/saved-routes";
import { CommandForm } from "@/ui/command-form";
import * as UI from "@/ui/elements";
import { ActionDialog } from "../../presentation";

const initialLocations: RouteLocations = {
  pickup_summary: "",
  destination_summary: "",
  pickup: "",
  destination: "",
};

function SaveRouteForm({
  familyId,
  locations,
}: {
  familyId: string;
  locations: RouteLocations;
}) {
  const [saved, setSaved] = useState(false);
  const [requestId] = useState(newRequestId);
  return (
    <CommandForm
      label="Save route"
      fields={{ family_id: familyId, request_id: requestId }}
      action={(fields) => saveRoute({ ...fields, ...locations })}
      disabled={saved}
      onResult={(result) => {
        if (!result.error) setSaved(true);
      }}
    >
      <UI.Label>
        Route name
        <UI.Field
          name="route_name"
          required
          maxLength={80}
          placeholder="School → Soccer"
        />
      </UI.Label>
    </CommandForm>
  );
}

export function RideRouteFields({ familyId }: { familyId: string }) {
  const routes = useSavedRoutes(familyId);
  const [locations, setLocations] = useState(initialLocations);
  const [selectedRoute, setSelectedRoute] = useState("");
  const savedRoutes =
    routes.isFetchedAfterMount && !routes.isError ? (routes.data ?? []) : [];

  function updateLocation(name: keyof RouteLocations, value: string) {
    setLocations((current) => ({ ...current, [name]: value }));
    setSelectedRoute("");
  }

  function applyRoute(id: string) {
    const route = savedRoutes.find((item) => item.id === id);
    if (!route) return;
    const { pickup_summary, destination_summary, pickup, destination } = route;
    setLocations({ pickup_summary, destination_summary, pickup, destination });
    setSelectedRoute(id);
  }

  return (
    <UI.Box className="form-section">
      <UI.Heading2>Route</UI.Heading2>
      {savedRoutes.length > 0 && (
        <UI.Label>
          Use a saved route
          <UI.Select
            name="saved_route"
            value={selectedRoute}
            onChange={({ target }) => applyRoute(target.value)}
          >
            <UI.Option value="" disabled>
              Choose a route
            </UI.Option>
            {savedRoutes.map((route) => (
              <UI.Option key={route.id} value={route.id}>
                {route.name}
              </UI.Option>
            ))}
          </UI.Select>
        </UI.Label>
      )}
      {routes.isError && (
        <UI.Box>
          <UI.Paragraph role="alert">
            Saved routes could not be loaded.
          </UI.Paragraph>
          <UI.Button onPress={() => void routes.refetch()}>
            Retry saved routes
          </UI.Button>
        </UI.Box>
      )}
      <UI.Label>
        Travel direction
        <UI.Select name="direction" required>
          <UI.Option value="outbound">Outbound</UI.Option>
          <UI.Option value="return">Return</UI.Option>
        </UI.Select>
      </UI.Label>
      <UI.Paragraph>
        Use general place names in the summaries. Invited families can see them
        before joining.
      </UI.Paragraph>
      <UI.Box className="form-pair">
        <UI.Label>
          Pickup summary
          <UI.Field
            name="pickup_summary"
            value={locations.pickup_summary}
            onChange={({ target }) =>
              updateLocation("pickup_summary", target.value)
            }
            required
            maxLength={80}
            placeholder="Neighborhood meeting area"
          />
        </UI.Label>
        <UI.Label>
          Drop-off summary
          <UI.Field
            name="destination_summary"
            value={locations.destination_summary}
            onChange={({ target }) =>
              updateLocation("destination_summary", target.value)
            }
            required
            maxLength={80}
            placeholder="Activity area"
          />
        </UI.Label>
      </UI.Box>
      <UI.Paragraph>
        Exact locations stay with participating families and the confirmed driver.
      </UI.Paragraph>
      <UI.Box className="form-pair">
        <UI.Label>
          Exact pickup
          <UI.Field
            name="pickup"
            value={locations.pickup}
            onChange={({ target }) => updateLocation("pickup", target.value)}
            required
            maxLength={300}
          />
        </UI.Label>
        <UI.Label>
          Exact drop-off
          <UI.Field
            name="destination"
            value={locations.destination}
            onChange={({ target }) => updateLocation("destination", target.value)}
            required
            maxLength={300}
          />
        </UI.Label>
      </UI.Box>
      <ActionDialog title="Save route" triggerStyle={{ alignSelf: "flex-start" }}>
        <SaveRouteForm familyId={familyId} locations={locations} />
      </ActionDialog>
    </UI.Box>
  );
}
