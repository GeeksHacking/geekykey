-- A station's heartbeat, passed on by the GeekyKey side, stores what the
-- station said of its health: its firmware version, its saved taps and
-- whether its reader answers (BAC-34). Null until a heartbeat says it. The
-- version still running never reads them.
ALTER TABLE `stations` ADD `firmware_version` varchar(64);--> statement-breakpoint
ALTER TABLE `stations` ADD `buffered_taps` int;--> statement-breakpoint
ALTER TABLE `stations` ADD `reader_ok` boolean;