import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const billingEntitlements = sqliteTable("billing_entitlements", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull().default(""),
  plan: text("plan").notNull(),
  status: text("status").notNull(),
  paymentProvider: text("payment_provider").notNull().default("stripe"),
  checkoutSessionId: text("checkout_session_id").notNull(),
  subscriptionId: text("subscription_id"),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const billingPayments = sqliteTable("billing_payments", {
  checkoutSessionId: text("checkout_session_id").primaryKey(),
  userId: text("user_id").notNull(),
  email: text("email").notNull().default(""),
  plan: text("plan").notNull(),
  amountYen: integer("amount_yen").notNull(),
  paidAt: text("paid_at").notNull(),
});
