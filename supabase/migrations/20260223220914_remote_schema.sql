drop index if exists "public"."notes_status_idx";


  create table "public"."linksy_email_templates" (
    "id" uuid not null default gen_random_uuid(),
    "template_key" text not null,
    "name" text not null,
    "description" text,
    "subject_template" text not null,
    "html_template" text not null,
    "text_template" text,
    "is_active" boolean not null default true,
    "updated_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."notes" drop column "status";

alter table "public"."research_notes" drop column "status";

CREATE INDEX idx_linksy_email_templates_active ON public.linksy_email_templates USING btree (is_active);

CREATE UNIQUE INDEX linksy_email_templates_pkey ON public.linksy_email_templates USING btree (id);

CREATE UNIQUE INDEX linksy_email_templates_template_key_key ON public.linksy_email_templates USING btree (template_key);

alter table "public"."linksy_email_templates" add constraint "linksy_email_templates_pkey" PRIMARY KEY using index "linksy_email_templates_pkey";

alter table "public"."linksy_email_templates" add constraint "linksy_email_templates_template_key_key" UNIQUE using index "linksy_email_templates_template_key_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.linksy_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

grant delete on table "public"."linksy_email_templates" to "anon";

grant insert on table "public"."linksy_email_templates" to "anon";

grant references on table "public"."linksy_email_templates" to "anon";

grant select on table "public"."linksy_email_templates" to "anon";

grant trigger on table "public"."linksy_email_templates" to "anon";

grant truncate on table "public"."linksy_email_templates" to "anon";

grant update on table "public"."linksy_email_templates" to "anon";

grant delete on table "public"."linksy_email_templates" to "authenticated";

grant insert on table "public"."linksy_email_templates" to "authenticated";

grant references on table "public"."linksy_email_templates" to "authenticated";

grant select on table "public"."linksy_email_templates" to "authenticated";

grant trigger on table "public"."linksy_email_templates" to "authenticated";

grant truncate on table "public"."linksy_email_templates" to "authenticated";

grant update on table "public"."linksy_email_templates" to "authenticated";

grant delete on table "public"."linksy_email_templates" to "service_role";

grant insert on table "public"."linksy_email_templates" to "service_role";

grant references on table "public"."linksy_email_templates" to "service_role";

grant select on table "public"."linksy_email_templates" to "service_role";

grant trigger on table "public"."linksy_email_templates" to "service_role";

grant truncate on table "public"."linksy_email_templates" to "service_role";

grant update on table "public"."linksy_email_templates" to "service_role";

CREATE TRIGGER update_linksy_email_templates_updated_at BEFORE UPDATE ON public.linksy_email_templates FOR EACH ROW EXECUTE FUNCTION public.linksy_set_updated_at();


