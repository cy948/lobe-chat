CREATE TABLE "flow_node_meta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_state_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"metadata" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flow_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" text NOT NULL,
	"user_id" text NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "flow_node_meta" ADD CONSTRAINT "flow_node_meta_flow_state_id_flow_states_id_fk" FOREIGN KEY ("flow_state_id") REFERENCES "public"."flow_states"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_node_meta" ADD CONSTRAINT "flow_node_meta_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_states" ADD CONSTRAINT "flow_states_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_states" ADD CONSTRAINT "flow_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;