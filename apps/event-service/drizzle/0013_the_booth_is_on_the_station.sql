-- A station's booth moves from its passport settings onto the station, so
-- the map draws a station at its booth whatever game it runs (BAC-89, the
-- API agreement's 9.12). Each station keeps the booth its passport settings
-- gave it. This is the expand step: passport_stations.booth stays, unread,
-- until a later migration drops it, since the version still running reads
-- and writes it. A booth that version sets between this and the deploy
-- stays in passport_stations, where the new version doesn't read it, so
-- nobody sets a booth in that window.
-- The UPDATE was added by hand.
ALTER TABLE `stations` ADD `booth` text;
--> statement-breakpoint
UPDATE `stations` SET `booth` = (
	SELECT `booth` FROM `passport_stations` WHERE `passport_stations`.`station_id` = `stations`.`id`
);
