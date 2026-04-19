CREATE TABLE `demo_usage` (
	`date_utc` text PRIMARY KEY NOT NULL,
	`tokens` integer DEFAULT 0 NOT NULL,
	`cost_micro_usd` integer DEFAULT 0 NOT NULL,
	`updated_at` integer
);
