-- Organizers choose which challenge a new connection plays (BAC-161). The
-- version still running never reads the column, and a row it makes gets the
-- default, so its connections keep picking at random, as they always have.
ALTER TABLE `event_settings` ADD `challenge` enum('random','dice','reaction') DEFAULT 'random' NOT NULL;