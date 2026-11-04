-- Organizers split participants into groups (BAC-128). The groups, each
-- participant who has joined, and the one row every placement locks. New
-- tables, so the version still running never reads them.
CREATE TABLE `group_allocation` (
	`id` int NOT NULL,
	`started_at` varchar(24),
	CONSTRAINT `group_allocation_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `group_members` (
	`user_id` varchar(128) NOT NULL,
	`group_id` varchar(36),
	`joined_at` varchar(24) NOT NULL,
	`placed_at` varchar(24),
	`how` enum('allocated','latecomer','organizer'),
	CONSTRAINT `group_members_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `participant_groups` (
	`id` varchar(36) NOT NULL,
	`name` varchar(80) NOT NULL,
	`tags` json NOT NULL,
	`location` text,
	`capacity` int,
	`created_at` varchar(24) NOT NULL,
	CONSTRAINT `participant_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `participant_groups_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE INDEX `group_members_group_id_idx` ON `group_members` (`group_id`);