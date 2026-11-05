-- Organizers choose whether connections need different token kinds or
-- different groups (BAC-140). event_settings is a new table, so the version
-- still running never reads it. A connection's kinds may now be null, since
-- people in different groups connect whatever their tokens: the running
-- version still writes both, so it isn't broken by the change.
CREATE TABLE `event_settings` (
	`id` int NOT NULL,
	`connect_across` enum('token_kinds','groups') NOT NULL,
	CONSTRAINT `event_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `connections` MODIFY COLUMN `kind_a` varchar(32);--> statement-breakpoint
ALTER TABLE `connections` MODIFY COLUMN `kind_b` varchar(32);