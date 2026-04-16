CREATE TABLE `councils` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`persona_ids` text,
	`synthesis_prompt` text,
	`round_structure` text,
	`model_config` text,
	`owner_party` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `memory` (
	`party_id` text PRIMARY KEY NOT NULL,
	`content` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `parties` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `personas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`emoji` text,
	`system_prompt` text,
	`requires` text,
	`owner_party` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `table_parties` (
	`table_id` text NOT NULL,
	`party_id` text NOT NULL,
	`role` text,
	PRIMARY KEY(`table_id`, `party_id`)
);
--> statement-breakpoint
CREATE TABLE `tables` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`dilemma` text,
	`council_id` text,
	`status` text DEFAULT 'pending',
	`synthesis` text,
	`error_message` text,
	`is_demo` integer DEFAULT 0,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `turns` (
	`id` text PRIMARY KEY NOT NULL,
	`table_id` text NOT NULL,
	`round` integer NOT NULL,
	`party_id` text,
	`persona_name` text,
	`text` text,
	`visible_to` text,
	`created_at` integer
);
