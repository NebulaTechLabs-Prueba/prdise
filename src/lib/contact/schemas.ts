import { z } from "zod";

/**
 * Schema del formulario público de contacto.
 *
 * Se usa en `submitContactMessage` (Server Action) pero también puede
 * consumirse desde el cliente para feedback inmediato si hace falta.
 *
 * Nota: `phone` es opcional porque la tabla `contact_messages` permite NULL.
 */
export const contactMessageSchema = z.object({
  name: z
    .string({ required_error: "Nombre requerido" })
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(120, "El nombre es demasiado largo"),
  email: z
    .string({ required_error: "Email requerido" })
    .trim()
    .min(1, "Email requerido")
    .email("Email inválido")
    .max(254, "Email demasiado largo"),
  phone: z
    .string()
    .trim()
    .max(40, "Teléfono inválido")
    .optional()
    .or(z.literal("")),
  message: z
    .string({ required_error: "Mensaje requerido" })
    .trim()
    .min(10, "El mensaje debe tener al menos 10 caracteres")
    .max(4000, "El mensaje es demasiado largo"),
});

export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
