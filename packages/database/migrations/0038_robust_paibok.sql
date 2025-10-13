CREATE TABLE "graph_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"graph_state_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"meta" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"state" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "graph_node_id" uuid;--> statement-breakpoint
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_graph_state_id_graph_states_id_fk" FOREIGN KEY ("graph_state_id") REFERENCES "public"."graph_states"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_states" ADD CONSTRAINT "graph_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_graph_node_id_graph_nodes_id_fk" FOREIGN KEY ("graph_node_id") REFERENCES "public"."graph_nodes"("id") ON DELETE cascade ON UPDATE no action;