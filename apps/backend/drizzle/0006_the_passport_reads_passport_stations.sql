-- The passport's settings move off the station into passport_stations, and a
-- station gets a label, the device's name (BAC-35). Today's stations keep
-- their name, location and points as passport settings, added when the
-- station was created, so their taps are still accepted, and each label
-- starts as its station's name. A tap at a station without passport settings
-- is stored as no_game. The version still running reads stations' old
-- columns, which stay until a later migration (BAC-36), and never creates a
-- station, so a label it doesn't write is never missing.
-- The steps that copy the rows, and label's two steps, were added by hand.
CREATE TABLE `passport_stations` (
	`station_id` varchar(64) NOT NULL,
	`name` text NOT NULL,
	`location` text,
	`points` int NOT NULL DEFAULT 1,
	`added_at` varchar(24) NOT NULL,
	CONSTRAINT `passport_stations_station_id` PRIMARY KEY(`station_id`)
);
--> statement-breakpoint
ALTER TABLE `passport_stations` ADD CONSTRAINT `passport_stations_station_id_stations_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO `passport_stations` (`station_id`, `name`, `location`, `points`, `added_at`)
	SELECT `id`, `name`, `location`, `points`, `created_at` FROM `stations`;--> statement-breakpoint
ALTER TABLE `stations` ADD `label` text;--> statement-breakpoint
UPDATE `stations` SET `label` = `name`;--> statement-breakpoint
ALTER TABLE `stations` MODIFY COLUMN `label` text NOT NULL;--> statement-breakpoint
ALTER TABLE `stations` MODIFY COLUMN `name` text;--> statement-breakpoint
ALTER TABLE `taps` MODIFY COLUMN `status` enum('accepted','cooldown','unknown_token','no_game') NOT NULL;
