ALTER TABLE "crucible"."entities" ADD CONSTRAINT "entities_code_shape" CHECK ("crucible"."entities"."code" ~ '^[A-Z0-9][A-Z0-9-]{1,23}$');--> statement-breakpoint
ALTER TABLE "crucible"."entities" ADD CONSTRAINT "entities_name_filled" CHECK (length(btrim("crucible"."entities"."name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."entities" ADD CONSTRAINT "entities_kind_domain" CHECK ("crucible"."entities"."kind" in ('internal', 'partner'));--> statement-breakpoint
ALTER TABLE "crucible"."entities" ADD CONSTRAINT "entities_matrix_code_filled" CHECK (length(btrim("crucible"."entities"."matrix_code")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."facilities" ADD CONSTRAINT "facilities_code_shape" CHECK ("crucible"."facilities"."code" ~ '^[A-Z0-9][A-Z0-9-]{1,23}$');--> statement-breakpoint
ALTER TABLE "crucible"."facilities" ADD CONSTRAINT "facilities_name_filled" CHECK (length(btrim("crucible"."facilities"."name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."facilities" ADD CONSTRAINT "facilities_acquisition_non_negative" CHECK ("crucible"."facilities"."acquisition_keur" >= 0);--> statement-breakpoint
ALTER TABLE "crucible"."projects" ADD CONSTRAINT "projects_code_shape" CHECK ("crucible"."projects"."code" ~ '^[A-Z0-9][A-Z0-9-]{1,23}$');--> statement-breakpoint
ALTER TABLE "crucible"."projects" ADD CONSTRAINT "projects_name_filled" CHECK (length(btrim("crucible"."projects"."name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."projects" ADD CONSTRAINT "projects_priority_class_domain" CHECK ("crucible"."projects"."priority_class" in ('P1', 'P2', 'P3'));--> statement-breakpoint
ALTER TABLE "crucible"."role_assignments" ADD CONSTRAINT "role_assignments_role_domain" CHECK ("crucible"."role_assignments"."role" in ('rd_director', 'coordinator', 'safety', 'facility_manager', 'project_lead', 'technician', 'partner', 'viewer', 'admin'));--> statement-breakpoint
ALTER TABLE "crucible"."role_assignments" ADD CONSTRAINT "role_assignments_scope_kind_domain" CHECK ("crucible"."role_assignments"."scope_kind" in ('global', 'entity', 'facility', 'project'));--> statement-breakpoint
ALTER TABLE "crucible"."role_assignments" ADD CONSTRAINT "role_assignments_scope_ref_iff_scoped" CHECK (("crucible"."role_assignments"."scope_kind" = 'global') = ("crucible"."role_assignments"."scope_ref" is null));--> statement-breakpoint
ALTER TABLE "crucible"."role_assignments" ADD CONSTRAINT "role_assignments_dates_order" CHECK ("crucible"."role_assignments"."to_on" is null or "crucible"."role_assignments"."from_on" is null or "crucible"."role_assignments"."to_on" >= "crucible"."role_assignments"."from_on");--> statement-breakpoint
ALTER TABLE "crucible"."role_assignments" ADD CONSTRAINT "role_assignments_created_by_filled" CHECK (length(btrim("crucible"."role_assignments"."created_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."sites" ADD CONSTRAINT "sites_code_shape" CHECK ("crucible"."sites"."code" ~ '^[A-Z0-9][A-Z0-9-]{1,23}$');--> statement-breakpoint
ALTER TABLE "crucible"."sites" ADD CONSTRAINT "sites_name_filled" CHECK (length(btrim("crucible"."sites"."name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."sites" ADD CONSTRAINT "sites_country_shape" CHECK ("crucible"."sites"."country_iso2" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "crucible"."sites" ADD CONSTRAINT "sites_matrix_code_filled" CHECK (length(btrim("crucible"."sites"."matrix_code")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."users" ADD CONSTRAINT "users_email_shape" CHECK ("crucible"."users"."email" = lower("crucible"."users"."email") and "crucible"."users"."email" ~ '^[^@[:space:]]+@[^@[:space:]]+$');--> statement-breakpoint
ALTER TABLE "crucible"."users" ADD CONSTRAINT "users_display_name_filled" CHECK (length(btrim("crucible"."users"."display_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD CONSTRAINT "bookings_ref_shape" CHECK ("crucible"."bookings"."ref" ~ '^B-[0-9]{4}-[0-9]{4,}$');--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD CONSTRAINT "bookings_title_filled" CHECK (length(btrim("crucible"."bookings"."title")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD CONSTRAINT "bookings_times_order" CHECK ("crucible"."bookings"."ends_at" > "crucible"."bookings"."starts_at");--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD CONSTRAINT "bookings_setup_non_negative" CHECK ("crucible"."bookings"."setup_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD CONSTRAINT "bookings_teardown_non_negative" CHECK ("crucible"."bookings"."teardown_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD CONSTRAINT "bookings_status_domain" CHECK ("crucible"."bookings"."status" in ('requested', 'confirmed', 'in_progress', 'done', 'cancelled', 'no_show'));--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD CONSTRAINT "bookings_actual_order" CHECK ("crucible"."bookings"."actual_end_at" is null or "crucible"."bookings"."actual_start_at" is null or "crucible"."bookings"."actual_end_at" >= "crucible"."bookings"."actual_start_at");--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD CONSTRAINT "bookings_requested_by_filled" CHECK (length(btrim("crucible"."bookings"."requested_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD CONSTRAINT "bookings_source_domain" CHECK ("crucible"."bookings"."source" in ('crucible', 'import'));--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD CONSTRAINT "bookings_series_ref_shape" CHECK ("crucible"."bookings"."series_ref" ~ '^B-[0-9]{4}-[0-9]{4,}$');--> statement-breakpoint
ALTER TABLE "crucible"."closures" ADD CONSTRAINT "closures_dates_order" CHECK ("crucible"."closures"."to_on" >= "crucible"."closures"."from_on");--> statement-breakpoint
ALTER TABLE "crucible"."closures" ADD CONSTRAINT "closures_label_filled" CHECK (length(btrim("crucible"."closures"."label")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."entity_agreements" ADD CONSTRAINT "entity_agreements_quota_non_negative" CHECK ("crucible"."entity_agreements"."quota_days_per_month" between 0 and 31);--> statement-breakpoint
ALTER TABLE "crucible"."entity_agreements" ADD CONSTRAINT "entity_agreements_notice_non_negative" CHECK ("crucible"."entity_agreements"."notice_workdays" >= 0);--> statement-breakpoint
ALTER TABLE "crucible"."entity_agreements" ADD CONSTRAINT "entity_agreements_updated_by_filled" CHECK (length(btrim("crucible"."entity_agreements"."updated_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."exclusion_rules" ADD CONSTRAINT "exclusion_rules_code_shape" CHECK ("crucible"."exclusion_rules"."code" ~ '^[A-Z0-9][A-Z0-9-]{1,23}$');--> statement-breakpoint
ALTER TABLE "crucible"."exclusion_rules" ADD CONSTRAINT "exclusion_rules_label_filled" CHECK (length(btrim("crucible"."exclusion_rules"."label")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."exclusion_rules" ADD CONSTRAINT "exclusion_rules_max_active_positive" CHECK ("crucible"."exclusion_rules"."max_active" >= 1);--> statement-breakpoint
ALTER TABLE "crucible"."exclusion_rules" ADD CONSTRAINT "exclusion_rules_reason_domain" CHECK ("crucible"."exclusion_rules"."reason" in ('safety', 'shared_staff', 'energy', 'nuisance', 'other'));--> statement-breakpoint
ALTER TABLE "crucible"."exclusion_rules" ADD CONSTRAINT "exclusion_rules_motive_filled" CHECK (length(btrim("crucible"."exclusion_rules"."motive")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."exclusion_rules" ADD CONSTRAINT "exclusion_rules_status_domain" CHECK ("crucible"."exclusion_rules"."status" in ('proposed', 'validated', 'retired'));--> statement-breakpoint
ALTER TABLE "crucible"."exclusion_rules" ADD CONSTRAINT "exclusion_rules_validated_dated" CHECK ("crucible"."exclusion_rules"."status" <> 'validated' or "crucible"."exclusion_rules"."validated_at" is not null);--> statement-breakpoint
ALTER TABLE "crucible"."exclusion_rules" ADD CONSTRAINT "exclusion_rules_retired_dated" CHECK ("crucible"."exclusion_rules"."status" <> 'retired' or "crucible"."exclusion_rules"."retired_at" is not null);--> statement-breakpoint
ALTER TABLE "crucible"."exclusion_rules" ADD CONSTRAINT "exclusion_rules_proposed_by_filled" CHECK (length(btrim("crucible"."exclusion_rules"."proposed_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."facility_hours" ADD CONSTRAINT "facility_hours_weekday_range" CHECK ("crucible"."facility_hours"."weekday" between 1 and 7);--> statement-breakpoint
ALTER TABLE "crucible"."facility_hours" ADD CONSTRAINT "facility_hours_opens_shape" CHECK ("crucible"."facility_hours"."opens_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');--> statement-breakpoint
ALTER TABLE "crucible"."facility_hours" ADD CONSTRAINT "facility_hours_closes_shape" CHECK ("crucible"."facility_hours"."closes_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');--> statement-breakpoint
ALTER TABLE "crucible"."facility_hours" ADD CONSTRAINT "facility_hours_order" CHECK ("crucible"."facility_hours"."closes_at" > "crucible"."facility_hours"."opens_at");--> statement-breakpoint
ALTER TABLE "crucible"."inspections" ADD CONSTRAINT "inspections_label_filled" CHECK (length(btrim("crucible"."inspections"."label")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."inspections" ADD CONSTRAINT "inspections_period_positive" CHECK ("crucible"."inspections"."period_months" >= 1);--> statement-breakpoint
ALTER TABLE "crucible"."inspections" ADD CONSTRAINT "inspections_source_domain" CHECK ("crucible"."inspections"."source" in ('crucible', 'vigie'));--> statement-breakpoint
ALTER TABLE "crucible"."inspections" ADD CONSTRAINT "inspections_updated_by_filled" CHECK (length(btrim("crucible"."inspections"."updated_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."resources" ADD CONSTRAINT "resources_code_shape" CHECK ("crucible"."resources"."code" ~ '^[A-Z0-9][A-Z0-9-]{1,23}$');--> statement-breakpoint
ALTER TABLE "crucible"."resources" ADD CONSTRAINT "resources_name_filled" CHECK (length(btrim("crucible"."resources"."name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."resources" ADD CONSTRAINT "resources_kind_domain" CHECK ("crucible"."resources"."kind" in ('zone', 'bench', 'machine', 'room', 'equipment'));--> statement-breakpoint
ALTER TABLE "crucible"."resources" ADD CONSTRAINT "resources_granularity_domain" CHECK ("crucible"."resources"."granularity" in ('half_day', 'hour'));--> statement-breakpoint
ALTER TABLE "crucible"."resources" ADD CONSTRAINT "resources_capacity_positive" CHECK ("crucible"."resources"."capacity" >= 1);--> statement-breakpoint
ALTER TABLE "crucible"."resources" ADD CONSTRAINT "resources_setup_non_negative" CHECK ("crucible"."resources"."setup_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "crucible"."resources" ADD CONSTRAINT "resources_teardown_non_negative" CHECK ("crucible"."resources"."teardown_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "crucible"."resources" ADD CONSTRAINT "resources_status_domain" CHECK ("crucible"."resources"."status" in ('in_service', 'maintenance', 'out_of_service', 'retired'));--> statement-breakpoint
ALTER TABLE "crucible"."resources" ADD CONSTRAINT "resources_buffer_non_negative" CHECK ("crucible"."resources"."buffer_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "crucible"."resources" ADD CONSTRAINT "resources_min_notice_non_negative" CHECK ("crucible"."resources"."min_notice_hours" >= 0);--> statement-breakpoint
ALTER TABLE "crucible"."resources" ADD CONSTRAINT "resources_max_days_positive" CHECK ("crucible"."resources"."max_days" >= 1);--> statement-breakpoint
ALTER TABLE "crucible"."unavailabilities" ADD CONSTRAINT "unavailabilities_kind_domain" CHECK ("crucible"."unavailabilities"."kind" in ('maintenance', 'inspection', 'breakdown', 'works', 'other'));--> statement-breakpoint
ALTER TABLE "crucible"."unavailabilities" ADD CONSTRAINT "unavailabilities_label_filled" CHECK (length(btrim("crucible"."unavailabilities"."label")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."unavailabilities" ADD CONSTRAINT "unavailabilities_times_order" CHECK ("crucible"."unavailabilities"."ends_at" >= "crucible"."unavailabilities"."starts_at");--> statement-breakpoint
ALTER TABLE "crucible"."unavailabilities" ADD CONSTRAINT "unavailabilities_source_domain" CHECK ("crucible"."unavailabilities"."source" in ('manual', 'vigie', 'incident'));--> statement-breakpoint
ALTER TABLE "crucible"."unavailabilities" ADD CONSTRAINT "unavailabilities_created_by_filled" CHECK (length(btrim("crucible"."unavailabilities"."created_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."vigie_zone_resources" ADD CONSTRAINT "vigie_zone_resources_set_by_filled" CHECK (length(btrim("crucible"."vigie_zone_resources"."set_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."project_milestones" ADD CONSTRAINT "project_milestones_label_filled" CHECK (length(btrim("crucible"."project_milestones"."label")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."project_milestones" ADD CONSTRAINT "project_milestones_criticality_domain" CHECK ("crucible"."project_milestones"."criticality" in ('contractual', 'regulatory', 'internal'));--> statement-breakpoint
ALTER TABLE "crucible"."project_milestones" ADD CONSTRAINT "project_milestones_source_domain" CHECK ("crucible"."project_milestones"."source" in ('crucible', 'keystone'));--> statement-breakpoint
ALTER TABLE "crucible"."project_milestones" ADD CONSTRAINT "project_milestones_updated_by_filled" CHECK (length(btrim("crucible"."project_milestones"."updated_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."test_needs" ADD CONSTRAINT "test_needs_ref_shape" CHECK ("crucible"."test_needs"."ref" ~ '^N-[0-9]{4}-[0-9]{4,}$');--> statement-breakpoint
ALTER TABLE "crucible"."test_needs" ADD CONSTRAINT "test_needs_level_domain" CHECK ("crucible"."test_needs"."level" in ('forecast', 'request'));--> statement-breakpoint
ALTER TABLE "crucible"."test_needs" ADD CONSTRAINT "test_needs_title_filled" CHECK (length(btrim("crucible"."test_needs"."title")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."test_needs" ADD CONSTRAINT "test_needs_half_days_positive" CHECK ("crucible"."test_needs"."half_days" >= 1);--> statement-breakpoint
ALTER TABLE "crucible"."test_needs" ADD CONSTRAINT "test_needs_dates_order" CHECK ("crucible"."test_needs"."deadline_on" >= "crucible"."test_needs"."earliest_on");--> statement-breakpoint
ALTER TABLE "crucible"."test_needs" ADD CONSTRAINT "test_needs_status_domain" CHECK ("crucible"."test_needs"."status" in ('open', 'withdrawn'));--> statement-breakpoint
ALTER TABLE "crucible"."test_needs" ADD CONSTRAINT "test_needs_requested_by_filled" CHECK (length(btrim("crucible"."test_needs"."requested_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."test_types" ADD CONSTRAINT "test_types_code_shape" CHECK ("crucible"."test_types"."code" ~ '^[A-Z0-9][A-Z0-9-]{1,23}$');--> statement-breakpoint
ALTER TABLE "crucible"."test_types" ADD CONSTRAINT "test_types_name_filled" CHECK (length(btrim("crucible"."test_types"."name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."test_types" ADD CONSTRAINT "test_types_half_days_positive" CHECK ("crucible"."test_types"."typical_half_days" >= 1);--> statement-breakpoint
ALTER TABLE "crucible"."test_types" ADD CONSTRAINT "test_types_updated_by_filled" CHECK (length(btrim("crucible"."test_types"."updated_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."activity_events" ADD CONSTRAINT "activity_events_actor_filled" CHECK (length(btrim("crucible"."activity_events"."actor_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."activity_events" ADD CONSTRAINT "activity_events_kind_filled" CHECK (length(btrim("crucible"."activity_events"."kind")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."activity_events" ADD CONSTRAINT "activity_events_text_filled" CHECK (length(btrim("crucible"."activity_events"."text")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."app_settings" ADD CONSTRAINT "app_settings_key_filled" CHECK (length(btrim("crucible"."app_settings"."key")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."app_settings" ADD CONSTRAINT "app_settings_updated_by_filled" CHECK (length(btrim("crucible"."app_settings"."updated_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."audit_entries" ADD CONSTRAINT "audit_entries_actor_filled" CHECK (length(btrim("crucible"."audit_entries"."actor_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."audit_entries" ADD CONSTRAINT "audit_entries_object_filled" CHECK (length(btrim("crucible"."audit_entries"."object_ref")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."audit_entries" ADD CONSTRAINT "audit_entries_change_filled" CHECK (length(btrim("crucible"."audit_entries"."change")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."audit_entries" ADD CONSTRAINT "audit_entries_area_filled" CHECK (length(btrim("crucible"."audit_entries"."area")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."job_runs" ADD CONSTRAINT "job_runs_last_status_domain" CHECK ("crucible"."job_runs"."last_status" in ('ok', 'error'));--> statement-breakpoint
ALTER TABLE "crucible"."rate_counters" ADD CONSTRAINT "rate_counters_bucket_domain" CHECK ("crucible"."rate_counters"."bucket" in ('sign_in', 'search', 'export', 'assistant', 'device', 'calendar', 'api'));--> statement-breakpoint
ALTER TABLE "crucible"."rate_counters" ADD CONSTRAINT "rate_counters_count_non_negative" CHECK ("crucible"."rate_counters"."count" >= 0);--> statement-breakpoint
ALTER TABLE "crucible"."arbitrations" ADD CONSTRAINT "arbitrations_kind_domain" CHECK ("crucible"."arbitrations"."kind" in ('decision', 'veto'));--> statement-breakpoint
ALTER TABLE "crucible"."arbitrations" ADD CONSTRAINT "arbitrations_decision_has_option" CHECK ("crucible"."arbitrations"."kind" <> 'decision' or "crucible"."arbitrations"."option_key" is not null);--> statement-breakpoint
ALTER TABLE "crucible"."arbitrations" ADD CONSTRAINT "arbitrations_rule_filled" CHECK (length(btrim("crucible"."arbitrations"."rule_invoked")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."arbitrations" ADD CONSTRAINT "arbitrations_reason_filled" CHECK (length(btrim("crucible"."arbitrations"."reason")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."arbitrations" ADD CONSTRAINT "arbitrations_decided_by_filled" CHECK (length(btrim("crucible"."arbitrations"."decided_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."arbitrations" ADD CONSTRAINT "arbitrations_role_domain" CHECK ("crucible"."arbitrations"."decided_by_role" in ('rd_director', 'coordinator', 'safety', 'facility_manager', 'project_lead', 'technician', 'partner', 'viewer', 'admin'));--> statement-breakpoint
ALTER TABLE "crucible"."conflicts" ADD CONSTRAINT "conflicts_ref_shape" CHECK ("crucible"."conflicts"."ref" ~ '^C-[0-9]{4}-[0-9]{4,}$');--> statement-breakpoint
ALTER TABLE "crucible"."conflicts" ADD CONSTRAINT "conflicts_needs_competing" CHECK (cardinality("crucible"."conflicts"."need_ids") >= 2);--> statement-breakpoint
ALTER TABLE "crucible"."conflicts" ADD CONSTRAINT "conflicts_subject_filled" CHECK (length(btrim("crucible"."conflicts"."subject")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."conflicts" ADD CONSTRAINT "conflicts_rule_cited_filled" CHECK (length(btrim("crucible"."conflicts"."rule_cited")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."conflicts" ADD CONSTRAINT "conflicts_decider_domain" CHECK ("crucible"."conflicts"."decider" in ('coordinator', 'rd_director'));--> statement-breakpoint
ALTER TABLE "crucible"."conflicts" ADD CONSTRAINT "conflicts_status_domain" CHECK ("crucible"."conflicts"."status" in ('open', 'decided', 'vetoed', 'obsolete'));--> statement-breakpoint
ALTER TABLE "crucible"."mobile_equipment" ADD CONSTRAINT "mobile_equipment_code_shape" CHECK ("crucible"."mobile_equipment"."code" ~ '^[A-Z0-9][A-Z0-9-]{1,23}$');--> statement-breakpoint
ALTER TABLE "crucible"."mobile_equipment" ADD CONSTRAINT "mobile_equipment_name_filled" CHECK (length(btrim("crucible"."mobile_equipment"."name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."mobile_equipment" ADD CONSTRAINT "mobile_equipment_updated_by_filled" CHECK (length(btrim("crucible"."mobile_equipment"."updated_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."people" ADD CONSTRAINT "people_name_filled" CHECK (length(btrim("crucible"."people"."name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."people" ADD CONSTRAINT "people_matricule_filled" CHECK (length(btrim("crucible"."people"."matricule")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."people" ADD CONSTRAINT "people_updated_by_filled" CHECK (length(btrim("crucible"."people"."updated_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."person_absences" ADD CONSTRAINT "person_absences_dates_order" CHECK ("crucible"."person_absences"."to_on" >= "crucible"."person_absences"."from_on");--> statement-breakpoint
ALTER TABLE "crucible"."person_absences" ADD CONSTRAINT "person_absences_source_domain" CHECK ("crucible"."person_absences"."source" in ('crucible', 'cursus'));--> statement-breakpoint
ALTER TABLE "crucible"."person_absences" ADD CONSTRAINT "person_absences_created_by_filled" CHECK (length(btrim("crucible"."person_absences"."created_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."person_skills" ADD CONSTRAINT "person_skills_source_domain" CHECK ("crucible"."person_skills"."source" in ('crucible', 'cursus'));--> statement-breakpoint
ALTER TABLE "crucible"."person_skills" ADD CONSTRAINT "person_skills_updated_by_filled" CHECK (length(btrim("crucible"."person_skills"."updated_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."plan_runs" ADD CONSTRAINT "plan_runs_ref_shape" CHECK ("crucible"."plan_runs"."ref" ~ '^R-[0-9]{4}-[0-9]{4,}$');--> statement-breakpoint
ALTER TABLE "crucible"."plan_runs" ADD CONSTRAINT "plan_runs_dates_order" CHECK ("crucible"."plan_runs"."to_on" >= "crucible"."plan_runs"."from_on");--> statement-breakpoint
ALTER TABLE "crucible"."plan_runs" ADD CONSTRAINT "plan_runs_trigger_domain" CHECK ("crucible"."plan_runs"."trigger" in ('manual', 'nightly'));--> statement-breakpoint
ALTER TABLE "crucible"."plan_runs" ADD CONSTRAINT "plan_runs_run_by_filled" CHECK (length(btrim("crucible"."plan_runs"."run_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."priority_rule_sets" ADD CONSTRAINT "priority_rule_sets_version_positive" CHECK ("crucible"."priority_rule_sets"."version" >= 1);--> statement-breakpoint
ALTER TABLE "crucible"."priority_rule_sets" ADD CONSTRAINT "priority_rule_sets_criteria_known" CHECK (cardinality("crucible"."priority_rule_sets"."criteria") > 0 and "crucible"."priority_rule_sets"."criteria" <@ array['safety_regulatory', 'contractual', 'critical_milestone', 'priority_class', 'slack', 'seniority']::text[]);--> statement-breakpoint
ALTER TABLE "crucible"."priority_rule_sets" ADD CONSTRAINT "priority_rule_sets_published_by_filled" CHECK (length(btrim("crucible"."priority_rule_sets"."published_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."proposals" ADD CONSTRAINT "proposals_times_order" CHECK ("crucible"."proposals"."ends_at" > "crucible"."proposals"."starts_at");--> statement-breakpoint
ALTER TABLE "crucible"."proposals" ADD CONSTRAINT "proposals_late_days_non_negative" CHECK ("crucible"."proposals"."late_days" >= 0);--> statement-breakpoint
ALTER TABLE "crucible"."proposals" ADD CONSTRAINT "proposals_status_domain" CHECK ("crucible"."proposals"."status" in ('proposed', 'accepted', 'rejected', 'superseded'));--> statement-breakpoint
ALTER TABLE "crucible"."skills" ADD CONSTRAINT "skills_code_shape" CHECK ("crucible"."skills"."code" ~ '^[A-Z0-9][A-Z0-9-]{1,23}$');--> statement-breakpoint
ALTER TABLE "crucible"."skills" ADD CONSTRAINT "skills_name_filled" CHECK (length(btrim("crucible"."skills"."name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."substitutions" ADD CONSTRAINT "substitutions_conditions_filled" CHECK (length(btrim("crucible"."substitutions"."conditions")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."substitutions" ADD CONSTRAINT "substitutions_codex_ref_filled" CHECK (length(btrim("crucible"."substitutions"."codex_ref")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."substitutions" ADD CONSTRAINT "substitutions_referent_filled" CHECK (length(btrim("crucible"."substitutions"."technical_referent")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."substitutions" ADD CONSTRAINT "substitutions_status_domain" CHECK ("crucible"."substitutions"."status" in ('proposed', 'validated', 'retired'));--> statement-breakpoint
ALTER TABLE "crucible"."substitutions" ADD CONSTRAINT "substitutions_proposed_by_filled" CHECK (length(btrim("crucible"."substitutions"."proposed_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."test_type_skills" ADD CONSTRAINT "test_type_skills_count_positive" CHECK ("crucible"."test_type_skills"."count" >= 1);--> statement-breakpoint
ALTER TABLE "crucible"."incidents" ADD CONSTRAINT "incidents_ref_shape" CHECK ("crucible"."incidents"."ref" ~ '^AL-[0-9]{4}-[0-9]{4,}$');--> statement-breakpoint
ALTER TABLE "crucible"."incidents" ADD CONSTRAINT "incidents_kind_domain" CHECK ("crucible"."incidents"."kind" in ('breakdown', 'absence', 'urgency'));--> statement-breakpoint
ALTER TABLE "crucible"."incidents" ADD CONSTRAINT "incidents_breakdown_resource" CHECK ("crucible"."incidents"."kind" <> 'breakdown' or "crucible"."incidents"."resource_id" is not null);--> statement-breakpoint
ALTER TABLE "crucible"."incidents" ADD CONSTRAINT "incidents_absence_person" CHECK ("crucible"."incidents"."kind" <> 'absence' or "crucible"."incidents"."person_id" is not null);--> statement-breakpoint
ALTER TABLE "crucible"."incidents" ADD CONSTRAINT "incidents_label_filled" CHECK (length(btrim("crucible"."incidents"."label")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."incidents" ADD CONSTRAINT "incidents_times_order" CHECK ("crucible"."incidents"."ends_at" > "crucible"."incidents"."starts_at");--> statement-breakpoint
ALTER TABLE "crucible"."incidents" ADD CONSTRAINT "incidents_status_domain" CHECK ("crucible"."incidents"."status" in ('open', 'closed'));--> statement-breakpoint
ALTER TABLE "crucible"."incidents" ADD CONSTRAINT "incidents_declared_by_filled" CHECK (length(btrim("crucible"."incidents"."declared_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."notifications" ADD CONSTRAINT "notifications_kind_domain" CHECK ("crucible"."notifications"."kind" in ('booking_confirmed', 'booking_cancelled', 'booking_moved', 'incident', 'scenario', 'conflict', 'conflict_overdue', 'recap', 'maintenance_due', 'form_incident', 'test_result', 'consumable_alert', 'outside_works'));--> statement-breakpoint
ALTER TABLE "crucible"."notifications" ADD CONSTRAINT "notifications_title_filled" CHECK (length(btrim("crucible"."notifications"."title")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."scenarios" ADD CONSTRAINT "scenarios_ref_shape" CHECK ("crucible"."scenarios"."ref" ~ '^S-[0-9]{4}-[0-9]{4,}$');--> statement-breakpoint
ALTER TABLE "crucible"."scenarios" ADD CONSTRAINT "scenarios_kind_domain" CHECK ("crucible"."scenarios"."kind" in ('recovery', 'urgency', 'what_if'));--> statement-breakpoint
ALTER TABLE "crucible"."scenarios" ADD CONSTRAINT "scenarios_status_domain" CHECK ("crucible"."scenarios"."status" in ('submitted', 'accepted', 'rejected', 'simulation'));--> statement-breakpoint
ALTER TABLE "crucible"."scenarios" ADD CONSTRAINT "scenarios_decided_dated" CHECK ("crucible"."scenarios"."status" not in ('accepted', 'rejected') or "crucible"."scenarios"."decided_at" is not null);--> statement-breakpoint
ALTER TABLE "crucible"."scenarios" ADD CONSTRAINT "scenarios_created_by_filled" CHECK (length(btrim("crucible"."scenarios"."created_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."weekly_snapshots" ADD CONSTRAINT "weekly_snapshots_monday" CHECK (extract(isodow from "crucible"."weekly_snapshots"."monday") = 1);--> statement-breakpoint
ALTER TABLE "crucible"."weekly_snapshots" ADD CONSTRAINT "weekly_snapshots_hours_non_negative" CHECK ("crucible"."weekly_snapshots"."net_open_hours" >= 0 and "crucible"."weekly_snapshots"."booked_hours" >= 0 and "crucible"."weekly_snapshots"."realised_hours" >= 0 and "crucible"."weekly_snapshots"."realised_with_prep_hours" >= 0 and "crucible"."weekly_snapshots"."blocked_hours" >= 0);--> statement-breakpoint
ALTER TABLE "crucible"."weekly_snapshots" ADD CONSTRAINT "weekly_snapshots_no_shows_non_negative" CHECK ("crucible"."weekly_snapshots"."no_shows" >= 0);--> statement-breakpoint
ALTER TABLE "crucible"."assistant_conversations" ADD CONSTRAINT "assistant_conversations_ref_shape" CHECK ("crucible"."assistant_conversations"."ref" ~ '^AS-[0-9]{4}-[0-9]{4,}$');--> statement-breakpoint
ALTER TABLE "crucible"."assistant_conversations" ADD CONSTRAINT "assistant_conversations_user_name_filled" CHECK (length(btrim("crucible"."assistant_conversations"."user_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."assistant_conversations" ADD CONSTRAINT "assistant_conversations_role_domain" CHECK ("crucible"."assistant_conversations"."role" in ('rd_director', 'coordinator', 'safety', 'facility_manager', 'project_lead', 'technician', 'partner', 'viewer', 'admin'));--> statement-breakpoint
ALTER TABLE "crucible"."assistant_turns" ADD CONSTRAINT "assistant_turns_seq_positive" CHECK ("crucible"."assistant_turns"."seq" >= 1);--> statement-breakpoint
ALTER TABLE "crucible"."assistant_turns" ADD CONSTRAINT "assistant_turns_role_domain" CHECK ("crucible"."assistant_turns"."role" in ('rd_director', 'coordinator', 'safety', 'facility_manager', 'project_lead', 'technician', 'partner', 'viewer', 'admin'));--> statement-breakpoint
ALTER TABLE "crucible"."assistant_turns" ADD CONSTRAINT "assistant_turns_question_filled" CHECK (length(btrim("crucible"."assistant_turns"."question")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."assistant_turns" ADD CONSTRAINT "assistant_turns_provider_domain" CHECK ("crucible"."assistant_turns"."provider" in ('local', 'claude'));--> statement-breakpoint
ALTER TABLE "crucible"."calendar_feeds" ADD CONSTRAINT "calendar_feeds_role_domain" CHECK ("crucible"."calendar_feeds"."role" in ('rd_director', 'coordinator', 'safety', 'facility_manager', 'project_lead', 'technician', 'partner', 'viewer', 'admin'));--> statement-breakpoint
ALTER TABLE "crucible"."calendar_feeds" ADD CONSTRAINT "calendar_feeds_scope_domain" CHECK ("crucible"."calendar_feeds"."scope" in ('mine', 'resource'));--> statement-breakpoint
ALTER TABLE "crucible"."calendar_feeds" ADD CONSTRAINT "calendar_feeds_resource_of_scope" CHECK (("crucible"."calendar_feeds"."scope" = 'resource') = ("crucible"."calendar_feeds"."resource_id" is not null));--> statement-breakpoint
ALTER TABLE "crucible"."calendar_feeds" ADD CONSTRAINT "calendar_feeds_token_hash_shape" CHECK ("crucible"."calendar_feeds"."token_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "crucible"."occupancy_devices" ADD CONSTRAINT "occupancy_devices_kind_domain" CHECK ("crucible"."occupancy_devices"."kind" in ('kiosk', 'agent', 'interlock', 'badge'));--> statement-breakpoint
ALTER TABLE "crucible"."occupancy_devices" ADD CONSTRAINT "occupancy_devices_label_filled" CHECK (length(btrim("crucible"."occupancy_devices"."label")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."occupancy_devices" ADD CONSTRAINT "occupancy_devices_token_hash_shape" CHECK ("crucible"."occupancy_devices"."token_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "crucible"."occupancy_devices" ADD CONSTRAINT "occupancy_devices_created_by_filled" CHECK (length(btrim("crucible"."occupancy_devices"."created_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."occupancy_events" ADD CONSTRAINT "occupancy_events_kind_domain" CHECK ("crucible"."occupancy_events"."kind" in ('start', 'stop'));--> statement-breakpoint
ALTER TABLE "crucible"."occupancy_events" ADD CONSTRAINT "occupancy_events_outcome_domain" CHECK ("crucible"."occupancy_events"."outcome" in ('started', 'ended', 'unbooked_start', 'unbooked_stop', 'ignored'));--> statement-breakpoint
ALTER TABLE "crucible"."maintenance_plans" ADD CONSTRAINT "maintenance_plans_kind_domain" CHECK ("crucible"."maintenance_plans"."kind" in ('preventive', 'calibration'));--> statement-breakpoint
ALTER TABLE "crucible"."maintenance_plans" ADD CONSTRAINT "maintenance_plans_label_filled" CHECK (length(btrim("crucible"."maintenance_plans"."label")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."maintenance_plans" ADD CONSTRAINT "maintenance_plans_period_positive" CHECK ("crucible"."maintenance_plans"."period_months" >= 1);--> statement-breakpoint
ALTER TABLE "crucible"."maintenance_plans" ADD CONSTRAINT "maintenance_plans_updated_by_filled" CHECK (length(btrim("crucible"."maintenance_plans"."updated_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."maintenance_records" ADD CONSTRAINT "maintenance_records_recorded_by_filled" CHECK (length(btrim("crucible"."maintenance_records"."recorded_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."form_responses" ADD CONSTRAINT "form_responses_stage_domain" CHECK ("crucible"."form_responses"."stage" in ('before', 'after', 'incident'));--> statement-breakpoint
ALTER TABLE "crucible"."form_responses" ADD CONSTRAINT "form_responses_version_positive" CHECK ("crucible"."form_responses"."version" >= 1);--> statement-breakpoint
ALTER TABLE "crucible"."form_responses" ADD CONSTRAINT "form_responses_filled_by_filled" CHECK (length(btrim("crucible"."form_responses"."filled_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."form_templates" ADD CONSTRAINT "form_templates_stage_domain" CHECK ("crucible"."form_templates"."stage" in ('before', 'after', 'incident'));--> statement-breakpoint
ALTER TABLE "crucible"."form_templates" ADD CONSTRAINT "form_templates_version_positive" CHECK ("crucible"."form_templates"."version" >= 1);--> statement-breakpoint
ALTER TABLE "crucible"."form_templates" ADD CONSTRAINT "form_templates_updated_by_filled" CHECK (length(btrim("crucible"."form_templates"."updated_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."api_clients" ADD CONSTRAINT "api_clients_label_filled" CHECK (length(btrim("crucible"."api_clients"."label")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."api_clients" ADD CONSTRAINT "api_clients_token_hash_shape" CHECK ("crucible"."api_clients"."token_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "crucible"."api_clients" ADD CONSTRAINT "api_clients_webhook_url_shape" CHECK ("crucible"."api_clients"."webhook_url" ~* '^https?://');--> statement-breakpoint
ALTER TABLE "crucible"."api_clients" ADD CONSTRAINT "api_clients_webhook_secret" CHECK ("crucible"."api_clients"."webhook_url" is null or "crucible"."api_clients"."webhook_secret" is not null);--> statement-breakpoint
ALTER TABLE "crucible"."api_clients" ADD CONSTRAINT "api_clients_cursor_non_negative" CHECK ("crucible"."api_clients"."cursor" >= 0);--> statement-breakpoint
ALTER TABLE "crucible"."api_clients" ADD CONSTRAINT "api_clients_failures_non_negative" CHECK ("crucible"."api_clients"."failures" >= 0);--> statement-breakpoint
ALTER TABLE "crucible"."api_clients" ADD CONSTRAINT "api_clients_created_by_filled" CHECK (length(btrim("crucible"."api_clients"."created_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."api_events" ADD CONSTRAINT "api_events_kind_domain" CHECK ("crucible"."api_events"."kind" in ('booking.requested', 'booking.confirmed', 'booking.in_progress', 'booking.done', 'booking.cancelled', 'booking.no_show', 'booking.moved', 'incident.open', 'incident.closed'));--> statement-breakpoint
ALTER TABLE "crucible"."api_events" ADD CONSTRAINT "api_events_subject" CHECK (("crucible"."api_events"."kind" like 'booking.%' and "crucible"."api_events"."booking_id" is not null) or ("crucible"."api_events"."kind" like 'incident.%' and "crucible"."api_events"."incident_id" is not null));--> statement-breakpoint
ALTER TABLE "crucible"."test_results" ADD CONSTRAINT "test_results_version_positive" CHECK ("crucible"."test_results"."version" >= 1);--> statement-breakpoint
ALTER TABLE "crucible"."test_results" ADD CONSTRAINT "test_results_outcome_domain" CHECK ("crucible"."test_results"."outcome" in ('pass', 'fail', 'retest', 'inconclusive'));--> statement-breakpoint
ALTER TABLE "crucible"."test_results" ADD CONSTRAINT "test_results_eln_url_shape" CHECK ("crucible"."test_results"."eln_url" ~* '^https?://');--> statement-breakpoint
ALTER TABLE "crucible"."test_results" ADD CONSTRAINT "test_results_correction_reason" CHECK ("crucible"."test_results"."version" = 1 or length(btrim("crucible"."test_results"."reason")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."test_results" ADD CONSTRAINT "test_results_recorded_by_filled" CHECK (length(btrim("crucible"."test_results"."recorded_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."charge_rates" ADD CONSTRAINT "charge_rates_cents_non_negative" CHECK ("crucible"."charge_rates"."cents_per_hour" >= 0);--> statement-breakpoint
ALTER TABLE "crucible"."charge_rates" ADD CONSTRAINT "charge_rates_created_by_filled" CHECK (length(btrim("crucible"."charge_rates"."created_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."charge_rates" ADD CONSTRAINT "charge_rates_withdrawn_together" CHECK (("crucible"."charge_rates"."withdrawn_at" is null) = ("crucible"."charge_rates"."withdrawn_by_name" is null));--> statement-breakpoint
ALTER TABLE "crucible"."consumable_lots" ADD CONSTRAINT "consumable_lots_ref_filled" CHECK (length(btrim("crucible"."consumable_lots"."lot_ref")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."consumable_lots" ADD CONSTRAINT "consumable_lots_received_by_filled" CHECK (length(btrim("crucible"."consumable_lots"."received_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."consumable_moves" ADD CONSTRAINT "consumable_moves_kind_domain" CHECK ("crucible"."consumable_moves"."kind" in ('receipt', 'use', 'adjust', 'discard'));--> statement-breakpoint
ALTER TABLE "crucible"."consumable_moves" ADD CONSTRAINT "consumable_moves_quantity_sign" CHECK (("crucible"."consumable_moves"."kind" = 'receipt' and "crucible"."consumable_moves"."quantity" > 0) or ("crucible"."consumable_moves"."kind" in ('use', 'discard') and "crucible"."consumable_moves"."quantity" < 0) or ("crucible"."consumable_moves"."kind" = 'adjust' and "crucible"."consumable_moves"."quantity" <> 0));--> statement-breakpoint
ALTER TABLE "crucible"."consumable_moves" ADD CONSTRAINT "consumable_moves_correction_reason" CHECK ("crucible"."consumable_moves"."kind" not in ('adjust', 'discard') or length(btrim("crucible"."consumable_moves"."reason")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."consumable_moves" ADD CONSTRAINT "consumable_moves_by_filled" CHECK (length(btrim("crucible"."consumable_moves"."by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."consumables" ADD CONSTRAINT "consumables_name_filled" CHECK (length(btrim("crucible"."consumables"."name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."consumables" ADD CONSTRAINT "consumables_unit_filled" CHECK (length(btrim("crucible"."consumables"."unit")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."consumables" ADD CONSTRAINT "consumables_threshold_non_negative" CHECK ("crucible"."consumables"."threshold" >= 0);--> statement-breakpoint
ALTER TABLE "crucible"."consumables" ADD CONSTRAINT "consumables_updated_by_filled" CHECK (length(btrim("crucible"."consumables"."updated_by_name")) > 0);--> statement-breakpoint
ALTER TABLE "crucible"."test_type_consumables" ADD CONSTRAINT "test_type_consumables_quantity_positive" CHECK ("crucible"."test_type_consumables"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "crucible"."test_type_consumables" ADD CONSTRAINT "test_type_consumables_updated_by_filled" CHECK (length(btrim("crucible"."test_type_consumables"."updated_by_name")) > 0);