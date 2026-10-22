"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useFormState } from "./action-form";
import { Field, Input, Select, Textarea } from "./form";

/** Form fields wired to ActionForm state: they show server-side errors and keep submitted values. */

export function TextField({
  label,
  name,
  hint,
  required,
  defaultValue,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: ReactNode }) {
  const state = useFormState();
  const error = state.fieldErrors?.[name];
  const value = state.values?.[name] ?? defaultValue;
  return (
    <Field label={label} name={name} error={error} hint={hint} required={required} className={className}>
      <Input name={name} key={`${name}:${String(value ?? "")}`} defaultValue={value as string | undefined} invalid={!!error} required={required} {...props} />
    </Field>
  );
}

export function TextAreaField({
  label,
  name,
  hint,
  required,
  defaultValue,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string; hint?: ReactNode }) {
  const state = useFormState();
  const error = state.fieldErrors?.[name];
  const value = state.values?.[name] ?? defaultValue;
  return (
    <Field label={label} name={name} error={error} hint={hint} required={required} className={className}>
      <Textarea name={name} key={`${name}:${String(value ?? "")}`} defaultValue={value as string | undefined} invalid={!!error} required={required} {...props} />
    </Field>
  );
}

export function SelectField({
  label,
  name,
  hint,
  required,
  defaultValue,
  options,
  placeholder,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  name: string;
  hint?: ReactNode;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
}) {
  const state = useFormState();
  const error = state.fieldErrors?.[name];
  const value = state.values?.[name] ?? defaultValue;
  return (
    <Field label={label} name={name} error={error} hint={hint} required={required} className={className}>
      <Select
        name={name}
        key={`${name}:${String(value ?? "")}`}
        defaultValue={value as string | undefined}
        invalid={!!error}
        options={options}
        placeholder={placeholder}
        required={required}
        {...props}
      />
    </Field>
  );
}
