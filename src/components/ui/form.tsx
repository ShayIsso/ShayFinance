"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldError,
  type FieldPath,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from "react-hook-form";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Shared RHF + Zod form primitives (Shadcn idiom, adapted to this project's
 * Base-UI-based components). Usage:
 *
 *   const form = useForm({ resolver: zodResolver(schema), defaultValues });
 *   <Form {...form}>
 *     <form onSubmit={form.handleSubmit(onSubmit)}>
 *       <FormField control={form.control} name="name" render={({ field }) => (
 *         <FormItem>
 *           <FormLabel>שם</FormLabel>
 *           <FormControl><Input {...field} /></FormControl>
 *           <FormMessage />
 *         </FormItem>
 *       )} />
 *       <FormRootError />
 *       <FormSubmit>שמור</FormSubmit>
 *     </form>
 *   </Form>
 *
 * Server-side validation failures surface through the same mechanism:
 * call form.setError("fieldName", { message }) with the action's fieldErrors,
 * or form.setError("root", { message }) for non-field errors.
 */

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue | null>(null);

function useFormField() {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const formContext = useFormContext();

  if (!fieldContext) {
    throw new Error("useFormField must be used within <FormField>");
  }
  if (!formContext) {
    throw new Error("useFormField must be used within <Form>");
  }

  const { getFieldState, formState } = formContext;
  const fieldState = getFieldState(fieldContext.name, formState);

  const id = itemContext?.id ?? fieldContext.name;

  return {
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
}

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div data-slot="form-item" className={cn("space-y-1.5", className)} {...props} />
    </FormItemContext.Provider>
  );
}

function FormLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  const { error, formItemId } = useFormField();

  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      htmlFor={formItemId}
      className={cn("data-[error=true]:text-destructive", className)}
      {...props}
    />
  );
}

/**
 * Wires id / aria-invalid / aria-describedby onto its single child control.
 */
function FormControl({ children }: { children: React.ReactElement }) {
  const { error, formItemId, formMessageId } = useFormField();

  return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    id: formItemId,
    "aria-invalid": !!error,
    "aria-describedby": error ? formMessageId : undefined,
  });
}

/**
 * Inline field error. Renders the current RHF error for the enclosing field,
 * or nothing when the field is valid. Inherits the page's RTL direction.
 */
function FormMessage({ className, children, ...props }: React.ComponentProps<"p">) {
  const { error, formMessageId } = useFormField();
  const body = error ? errorText(error) : children;

  if (!body) return null;

  return (
    <p
      id={formMessageId}
      data-slot="form-message"
      className={cn("text-destructive text-sm", className)}
      {...props}
    >
      {body}
    </p>
  );
}

function errorText(error: FieldError): string {
  return typeof error.message === "string" && error.message.length > 0
    ? error.message
    : "ערך לא תקין";
}

/**
 * Form-level (non-field) error, e.g. form.setError("root", { message }).
 */
function FormRootError({ className, ...props }: React.ComponentProps<"p">) {
  const { errors } = useFormState();
  const message = errors.root?.message;

  if (!message) return null;

  return (
    <p data-slot="form-root-error" className={cn("text-destructive text-sm", className)} {...props}>
      {String(message)}
    </p>
  );
}

/**
 * Submit button with a visible pending state and double-submit protection:
 * disabled (and showing a spinner) while RHF is submitting or while an
 * external `pending` flag (e.g. a wrapping transition) is true.
 */
function FormSubmit({
  pending,
  pendingText,
  children,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & {
  pending?: boolean;
  pendingText?: React.ReactNode;
}) {
  const { isSubmitting } = useFormState();
  const isPending = isSubmitting || !!pending;

  return (
    <Button type="submit" data-slot="form-submit" disabled={isPending || disabled} {...props}>
      {isPending && <Loader2 className="size-4 animate-spin" />}
      {isPending && pendingText ? pendingText : children}
    </Button>
  );
}

/** True when a (possibly dotted, e.g. "credentials.id") path exists in the form values. */
function hasFieldPath(values: FieldValues, path: string): boolean {
  let current: unknown = values;
  for (const part of path.split(".")) {
    if (typeof current !== "object" || current === null || !(part in current)) return false;
    current = (current as Record<string, unknown>)[part];
  }
  return true;
}

/**
 * Routes a Server Action's failure result into the form: fieldErrors whose
 * keys exist in the form's values (dotted paths for nested fields) become
 * inline field errors (the same mechanism client validation uses); anything
 * else lands on "root".
 */
function applyActionErrors<TFieldValues extends FieldValues>(
  form: UseFormReturn<TFieldValues>,
  result: { error?: string; fieldErrors?: Record<string, string> },
  fallbackMessage = "שגיאה בשמירה",
) {
  const values = form.getValues();
  let appliedFieldError = false;
  for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
    if (hasFieldPath(values, field)) {
      form.setError(field as Path<TFieldValues>, { message });
      appliedFieldError = true;
    }
  }
  if (!appliedFieldError) {
    form.setError("root", { message: result.error ?? fallbackMessage });
  }
}

export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormRootError,
  FormSubmit,
  applyActionErrors,
  useFormField,
};
