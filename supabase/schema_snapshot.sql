-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.team_members (
  id uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  color text NOT NULL DEFAULT '#4b6bfb'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  callmebot_phone text,
  callmebot_apikey text,
  role text NOT NULL DEFAULT 'member'::text CHECK (role = ANY (ARRAY['member'::text, 'admin'::text])),
  CONSTRAINT team_members_pkey PRIMARY KEY (id),
  CONSTRAINT team_members_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT ''::text,
  status text NOT NULL DEFAULT 'todo'::text CHECK (status = ANY (ARRAY['backlog'::text, 'todo'::text, 'in_progress'::text, 'review'::text, 'repository'::text, 'done'::text])),
  priority text NOT NULL DEFAULT 'medium'::text CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])),
  assignee_id uuid,
  created_by uuid,
  due_date timestamp with time zone,
  reminder_sent boolean NOT NULL DEFAULT false,
  overdue_notified boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  workspace_id uuid,
  tag_color text,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  revision_count integer NOT NULL DEFAULT 0,
  is_sop boolean NOT NULL DEFAULT false,
  reminder_24h_sent boolean NOT NULL DEFAULT false,
  reminder_12h_sent boolean NOT NULL DEFAULT false,
  reminder_6h_sent boolean NOT NULL DEFAULT false,
  reminder_2h_sent boolean NOT NULL DEFAULT false,
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.team_members(id),
  CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id),
  CONSTRAINT tasks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id)
);
CREATE TABLE public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  endpoint text NOT NULL UNIQUE,
  subscription jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.team_members(id)
);
CREATE TABLE public.ai_command_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  input_text text NOT NULL,
  parsed_action jsonb,
  result text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_command_log_pkey PRIMARY KEY (id),
  CONSTRAINT ai_command_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.team_members(id)
);
CREATE TABLE public.workspaces (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color_theme text DEFAULT 'default'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workspaces_pkey PRIMARY KEY (id),
  CONSTRAINT workspaces_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id)
);
CREATE TABLE public.task_assignees (
  task_id uuid NOT NULL,
  member_id uuid NOT NULL,
  CONSTRAINT task_assignees_pkey PRIMARY KEY (task_id, member_id),
  CONSTRAINT task_assignees_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id),
  CONSTRAINT task_assignees_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.team_members(id)
);
CREATE TABLE public.checklist_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid,
  text text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT checklist_items_pkey PRIMARY KEY (id),
  CONSTRAINT checklist_items_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id)
);
CREATE TABLE public.resources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid,
  title text NOT NULL,
  url text NOT NULL,
  file_type text DEFAULT 'link'::text,
  added_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  task_id uuid,
  CONSTRAINT resources_pkey PRIMARY KEY (id),
  CONSTRAINT resources_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id),
  CONSTRAINT resources_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.team_members(id),
  CONSTRAINT resources_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id)
);
CREATE TABLE public.team_pings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  message text NOT NULL,
  send_hour_local integer NOT NULL CHECK (send_hour_local >= 0 AND send_hour_local <= 23),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT team_pings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.team_ping_log (
  ping_key text NOT NULL,
  sent_on date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT team_ping_log_pkey PRIMARY KEY (ping_key, sent_on)
);
CREATE TABLE public.appreciations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  from_member uuid,
  to_member uuid,
  message text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT appreciations_pkey PRIMARY KEY (id),
  CONSTRAINT appreciations_from_member_fkey FOREIGN KEY (from_member) REFERENCES public.team_members(id),
  CONSTRAINT appreciations_to_member_fkey FOREIGN KEY (to_member) REFERENCES public.team_members(id)
);
CREATE TABLE public.workspace_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid,
  member_id uuid,
  text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workspace_messages_pkey PRIMARY KEY (id),
  CONSTRAINT workspace_messages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id),
  CONSTRAINT workspace_messages_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.team_members(id)
);
CREATE TABLE public.meeting_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid,
  requested_by uuid,
  kind text NOT NULL DEFAULT 'instant'::text CHECK (kind = ANY (ARRAY['instant'::text, 'scheduled'::text])),
  scheduled_time timestamp with time zone,
  meeting_link text,
  status text NOT NULL DEFAULT 'open'::text CHECK (status = ANY (ARRAY['open'::text, 'confirmed'::text, 'cancelled'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT meeting_requests_pkey PRIMARY KEY (id),
  CONSTRAINT meeting_requests_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id),
  CONSTRAINT meeting_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.team_members(id)
);
CREATE TABLE public.activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid,
  actor_id uuid,
  action_type text NOT NULL,
  description text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT activity_log_pkey PRIMARY KEY (id),
  CONSTRAINT activity_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.team_members(id)
);l