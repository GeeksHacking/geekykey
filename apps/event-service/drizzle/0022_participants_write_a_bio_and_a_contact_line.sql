-- Participants write a bio and a contact line (BAC-147). Both columns are
-- nullable and the version still running never reads them, so it keeps working.
ALTER TABLE `users` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `users` ADD `contact_line` text;