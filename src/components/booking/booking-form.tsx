"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Service } from "@prisma/client";
import { createBookingCheckoutAction, type BookingActionState } from "@/server/actions/booking";
import { formatCurrency } from "@/lib/utils";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: BookingActionState = {
  status: "idle",
  message: "",
};

function createDateOptions() {
  const today = new Date();
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

export function BookingForm({ services }: { services: Service[] }) {
  const searchParams = useSearchParams();
  const defaultServiceId = searchParams.get("serviceId") ?? services[0]?.id ?? "";
  const [selectedServiceId, setSelectedServiceId] = useState(defaultServiceId);
  const [selectedDate, setSelectedDate] = useState(createDateOptions()[0]);
  const [slots, setSlots] = useState<Array<{ startAt: string; label: string }>>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [state, formAction] = useActionState(createBookingCheckoutAction, initialState);

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId),
    [services, selectedServiceId],
  );

  useEffect(() => {
    async function loadSlots() {
      if (!selectedServiceId || !selectedDate) return;
      setIsLoadingSlots(true);
      try {
        const response = await fetch(
          `/api/availability?serviceId=${selectedServiceId}&date=${selectedDate}`,
        );
        const data = (await response.json()) as Array<{ startAt: string; label: string }>;
        setSlots(data);
      } catch {
        setSlots([]);
      } finally {
        setIsLoadingSlots(false);
      }
    }

    void loadSlots();
  }, [selectedDate, selectedServiceId]);

  if (!services.length) {
    return (
      <div className="panel p-6 text-sm text-muted">
        No active services are available right now. Please check back later.
      </div>
    );
  }

  return (
    <form action={formAction} className="panel stack p-5 sm:p-7">
      <div className="flex flex-col gap-2">
        <p className="badge w-fit">Reserve with deposit only</p>
        <h2 className="section-title">Book your wash</h2>
        <p className="text-sm leading-6 text-muted">
          Choose a service, reserve an open time slot, and pay only the deposit online. The
          remaining balance is collected in person after service.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="stack">
          <span className="text-sm font-medium">Service</span>
          <select
            className="field"
            name="serviceId"
            onChange={(event) => setSelectedServiceId(event.target.value)}
            value={selectedServiceId}
          >
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} ({service.durationMinutes} min, deposit{" "}
                {formatCurrency(service.depositAmount)})
              </option>
            ))}
          </select>
        </label>

        <label className="stack">
          <span className="text-sm font-medium">Date</span>
          <select
            className="field"
            name="date"
            onChange={(event) => setSelectedDate(event.target.value)}
            value={selectedDate}
          >
            {createDateOptions().map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-[24px] border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Available start times</p>
            <p className="text-xs text-muted">
              Slots are generated from weekly availability, blackout rules, and existing bookings.
            </p>
          </div>
          {selectedService && (
            <div className="text-right text-sm">
              <p className="font-semibold">{formatCurrency(selectedService.depositAmount)} deposit</p>
              <p className="text-muted">{formatCurrency(selectedService.basePrice)} total</p>
            </div>
          )}
        </div>

        {isLoadingSlots ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="h-11 animate-pulse rounded-2xl bg-white" key={index} />
            ))}
          </div>
        ) : slots.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {slots.map((slot, index) => (
              <label
                className="flex cursor-pointer items-center justify-center rounded-2xl border border-line bg-white px-4 py-3 text-sm font-medium has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-white"
                key={slot.startAt}
              >
                <input
                  className="sr-only"
                  defaultChecked={index === 0}
                  name="startTime"
                  type="radio"
                  value={slot.startAt.slice(11, 16)}
                />
                {slot.label}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No slots are available for the selected date.</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="stack">
          <span className="text-sm font-medium">First name</span>
          <input className="field" name="firstName" placeholder="Jordan" required />
        </label>
        <label className="stack">
          <span className="text-sm font-medium">Last name</span>
          <input className="field" name="lastName" placeholder="Taylor" required />
        </label>
        <label className="stack">
          <span className="text-sm font-medium">Email</span>
          <input className="field" name="email" placeholder="jordan@example.com" required />
        </label>
        <label className="stack">
          <span className="text-sm font-medium">Phone</span>
          <input className="field" name="phone" placeholder="5551234567" required />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="stack">
          <span className="text-sm font-medium">Vehicle make</span>
          <input className="field" name="make" placeholder="Toyota" required />
        </label>
        <label className="stack">
          <span className="text-sm font-medium">Vehicle model</span>
          <input className="field" name="model" placeholder="RAV4" required />
        </label>
        <label className="stack">
          <span className="text-sm font-medium">Year</span>
          <input className="field" name="year" placeholder="2022" />
        </label>
        <label className="stack">
          <span className="text-sm font-medium">Color</span>
          <input className="field" name="color" placeholder="Pearl white" />
        </label>
        <label className="stack md:col-span-2">
          <span className="text-sm font-medium">License plate</span>
          <input className="field" name="licensePlate" placeholder="8ABC123" />
        </label>
      </div>

      <label className="stack">
        <span className="text-sm font-medium">Notes</span>
        <textarea
          className="field min-h-28 resize-y"
          name="notes"
          placeholder="Pet hair, child seats, extra mud..."
        />
      </label>

      {state.status === "error" ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-muted">
          Deposit is charged now through Stripe. Remaining balance is due in person at the
          appointment.
        </p>
        <SubmitButton>Continue to deposit payment</SubmitButton>
      </div>
    </form>
  );
}
