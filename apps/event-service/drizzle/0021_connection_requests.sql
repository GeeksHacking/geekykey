-- Tapping a token sends a connection request (BAC-149). A request is a time in
-- the row's a_met_at or b_met_at, as a half was, with an ID of its own. The
-- column is nullable and the version still running never reads it, so it keeps
-- working. A half it writes has no ID, so it never shows as a request.
ALTER TABLE `meeting_halves` ADD `request_id` varchar(36);--> statement-breakpoint
ALTER TABLE `meeting_halves` ADD CONSTRAINT `meeting_halves_request_id_idx` UNIQUE(`request_id`);--> statement-breakpoint
CREATE INDEX `meeting_halves_user_b_idx` ON `meeting_halves` (`user_b`);