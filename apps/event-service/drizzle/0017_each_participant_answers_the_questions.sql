-- Each participant answers the answers game's questions (BAC-119). One row
-- each: their choices, from question ID to choice ID, and when their first
-- connection fixed them. A new table, so the version still running never
-- reads it.
CREATE TABLE `answers` (
	`user_id` varchar(128) NOT NULL,
	`choices` json NOT NULL,
	`fixed_at` varchar(24),
	CONSTRAINT `answers_user_id` PRIMARY KEY(`user_id`)
);
