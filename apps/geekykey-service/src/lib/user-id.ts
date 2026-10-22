import { z } from "zod";

/**
 * A user ID as a request carries it: 1 to 128 characters, as a Firebase user
 * ID is, and as the API agreement's 11.2 and the claims stand-in take them.
 */
export const userIdSchema = z.string().min(1).max(128);
