import { Check } from "lucide-react";

const steps = [
  { number: 1, label: "Choose assets" },
  { number: 2, label: "Verify destination" },
  { number: 3, label: "Review & migrate" },
];

export function Stepper({ activeStep }: { activeStep: number }) {
  return (
    <nav className="stepper" aria-label="Migration progress">
      {steps.map((step) => {
        const complete = step.number < activeStep;
        const active = step.number === activeStep;
        return (
          <div
            className={`step ${active ? "is-active" : ""} ${complete ? "is-complete" : ""}`}
            key={step.number}
            aria-current={active ? "step" : undefined}
          >
            <span className="step-number">{complete ? <Check size={13} /> : step.number}</span>
            <span>{step.label}</span>
          </div>
        );
      })}
    </nav>
  );
}
