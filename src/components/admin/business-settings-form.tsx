"use client";

import { useActionState, useState } from "react";
import {
  clearBusinessSettingsAction,
  updateBusinessSettingsAction,
  type AdminActionState,
} from "@/server/actions/admin";
import { ActionMessages } from "@/components/admin/action-messages";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: AdminActionState = {};

export type BusinessSettingsFormValues = {
  originAddress: string;
  originPlaceId: string;
  originLat: string;
  originLng: string;
  maxTravelMinutes: string;
};

// Places metadata travels in hidden inputs alongside the visible address text,
// mirroring the booking form. Editing the address text clears the metadata so
// stale coordinates never accompany a changed origin.
export function BusinessSettingsForm({ settings }: { settings: BusinessSettingsFormValues }) {
  const [saveState, saveAction] = useActionState(updateBusinessSettingsAction, initialState);
  const [clearState, clearAction] = useActionState(clearBusinessSettingsAction, initialState);
  const [originAddress, setOriginAddress] = useState(settings.originAddress);
  const [originMeta, setOriginMeta] = useState({
    placeId: settings.originPlaceId,
    lat: settings.originLat,
    lng: settings.originLng,
  });

  return (
    <div className="grid gap-4 md:max-w-2xl">
      <form action={saveAction} className="surface-block grid gap-4">
        <div>
          <h2 className="text-lg font-semibold">Service area</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Customers whose service address is farther than the max travel time from your origin
            are politely turned away before paying a deposit. Bookings are not distance-checked
            until both fields are saved.
          </p>
        </div>

        <input name="originPlaceId" type="hidden" value={originMeta.placeId} />
        <input name="originLat" type="hidden" value={originMeta.lat} />
        <input name="originLng" type="hidden" value={originMeta.lng} />

        <label className="stack gap-2">
          <span className="text-sm font-medium">Business origin address</span>
          <input
            autoComplete="street-address"
            className="field"
            name="originAddress"
            onChange={(event) => {
              setOriginAddress(event.target.value);
              setOriginMeta({ placeId: "", lat: "", lng: "" });
            }}
            placeholder="1234 Main St, Springfield"
            required
            value={originAddress}
          />
          <span className="text-xs text-muted">
            Where you depart from — travel time is measured from here to the customer.
          </span>
        </label>

        <label className="stack gap-2">
          <span className="text-sm font-medium">Max travel time (minutes)</span>
          <input
            className="field"
            defaultValue={settings.maxTravelMinutes}
            inputMode="numeric"
            max={600}
            min={5}
            name="maxTravelMinutes"
            placeholder="30"
            required
            type="number"
          />
        </label>

        <ActionMessages state={saveState} />

        <SubmitButton className="w-full justify-center sm:w-auto">
          Save service area
        </SubmitButton>
      </form>

      <form action={clearAction} className="surface-block grid gap-3">
        <div>
          <h3 className="text-sm font-semibold">Disable the service-area check</h3>
          <p className="mt-1 text-sm leading-6 text-muted">
            Clears the origin and max travel time so bookings from any address are accepted.
            Useful if address verification is temporarily unavailable.
          </p>
        </div>
        <ActionMessages state={clearState} />
        <SubmitButton className="w-full justify-center bg-red-600 hover:bg-red-700 sm:w-auto">
          Clear settings
        </SubmitButton>
      </form>
    </div>
  );
}
