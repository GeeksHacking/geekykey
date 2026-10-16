-- The contract step of checkpoint 3's table changes (BAC-36): what the
-- tickets before it stopped writing and reading goes, so each table holds
-- only section 3.6's columns. Taps stored with no user are test data from
-- before BAC-32, and are deleted rather than kept, since user_id is never
-- empty from now on. Station IDs and keys stay, so stations keep working.
-- The version still running names these columns in its inserts, since Drizzle
-- lists every column its schema knows, so its taps, logins and claims fail
-- from this migration until the new version serves, about 20 seconds in the
-- deploy job. Stations keep their taps through the 503 and resend them.
-- The DELETE was added by hand.
ALTER TABLE `users` DROP INDEX `users_portal_user_id_unique`;--> statement-breakpoint
DELETE FROM `taps` WHERE `user_id` IS NULL;--> statement-breakpoint
ALTER TABLE `taps` MODIFY COLUMN `user_id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `stations` DROP COLUMN `name`;--> statement-breakpoint
ALTER TABLE `stations` DROP COLUMN `location`;--> statement-breakpoint
ALTER TABLE `stations` DROP COLUMN `points`;--> statement-breakpoint
ALTER TABLE `taps` DROP COLUMN `token_uid`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `portal_user_id`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `role`;--> statement-breakpoint
ALTER TABLE `tokens` DROP COLUMN `paired_at`;--> statement-breakpoint
ALTER TABLE `tokens` DROP COLUMN `revoked_at`;
