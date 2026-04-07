"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";

interface BusinessFormProps {
  onSubmit: (payload: {
    name: string;
    currency: string;
  }) => void;
}

const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "TRY"];

export function BusinessForm({ onSubmit }: BusinessFormProps) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");

  const isDisabled = name.trim().length < 2;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDisabled) return;

    onSubmit({
      name: name.trim(),
      currency,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="business-name" className="text-sm font-medium">
          Business name
        </label>
        <input
          id="business-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your business name"
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="business-currency" className="text-sm font-medium">
          Currency
        </label>
        <select
          id="business-currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        >
          {CURRENCY_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" className="w-full" disabled={isDisabled}>
        Create business
      </Button>
    </form>
  );
}
