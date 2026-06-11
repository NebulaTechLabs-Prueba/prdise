import { z } from "zod";

// Frase exacta requerida para confirmar soft delete (ver project_business_rules.md).
export const SOFT_DELETE_CONFIRMATION =
  "Confirmo que deseo realizar esta opción y que es definitiva";

const emailSchema = z
  .string({ required_error: "Email requerido" })
  .trim()
  .min(1, "Email requerido")
  .email("Email inválido");

const passwordSchema = z
  .string({ required_error: "Contraseña requerida" })
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(72, "La contraseña no puede exceder 72 caracteres");

const nameSchema = z
  .string({ required_error: "Nombre requerido" })
  .trim()
  .min(1, "Nombre requerido")
  .max(80, "El nombre es demasiado largo");

// Teléfono / WhatsApp del cliente. Lo guardamos en profiles.phone para que
// el admin pueda contactarlo por WhatsApp en el modelo catálogo+referral.
// Validación liviana: solo dígitos, +, espacios, -, () (formatos típicos).
const phoneSchema = z
  .string({ required_error: "WhatsApp requerido" })
  .trim()
  .min(7, "Teléfono inválido (mínimo 7 dígitos)")
  .max(40, "Teléfono demasiado largo")
  .regex(/^[+\d\s().-]+$/, "Solo dígitos, +, espacios, paréntesis y guiones");

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema,
  // PM 2026-06-11: opcional al schema (frontend valida edad mínima); el
  // server confía y persiste si viene. Formato ISO YYYY-MM-DD.
  birthDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)")
    .optional()
    .or(z.literal("")),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z
    .string({ required_error: "Contraseña requerida" })
    .min(1, "Contraseña requerida"),
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordResetConfirmSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z
      .string({ required_error: "Debe confirmar la contraseña" })
      .min(1, "Debe confirmar la contraseña"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export const softDeleteSchema = z.object({
  confirmation: z
    .string({ required_error: "Confirmación requerida" })
    .refine((val) => val === SOFT_DELETE_CONFIRMATION, {
      message:
        "Debe escribir la frase de confirmación exactamente como se indica",
    }),
});

export const updateProfileSchema = z.object({
  firstName: z
    .string()
    .trim()
    .max(80, "El nombre es demasiado largo")
    .optional()
    .or(z.literal("")),
  lastName: z
    .string()
    .trim()
    .max(80, "El apellido es demasiado largo")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .max(40, "Teléfono inválido")
    .optional()
    .or(z.literal("")),
  country: z
    .string()
    .trim()
    .max(80, "País inválido")
    .optional()
    .or(z.literal("")),
  langPref: z.enum(["es", "en"], {
    errorMap: () => ({ message: "Idioma inválido" }),
  }),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type PasswordResetRequestInput = z.infer<
  typeof passwordResetRequestSchema
>;
export type PasswordResetConfirmInput = z.infer<
  typeof passwordResetConfirmSchema
>;
export type SoftDeleteInput = z.infer<typeof softDeleteSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
