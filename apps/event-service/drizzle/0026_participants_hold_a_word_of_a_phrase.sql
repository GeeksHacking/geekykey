-- Each placed participant holds one word of a phrase the organizers type (BAC-169).
-- The version still running reads neither the column nor the table, and a row it
-- makes in event_settings leaves the phrase null, which is the activity off.
CREATE TABLE `phrase_words` (
	`user_id` varchar(128) NOT NULL,
	`position` int NOT NULL,
	CONSTRAINT `phrase_words_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `event_settings` ADD `phrase` varchar(255);