import { z } from 'zod';
import { phoneSchema } from './common.js';

/**
 * WhatsApp destination verification. A number only becomes the live
 * order-receiving destination after a code sent to it is confirmed here.
 */
export const requestWhatsAppVerificationSchema = z.object({
  whatsappNumber: phoneSchema,
});
export type RequestWhatsAppVerificationInput = z.infer<
  typeof requestWhatsAppVerificationSchema
>;

export const confirmWhatsAppVerificationSchema = z.object({
  whatsappNumber: phoneSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code sent to your WhatsApp.'),
});
export type ConfirmWhatsAppVerificationInput = z.infer<
  typeof confirmWhatsAppVerificationSchema
>;
