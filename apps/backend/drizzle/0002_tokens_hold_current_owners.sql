-- tokens holds current owners only, from claimed_at, and a release deletes the
-- row. The version still running only reads tokens, and works with this. Each
-- token still claimed keeps the time it was paired as the time it was claimed,
-- and released tokens, which are test data, are deleted rather than kept.
-- The steps between the two statements drizzle-kit wrote were added by hand.
-- paired_at and revoked_at are dropped in a later migration (BAC-36).
ALTER TABLE `tokens` ADD `claimed_at` varchar(24);--> statement-breakpoint
UPDATE `tokens` SET `claimed_at` = `paired_at`;--> statement-breakpoint
DELETE FROM `tokens` WHERE `revoked_at` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `tokens` MODIFY COLUMN `claimed_at` varchar(24) NOT NULL;--> statement-breakpoint
ALTER TABLE `tokens` MODIFY COLUMN `paired_at` varchar(24);
