-- A station can be disabled, which drops it off the Event Service's registered
-- stations, so the GeekyKey side refuses its key (BAC-33). Empty while the
-- station is enabled, as every station is until the station board can disable
-- one. The version still running never reads it.
ALTER TABLE `stations` ADD `disabled_at` varchar(24);
