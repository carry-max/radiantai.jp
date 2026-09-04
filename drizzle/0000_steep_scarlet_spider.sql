CREATE TABLE `billing_entitlements` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`plan` text NOT NULL,
	`status` text NOT NULL,
	`payment_provider` text DEFAULT 'stripe' NOT NULL,
	`checkout_session_id` text NOT NULL,
	`subscription_id` text,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `billing_payments` (
	`checkout_session_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`plan` text NOT NULL,
	`amount_yen` integer NOT NULL,
	`paid_at` text NOT NULL
);
