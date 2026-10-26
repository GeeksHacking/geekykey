-- Each passport station can say which booth it stands at, so the map on the
-- big screen draws it there (BAC-84, the API agreement's 9.1 and 9.10). Null
-- for none. The version still running names its own columns in every read
-- and write, so it never reads booth, and a station it adds gets none.
ALTER TABLE `passport_stations` ADD `booth` text;