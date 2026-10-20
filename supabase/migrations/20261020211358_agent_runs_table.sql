CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_user_id" uuid DEFAULT auth.uid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"purpose" text NOT NULL,
	"summary" text,
	CONSTRAINT "agent_runs_purpose_length_check" CHECK (char_length(btrim("agent_runs"."purpose")) between 1 and 200),
	CONSTRAINT "agent_runs_summary_length_check" CHECK ("agent_runs"."summary" is null or char_length("agent_runs"."summary") <= 2000),
	CONSTRAINT "agent_runs_ended_after_started_check" CHECK ("agent_runs"."ended_at" is null or "agent_runs"."ended_at" >= "agent_runs"."started_at")
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_events" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_user_fk" FOREIGN KEY ("agent_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_agent_run_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_events_agent_run_idx" ON "order_events" USING btree ("agent_run_id") WHERE "order_events"."agent_run_id" is not null;