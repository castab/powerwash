"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  applyBookingFormPrefill,
  emptyBookingFormPrefill,
  type BookingFormPrefill,
} from "@/lib/booking-prefill";
import { createBookingCheckoutAction, type BookingActionState } from "@/server/actions/booking";
import { formatCurrency } from "@/lib/utils";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: BookingActionState = {
  status: "idle",
  message: "",
};

const steps = ["Service", "Appointment", "Vehicle", "Contact", "Review & pay"] as const;

type StepIndex = 0 | 1 | 2 | 3 | 4;
type TimePeriod = "morning" | "afternoon";
type BookingFormValues = BookingFormPrefill;
type FieldErrors = Partial<Record<keyof BookingFormValues | "time", string>>;

export type BookingFormService = {
  id: string;
  name: string;
  durationMinutes: number;
  basePrice: string;
  depositAmount: string;
};

function formatSelectedDate(date: string) {
  if (!date) return "Not selected";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function getSlotPeriod(slot: { label: string }): TimePeriod {
  return slot.label.endsWith("AM") ? "morning" : "afternoon";
}

function ErrorMessage({ children }: { children?: string }) {
  if (!children) return null;

  return <span className="text-sm text-danger">{children}</span>;
}

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
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const [currentStep, setCurrentStep] = useState<StepIndex>(0);
  const [selectedServiceId, setSelectedServiceId] = useState(defaultServiceId);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0] ?? "");
  const [selectedStartAt, setSelectedStartAt] = useState("");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("morning");
  const [slots, setSlots] = useState<Array<{ startAt: string; label: string }>>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [values, setValues] = useState<BookingFormValues>(emptyBookingFormPrefill);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [state, formAction] = useActionState(createBookingCheckoutAction, initialState);

  const selectedService = services.find((service) => service.id === selectedServiceId);
  const selectedSlot = slots.find((slot) => slot.startAt === selectedStartAt);
  const morningSlots = slots.filter((slot) => getSlotPeriod(slot) === "morning");
  const afternoonSlots = slots.filter((slot) => getSlotPeriod(slot) === "afternoon");
  const visibleSlots = timePeriod === "morning" ? morningSlots : afternoonSlots;
  const balanceDue = selectedService
    ? Math.max(Number(selectedService.basePrice) - Number(selectedService.depositAmount), 0)
    : 0;

  useEffect(() => {
    let isCancelled = false;

    async function loadSlots() {
      if (!selectedServiceId || !selectedDate) return;

      setIsLoadingSlots(true);
      setAvailabilityError("");
      setSelectedStartAt("");

      try {
        const response = await fetch(
          `/api/availability?serviceId=${selectedServiceId}&date=${selectedDate}`,
        );

        if (!response.ok) {
          throw new Error("Unable to load available times.");
        }

        const data = (await response.json()) as Array<{ startAt: string; label: string }>;

        if (!isCancelled) {
          setSlots(data);
          setTimePeriod(data.some((slot) => getSlotPeriod(slot) === "morning") ? "morning" : "afternoon");
        }
      } catch {
        if (!isCancelled) {
          setSlots([]);
          setAvailabilityError("Unable to load available times. Please try another date.");
        }
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

  function updateValue<Key extends keyof BookingFormValues>(
    key: Key,
    value: BookingFormValues[Key],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validateStep(step: StepIndex) {
    const errors: FieldErrors = {};

    if (step === 1 && !selectedStartAt) {
      errors.time = "Choose an available time.";
    }

    if (step === 2 && values.vehicleDescription.trim().length < 3) {
      errors.vehicleDescription = "Enter the vehicle year, make, and model.";
    }

    if (step === 3) {
      if (values.firstName.trim().length < 2) errors.firstName = "Enter a first name.";
      if (values.lastName.trim().length < 2) errors.lastName = "Enter a last name.";
      if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = "Enter a valid email.";
      if (values.phone.trim().length < 10) errors.phone = "Enter a valid phone number.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function goToStep(step: StepIndex) {
    setCurrentStep(step);
    setFieldErrors({});
    requestAnimationFrame(() => stepHeadingRef.current?.focus());
  }

  function continueToNextStep() {
    if (!validateStep(currentStep) || currentStep === 4) return;
    goToStep((currentStep + 1) as StepIndex);
  }

  if (!services.length) {
    return (
      <div className="surface-block text-sm text-muted">
        No active services are available right now. Please check back later.
      </div>
    );
  }

  return (
    <form action={formAction} className="soft-surface p-5 sm:p-7">
      <input name="serviceId" type="hidden" value={selectedServiceId} />
      <input name="date" type="hidden" value={selectedDate} />
      <input name="startAt" type="hidden" value={selectedStartAt} />
      {Object.entries(values).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}

      <div>
        <p className="eyebrow">Reserve with deposit only</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">Book your wash</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Five quick steps, then you will continue to Stripe to pay the deposit.
        </p>
      </div>

      <nav aria-label="Booking progress" className="mt-7">
        <ol className="grid grid-cols-5 gap-2">
          {steps.map((step, index) => {
            const isCurrent = currentStep === index;
            const isComplete = currentStep > index;

            return (
              <li className="relative min-w-0 text-center" key={step}>
                {index > 0 ? (
                  <span
                    aria-hidden="true"
                    className={`absolute right-1/2 top-4 -z-0 h-px w-full ${isComplete || isCurrent ? "bg-brand" : "bg-line"}`}
                  />
                ) : null}
                <button
                  aria-current={isCurrent ? "step" : undefined}
                  className="relative z-10 inline-flex w-full flex-col items-center gap-2 text-xs font-medium"
                  disabled={index > currentStep}
                  onClick={() => goToStep(index as StepIndex)}
                  type="button"
                >
                  <span
                    className={`flex size-8 items-center justify-center rounded-full ring-1 ${
                      isCurrent || isComplete
                        ? "bg-brand text-white ring-brand"
                        : "bg-white text-muted ring-line"
                    }`}
                  >
                    {isComplete ? "✓" : index + 1}
                  </span>
                  <span className={isCurrent ? "text-foreground" : "text-muted"}>{step}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="mt-8" aria-labelledby="booking-step-heading">
        <h3
          className="text-2xl font-semibold tracking-tight outline-none"
          id="booking-step-heading"
          ref={stepHeadingRef}
          tabIndex={-1}
        >
          {steps[currentStep]}
        </h3>

        {currentStep === 0 ? (
          <div className="mt-5 grid gap-5">
            <label className="stack gap-2 max-w-xl">
              <span className="text-sm font-medium">Service</span>
              <select
                className="field"
                onChange={(event) => setSelectedServiceId(event.target.value)}
                value={selectedServiceId}
              >
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} ({service.durationMinutes} min)
                  </option>
                ))}
              </select>
            </label>

            {selectedService ? (
              <div className="rounded-2xl bg-surface-strong/60 p-5 text-sm ring-1 ring-foreground/5">
                <p className="font-semibold">{selectedService.name}</p>
                <p className="mt-2 text-muted">Approximately {selectedService.durationMinutes} minutes</p>
                <p className="mt-1 text-muted">
                  {formatCurrency(selectedService.depositAmount)} deposit · {formatCurrency(selectedService.basePrice)} total
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {currentStep === 1 ? (
          <div className="mt-5 rounded-[1.75rem] bg-surface-strong/40 p-4 ring-1 ring-foreground/5 sm:p-5">
            <div className="grid gap-4 md:grid-cols-[minmax(16rem,1fr)_auto] md:items-end">
              <label className="stack gap-2">
                <span className="text-sm font-medium">Date</span>
                <input
                  className="field"
                  max={dateOptions.at(-1)}
                  min={dateOptions[0]}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  required
                  type="date"
                  value={selectedDate}
                />
              </label>

              {!isLoadingSlots && slots.length ? (
                <fieldset>
                  <legend className="text-sm font-medium">Time of day</legend>
                  <div className="mt-2 inline-flex rounded-full bg-white/60 p-1 ring-1 ring-foreground/5">
                    {(["morning", "afternoon"] as const).map((period) => {
                      const periodSlots = period === "morning" ? morningSlots : afternoonSlots;
                      const isSelected = timePeriod === period;

                      return (
                        <button
                          aria-pressed={isSelected}
                          className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${
                            isSelected ? "bg-white text-brand-strong shadow-sm" : "text-muted"
                          }`}
                          disabled={!periodSlots.length}
                          key={period}
                          onClick={() => setTimePeriod(period)}
                          type="button"
                        >
                          {period} <span className="font-normal">({periodSlots.length})</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}
            </div>

            <fieldset
              aria-describedby={fieldErrors.time ? "time-error" : undefined}
              className="mt-6 border-t border-foreground/10 pt-5"
            >
              <legend className="sr-only">Available start time</legend>
              <p className="text-sm font-medium">Choose a start time</p>

              {isLoadingSlots ? (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                  {Array.from({ length: 12 }).map((_, index) => (
                    <div className="h-11 animate-pulse rounded-2xl bg-white/70" key={index} />
                  ))}
                </div>
              ) : null}

              {!isLoadingSlots && slots.length ? (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                  {visibleSlots.map((slot) => {
                    const isSelected = selectedStartAt === slot.startAt;

                    return (
                      <button
                        aria-pressed={isSelected}
                        className={`rounded-2xl px-3 py-3 text-sm font-medium ring-1 ${
                          isSelected
                            ? "bg-brand text-white ring-brand"
                            : "bg-white/80 text-foreground ring-foreground/10 hover:bg-white"
                        }`}
                        key={slot.startAt}
                        onClick={() => {
                          setSelectedStartAt(slot.startAt);
                          setFieldErrors((current) => ({ ...current, time: undefined }));
                        }}
                        type="button"
                      >
                        {slot.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <span id="time-error">
                <ErrorMessage>{fieldErrors.time}</ErrorMessage>
              </span>
              {availabilityError ? <p className="text-sm text-danger">{availabilityError}</p> : null}
              {!isLoadingSlots && !availabilityError && !slots.length ? (
                <p className="mt-3 text-sm text-muted">Try another date to find an open appointment.</p>
              ) : null}
            </fieldset>
          </div>
        ) : null}

        {currentStep === 2 ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {devPrefill ? (
              <div className="md:col-span-2">
                <button
                  className="button-dev"
                  onClick={() => {
                    setValues((current) => applyBookingFormPrefill(current, devPrefill));
                    setFieldErrors({});
                  }}
                  type="button"
                >
                  Dev Only: Use Sample Data
                </button>
              </div>
            ) : null}
            <label className="stack gap-2 md:col-span-2">
              <span className="text-sm font-medium">Year, make, and model</span>
              <input
                aria-describedby={fieldErrors.vehicleDescription ? "vehicle-description-error" : undefined}
                className="field"
                onChange={(event) => updateValue("vehicleDescription", event.target.value)}
                placeholder="2022 Toyota RAV4"
                value={values.vehicleDescription}
              />
              <span id="vehicle-description-error">
                <ErrorMessage>{fieldErrors.vehicleDescription}</ErrorMessage>
              </span>
            </label>
            <label className="stack gap-2">
              <span className="text-sm font-medium">Color <span className="text-muted">(optional)</span></span>
              <input
                className="field"
                onChange={(event) => updateValue("color", event.target.value)}
                placeholder="Pearl white"
                value={values.color}
              />
            </label>
            <label className="stack gap-2">
              <span className="text-sm font-medium">License plate <span className="text-muted">(optional)</span></span>
              <input
                className="field"
                onChange={(event) => updateValue("licensePlate", event.target.value)}
                placeholder="8ABC123"
                value={values.licensePlate}
              />
            </label>
            <label className="stack gap-2 md:col-span-2">
              <span className="text-sm font-medium">Notes <span className="text-muted">(optional)</span></span>
              <textarea
                className="field min-h-28 resize-y"
                maxLength={500}
                onChange={(event) => updateValue("notes", event.target.value)}
                placeholder="Pet hair, child seats, extra mud..."
                value={values.notes}
              />
            </label>
          </div>
        ) : null}

        {currentStep === 3 ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {([
              ["firstName", "First name", "Jordan", "text"],
              ["lastName", "Last name", "Taylor", "text"],
              ["email", "Email", "jordan@example.com", "email"],
              ["phone", "Phone", "5551234567", "tel"],
            ] as const).map(([key, label, placeholder, type]) => (
              <label className="stack gap-2" key={key}>
                <span className="text-sm font-medium">{label}</span>
                <input
                  aria-describedby={fieldErrors[key] ? `${key}-error` : undefined}
                  autoComplete={key === "email" ? "email" : key === "phone" ? "tel" : key === "firstName" ? "given-name" : "family-name"}
                  className="field"
                  onChange={(event) => updateValue(key, event.target.value)}
                  placeholder={placeholder}
                  type={type}
                  value={values[key]}
                />
                <span id={`${key}-error`}>
                  <ErrorMessage>{fieldErrors[key]}</ErrorMessage>
                </span>
              </label>
            ))}
          </div>
        ) : null}

        {currentStep === 4 ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-surface-strong/60 p-5 ring-1 ring-foreground/5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Service</p>
                  <p className="mt-2 text-sm text-muted">{selectedService?.name}</p>
                  <p className="text-sm text-muted">Approximately {selectedService?.durationMinutes} minutes</p>
                </div>
                <button className="text-sm font-semibold text-brand-strong" onClick={() => goToStep(0)} type="button">Edit</button>
              </div>
            </div>

            <div className="rounded-2xl bg-surface-strong/60 p-5 ring-1 ring-foreground/5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Appointment</p>
                  <p className="text-sm text-muted">
                    {formatSelectedDate(selectedDate)} at {selectedSlot?.label}
                  </p>
                </div>
                <button className="text-sm font-semibold text-brand-strong" onClick={() => goToStep(1)} type="button">Edit</button>
              </div>
            </div>

            <div className="rounded-2xl bg-surface-strong/60 p-5 ring-1 ring-foreground/5 md:col-span-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Vehicle</p>
                  <p className="mt-2 text-sm text-muted">{values.vehicleDescription}</p>
                  <p className="text-sm text-muted">
                    {values.color || "Color not provided"}
                    {values.licensePlate ? ` · Plate ${values.licensePlate}` : ""}
                  </p>
                  {values.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{values.notes}</p> : null}
                </div>
                <button className="text-sm font-semibold text-brand-strong" onClick={() => goToStep(2)} type="button">Edit</button>
              </div>
            </div>

            <div className="rounded-2xl bg-surface-strong/60 p-5 ring-1 ring-foreground/5 md:col-span-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Contact</p>
                  <p className="mt-2 text-sm text-muted">{values.firstName} {values.lastName}</p>
                  <p className="text-sm text-muted">{values.email} · {values.phone}</p>
                </div>
                <button className="text-sm font-semibold text-brand-strong" onClick={() => goToStep(3)} type="button">Edit</button>
              </div>
            </div>

            <div className="rounded-2xl bg-white/70 p-5 ring-1 ring-foreground/10 md:col-span-2">
              <p className="text-sm font-semibold">Payment summary</p>
              <dl className="mt-3 grid gap-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-muted">Service total</dt><dd>{formatCurrency(selectedService?.basePrice ?? 0)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Deposit due now</dt><dd className="font-semibold">{formatCurrency(selectedService?.depositAmount ?? 0)}</dd></div>
                <div className="flex justify-between gap-4 border-t border-line pt-2"><dt className="text-muted">Remaining after deposit</dt><dd>{formatCurrency(balanceDue)}</dd></div>
              </dl>
            </div>

            {state.status === "error" ? (
              <p aria-live="polite" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 md:col-span-2">
                {state.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-foreground/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        {currentStep > 0 ? (
          <button className="button-secondary" onClick={() => goToStep((currentStep - 1) as StepIndex)} type="button">
            Back
          </button>
        ) : <span />}

        {currentStep < 4 ? (
          <button className="button-primary" onClick={continueToNextStep} type="button">
            Continue
          </button>
        ) : (
          <SubmitButton>Continue to deposit payment</SubmitButton>
        )}
      </div>
    </form>
  );
}
