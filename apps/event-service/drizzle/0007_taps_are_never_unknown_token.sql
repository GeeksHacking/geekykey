-- unknown_token is answered by the GeekyKey side and never stored (BAC-31),
-- so the status column drops it (BAC-35). Taps stored with it before then
-- are test data, and are deleted rather than kept. The version still running
-- stores only accepted and cooldown, and works with this.
-- The DELETE was added by hand.
DELETE FROM `taps` WHERE `status` = 'unknown_token';--> statement-breakpoint
ALTER TABLE `taps` MODIFY COLUMN `status` enum('accepted','cooldown','no_game') NOT NULL;
