"use client";

import { useActionState, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { applyBookingFormPrefill, emptyBookingFormPrefill, type BookingFormPrefill } from "@/lib/booking-prefill";
import { createBookingCheckoutAction, type BookingActionState } from "@/server/actions/booking";
import { formatCurrency } from "@/lib/utils";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: BookingActionState = {
  status: "idle",
  message: "",
};

type BookingFormValues = BookingFormPrefill;

const initialValues: BookingFormValues = emptyBookingFormPrefill;

export type BookingFormService = {
  id: string;
  name: string;
  durationMinutes: number;
  basePrice: string;
  depositAmount: string;
};

export function BookingForm({
  services,
  dateOptions,
  devPrefill,
}: {
  services: BookingFormService[];
  dateOptions: string[];
  devPrefill?: BookingFormPrefill | null;
}) {
  const searchParams = useSearchParams();
  const defaultServiceId = searchParams.get("serviceId") ?? services[0]?.id ?? "";
  const [selectedServiceId, setSelectedServiceId] = useState(defaultServiceId);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0] ?? "");
  const [selectedStartAt, setSelectedStartAt] = useState("");
  const [slots, setSlots] = useState<Array<{ startAt: string; label: string }>>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [values, setValues] = useState(initialValues);
  const [state, formAction] = useActionState(createBookingCheckoutAction, initialState);

  const selectedService = services.find((service) => service.id === selectedServiceId);

  useEffect(() => {
    let isCancelled = false;

    async function loadSlots() {
      if (!selectedServiceId || !selectedDate) return;
      setIsLoadingSlots(true);

      try {
        const response = await fetch(
          `/api/availability?serviceId=${selectedServiceId}&date=${selectedDate}`,
        );
        const data = response.ok
          ? ((await response.json()) as Array<{ startAt: string; label: string }>)
          : [];

        if (isCancelled) return;

        setSlots(data);
        setSelectedStartAt((current) => {
          if (data.some((slot) => slot.startAt === current)) {
            return current;
          }

          return data[0]?.startAt ?? "";
        });
      } catch {
        if (isCancelled) return;
        setSlots([]);
        setSelectedStartAt("");
      } finally {
        if (!isCancelled) {
          setIsLoadingSlots(false);
        }
      }
    }

    void loadSlots();

    return () => {
      isCancelled = true;
    };
  }, [selectedDate, selectedServiceId]);

  if (!services.length) {
    return (
      <div className="panel p-6 text-sm text-muted">
        No active services are available right now. Please check back later.
      </div>
    );
  }

  return (
    <form action={formAction} className="stack">
      <input name="startAt" type="hidden" value={selectedStartAt} />
      <section className="panel p-5 sm:p-7">
        <div className="flex flex-col gap-2">
          <h2 className="section-title">Book your wash</h2>
          <p className="text-sm leading-6 text-muted">
            Choose a service, reserve an open time slot, and pay only the deposit online. The
            remaining balance is collected in person after service.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="stack">
            <span className="text-sm font-medium text-slate-800">Service</span>
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
            <span className="text-sm font-medium text-slate-800">Date</span>
            <select
              className="field"
              name="date"
              onChange={(event) => setSelectedDate(event.target.value)}
              value={selectedDate}
            >
              {dateOptions.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel p-5 sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">Available start times</p>
            <p className="text-xs text-muted">
              Slots are generated from weekly availability, blackout rules, and existing bookings.
            </p>
          </div>
          {selectedService && (
            <div className="rounded-2xl border border-brand/10 bg-brand-soft px-4 py-3 text-right text-sm">
              <p className="font-semibold text-slate-950">
                {formatCurrency(selectedService.depositAmount)} deposit
              </p>
              <p className="text-muted">{formatCurrency(selectedService.basePrice)} total</p>
            </div>
          )}
        </div>

        {isLoadingSlots ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="h-12 animate-pulse rounded-2xl bg-slate-100" key={index} />
            ))}
          </div>
        ) : slots.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {slots.map((slot) => (
              <label
                className="flex cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-white has-[:checked]:shadow-lg has-[:checked]:shadow-brand/20"
                key={slot.startAt}
              >
                <input
                  className="sr-only"
                  checked={selectedStartAt === slot.startAt}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setSelectedStartAt(slot.startAt);
                    }
                  }}
                  name="slotOption"
                  type="radio"
                  value={slot.startAt}
                />
                {slot.label}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No slots are available for the selected date.</p>
        )}
      </section>

      <section className="panel p-5 sm:p-7">
        <div className="mb-5">
          <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
            Customer and vehicle details
          </h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {devPrefill ? (
            <div className="md:col-span-2">
              <button
                className="button-dev"
                onClick={() => setValues((current) => applyBookingFormPrefill(current, devPrefill))}
                type="button"
              >
                Dev Only: Use Sample Data
              </button>
            </div>
          ) : null}
          <label className="stack">
            <span className="text-sm font-medium text-slate-800">First name</span>
            <input
              className="field"
              name="firstName"
              onChange={(event) =>
                setValues((current) => ({ ...current, firstName: event.target.value }))
              }
              placeholder="Jordan"
              required
              value={values.firstName}
            />
          </label>
          <label className="stack">
            <span className="text-sm font-medium text-slate-800">Last name</span>
            <input
              className="field"
              name="lastName"
              onChange={(event) =>
                setValues((current) => ({ ...current, lastName: event.target.value }))
              }
              placeholder="Taylor"
              required
              value={values.lastName}
            />
          </label>
          <label className="stack">
            <span className="text-sm font-medium text-slate-800">Email</span>
            <input
              className="field"
              name="email"
              onChange={(event) =>
                setValues((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="jordan@example.com"
              required
              value={values.email}
            />
          </label>
          <label className="stack">
            <span className="text-sm font-medium text-slate-800">Phone</span>
            <input
              className="field"
              name="phone"
              onChange={(event) =>
                setValues((current) => ({ ...current, phone: event.target.value }))
              }
              placeholder="5551234567"
              required
              value={values.phone}
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="stack">
            <span className="text-sm font-medium text-slate-800">Vehicle make</span>
            <input
              className="field"
              name="make"
              onChange={(event) =>
                setValues((current) => ({ ...current, make: event.target.value }))
              }
              placeholder="Toyota"
              required
              value={values.make}
            />
          </label>
          <label className="stack">
            <span className="text-sm font-medium text-slate-800">Vehicle model</span>
            <input
              className="field"
              name="model"
              onChange={(event) =>
                setValues((current) => ({ ...current, model: event.target.value }))
              }
              placeholder="RAV4"
              required
              value={values.model}
            />
          </label>
          <label className="stack">
            <span className="text-sm font-medium text-slate-800">Year</span>
            <input
              className="field"
              name="year"
              onChange={(event) =>
                setValues((current) => ({ ...current, year: event.target.value }))
              }
              placeholder="2022"
              value={values.year}
            />
          </label>
          <label className="stack">
            <span className="text-sm font-medium text-slate-800">Color</span>
            <input
              className="field"
              name="color"
              onChange={(event) =>
                setValues((current) => ({ ...current, color: event.target.value }))
              }
              placeholder="Pearl white"
              value={values.color}
            />
          </label>
          <label className="stack md:col-span-2">
            <span className="text-sm font-medium text-slate-800">License plate</span>
            <input
              className="field"
              name="licensePlate"
              onChange={(event) =>
                setValues((current) => ({ ...current, licensePlate: event.target.value }))
              }
              placeholder="8ABC123"
              value={values.licensePlate}
            />
          </label>
        </div>

        <label className="mt-4 stack">
          <span className="text-sm font-medium text-slate-800">Notes</span>
          <textarea
            className="field min-h-28 resize-y"
            name="notes"
            onChange={(event) =>
              setValues((current) => ({ ...current, notes: event.target.value }))
            }
            placeholder="Pet hair, child seats, extra mud..."
            value={values.notes}
          />
        </label>
      </section>

      {state.status === "error" ? (
        <p className="alert-error">{state.message}</p>
      ) : null}

      <section className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <p className="max-w-2xl text-sm leading-6 text-muted">
          Deposit is charged now through Stripe. Any remaining balance stays outstanding on the
          booking until it is collected later.
        </p>
        <SubmitButton>Continue to deposit payment</SubmitButton>
      </section>
    </form>
  );
}
