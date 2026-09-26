ALTER TABLE `conversations` ADD `kind` text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `pane` text DEFAULT 'right' NOT NULL;