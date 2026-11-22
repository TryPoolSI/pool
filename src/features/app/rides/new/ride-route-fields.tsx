import { useState } from "react";
import { newRequestId } from "@/lib/request-id";
import {
  saveRoute,
  useSavedRoutes,
  type RouteLocations,
} from "@/services/saved-routes";
import { CommandForm } from "@/ui/command-form";
import * as UI from "@/ui/elements";
import { ActionDialog, Disclosure } from "../../presentation";

// Hidden for live demos; set EXPO_PUBLIC_SHOW_SAVE_ROUTE=true to show it.
const showSaveRoute = process.env.EXPO_PUBLIC_SHOW_SAVE_ROUTE === "true";

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
  const [requestId] = useState(newRequestId);
  return (
    <CommandForm
      label="Save route"
      fields={{ family_id: familyId, request_id: requestId }}
      action={(fields) =>
        saveRoute({
          ...fields,
          ...locations,
          pickup: locations.pickup || locations.pickup_summary,
          destination: locations.destination || locations.destination_summary,
        })
      }
    >
      <UI.Label>
        Route name
        <UI.Field
          name="route_name"
          required
          maxLength={80}
          placeholder="School to soccer"
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
  const canSave = Boolean(
    locations.pickup_summary.trim() && locations.destination_summary.trim(),
  );

  return (
    <UI.Box className="form-section">
      <UI.Heading2>Where</UI.Heading2>
      {savedRoutes.length > 0 && (
        <UI.Label>
          Saved route
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
      <UI.Label>
        From
        <UI.Field
          name="pickup_summary"
          value={locations.pickup_summary}
          onChange={({ target }) =>
            updateLocation("pickup_summary", target.value)
          }
          required
          maxLength={80}
          placeholder="Maple Street corner"
        />
      </UI.Label>
      <UI.Label>
        To
        <UI.Field
          name="destination_summary"
          value={locations.destination_summary}
          onChange={({ target }) =>
            updateLocation("destination_summary", target.value)
          }
          required
          maxLength={80}
          placeholder="Lincoln Elementary"
        />
      </UI.Label>
      <UI.Paragraph>
        Use place names. Invited families see these before they join.
      </UI.Paragraph>
      <UI.Label>
        Direction
        <UI.Choice
          name="direction"
          options={[
            { value: "outbound", label: "Outbound" },
            { value: "return", label: "Return" },
          ]}
        />
      </UI.Label>
      {/* Registered even while the disclosure is closed, so typed addresses
          are never dropped. Empty means "same as the place name". */}
      <UI.Field type="hidden" name="pickup" value={locations.pickup} />
      <UI.Field type="hidden" name="destination" value={locations.destination} />
      <Disclosure title="Add exact addresses">
        <UI.Paragraph>
          Optional. Only families on the ride and the driver see these.
        </UI.Paragraph>
        <UI.Label>
          Pickup address
          <UI.Field
            value={locations.pickup}
            onChange={({ target }) => updateLocation("pickup", target.value)}
            maxLength={300}
            autoComplete="off"
          />
        </UI.Label>
        <UI.Label>
          Drop-off address
          <UI.Field
            value={locations.destination}
            onChange={({ target }) =>
              updateLocation("destination", target.value)
            }
            maxLength={300}
            autoComplete="off"
          />
        </UI.Label>
      </Disclosure>
      {showSaveRoute && canSave ? (
        <ActionDialog
          title="Save this route"
          tone="quiet"
          triggerStyle={{ paddingHorizontal: 0, alignSelf: "flex-start" }}
        >
          <SaveRouteForm familyId={familyId} locations={locations} />
        </ActionDialog>
      ) : null}
    </UI.Box>
  );
}
