ALTER TABLE `connections` ADD `id` varchar(36);--> statement-breakpoint
UPDATE `connections` SET `id` = UUID() WHERE `id` IS NULL;--> statement-breakpoint
ALTER TABLE `connections` MODIFY COLUMN `id` varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `connections` ADD `game` varchar(8);--> statement-breakpoint
ALTER TABLE `connections` ADD `reaction_a_ms` int;--> statement-breakpoint
ALTER TABLE `connections` ADD `reaction_b_ms` int;--> statement-breakpoint
ALTER TABLE `connections` ADD `reaction_a_at` varchar(24);--> statement-breakpoint
ALTER TABLE `connections` ADD `reaction_b_at` varchar(24);--> statement-breakpoint
ALTER TABLE `connections` ADD CONSTRAINT `connections_id_idx` UNIQUE(`id`);
