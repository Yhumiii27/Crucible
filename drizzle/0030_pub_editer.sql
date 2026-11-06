-- Custom SQL migration file, put your code below! ---- Edition from Matrix (request M-19 of Matrix, 05/11/2026; owner's « oui » of 06/11/2026 on this scope): the IT department
-- corrects Crucible's reference data from Matrix's viewer, through this function, with Crucible's rules and audit trail.
-- Matrix never writes in Crucible's tables (M-18); the execution right is a "write" link matrix_app → crucible.pub_editer
-- decided in Matrix. Open tables and columns (anything else is refused): entities, sites, facilities, resources (not the
-- booking limits), projects, people, test types, skills. Closed: bookings (no confirmed booking moves without a traced human
-- decision), the audit trail and every append-only table, accounts and roles, tokens, exclusion rules (validated by safety),
-- rows read from another tool. « retirer » archives (active = false; a resource is retired); a site is never removed. A name
-- that follows another tool (project linked to Keystone, site or entity linked to Matrix, person with a matricule) is changed
-- in that tool. Every change is written to crucible.audit_entries (area Administration, actor « <name> (Matrix) », reason).
CREATE OR REPLACE FUNCTION "crucible"."pub_editer"(p_table text, p_action text, p_cle jsonb, p_valeurs jsonb, p_par text, p_motif text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = crucible, pg_temp AS $$
DECLARE
  v_key text;           -- key column
  v_cols text[];        -- columns Matrix may write
  v_archive text;       -- SET clause of « retirer », null = not removable
  v_enums jsonb;        -- allowed values per column
  v_codes text[];       -- code columns checked like Crucible's forms
  v_follow text;        -- column whose presence means the name follows another tool
  v_extra text := '';   -- updated_by_name for the tables that carry it
  v_col text;
  v_list text;
  v_before jsonb;
  v_after jsonb;
  v_keyval text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('crucible.ecritures'));
  IF coalesce(btrim(p_par), '') = '' THEN RAISE EXCEPTION 'Le nom de la personne est obligatoire'; END IF;
  IF coalesce(btrim(p_motif), '') = '' THEN RAISE EXCEPTION 'Le motif est obligatoire'; END IF;
  IF p_action NOT IN ('ajouter', 'corriger', 'retirer') THEN RAISE EXCEPTION 'Action inconnue : %', p_action; END IF;

  CASE p_table
    WHEN 'entities' THEN
      v_key := 'code'; v_cols := ARRAY['code', 'name', 'kind', 'active', 'matrix_code']; v_archive := 'active = false';
      v_enums := '{"kind": ["internal", "partner"]}'; v_codes := ARRAY['code']; v_follow := 'matrix_code';
    WHEN 'sites' THEN
      v_key := 'code'; v_cols := ARRAY['code', 'name', 'city', 'country_iso2', 'matrix_code']; v_archive := NULL;
      v_enums := '{}'; v_codes := ARRAY['code']; v_follow := 'matrix_code';
    WHEN 'facilities' THEN
      v_key := 'code'; v_cols := ARRAY['code', 'name', 'site_code', 'operator_entity_code', 'description', 'active', 'acquisition_keur'];
      v_archive := 'active = false'; v_enums := '{}'; v_codes := ARRAY['code'];
    WHEN 'resources' THEN
      v_key := 'code'; v_cols := ARRAY['code', 'facility_code', 'name', 'kind', 'granularity', 'capacity', 'setup_minutes', 'teardown_minutes', 'status', 'description'];
      v_archive := 'status = ''retired''';
      v_enums := '{"kind": ["zone", "bench", "machine", "room", "equipment"], "granularity": ["half_day", "hour"], "status": ["in_service", "maintenance", "out_of_service", "retired"]}';
      v_codes := ARRAY['code'];
    WHEN 'projects' THEN
      v_key := 'code'; v_cols := ARRAY['code', 'name', 'entity_code', 'priority_class', 'confidential', 'keystone_code', 'codex_program_code', 'active'];
      v_archive := 'active = false'; v_enums := '{"priority_class": ["P1", "P2", "P3"]}'; v_codes := ARRAY['code']; v_follow := 'keystone_code';
    WHEN 'people' THEN
      v_key := 'id'; v_cols := ARRAY['name', 'entity_code', 'matricule', 'facility_codes', 'active']; v_archive := 'active = false';
      v_enums := '{}'; v_codes := ARRAY[]::text[]; v_follow := 'matricule'; v_extra := ', updated_by_name = $3';
    WHEN 'test_types' THEN
      v_key := 'code'; v_cols := ARRAY['code', 'name', 'nominal_resource_id', 'typical_half_days', 'skills', 'description', 'active'];
      v_archive := 'active = false'; v_enums := '{}'; v_codes := ARRAY['code']; v_extra := ', updated_by_name = $3';
    WHEN 'skills' THEN
      v_key := 'code'; v_cols := ARRAY['code', 'name', 'cursus_titre_id', 'active']; v_archive := 'active = false';
      v_enums := '{}'; v_codes := ARRAY['code'];
    ELSE
      RAISE EXCEPTION 'La table % n''est pas modifiable depuis Matrix (Crucible n''ouvre que ses référentiels)', p_table;
  END CASE;

  -- Values: known columns only, typed like the table, enumerations and codes checked as in Crucible's forms.
  IF p_action IN ('ajouter', 'corriger') THEN
    IF p_valeurs IS NULL OR jsonb_typeof(p_valeurs) <> 'object' OR p_valeurs = '{}'::jsonb THEN RAISE EXCEPTION 'Aucune valeur à écrire'; END IF;
    FOR v_col IN SELECT jsonb_object_keys(p_valeurs) LOOP
      IF NOT v_col = ANY (v_cols) THEN RAISE EXCEPTION 'La colonne %.% n''est pas modifiable depuis Matrix', p_table, v_col; END IF;
      IF v_enums ? v_col AND NOT (v_enums -> v_col) ? (p_valeurs ->> v_col) THEN
        RAISE EXCEPTION 'Valeur refusée pour %.% : % (admises : %)', p_table, v_col, p_valeurs ->> v_col, v_enums -> v_col;
      END IF;
      IF v_col = ANY (v_codes) AND (p_valeurs ->> v_col) !~ '^[A-Z0-9][A-Z0-9-]{1,19}$' THEN
        RAISE EXCEPTION 'Le code % doit avoir 2 à 20 majuscules, chiffres ou tirets', p_valeurs ->> v_col;
      END IF;
      IF v_col = 'country_iso2' AND (p_valeurs ->> v_col) !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'Le pays est un code ISO à deux lettres'; END IF;
      IF v_col = 'name' AND coalesce(btrim(p_valeurs ->> v_col), '') = '' THEN RAISE EXCEPTION 'Le nom ne peut pas être vide'; END IF;
    END LOOP;
  END IF;

  IF p_action = 'ajouter' THEN
    IF p_table = 'people' AND NOT p_valeurs ? 'entity_code' THEN RAISE EXCEPTION 'L''entité de la personne est obligatoire'; END IF;
    SELECT string_agg(quote_ident(k), ', ') INTO v_list FROM jsonb_object_keys(p_valeurs) k;
    EXECUTE format('INSERT INTO crucible.%I (%s%s) SELECT %s%s FROM jsonb_populate_record(NULL::crucible.%I, $1) RETURNING to_jsonb(%I.*)',
      p_table, v_list, CASE WHEN v_extra <> '' THEN ', updated_by_name' ELSE '' END,
      v_list, CASE WHEN v_extra <> '' THEN ', $3' ELSE '' END, p_table, p_table)
      INTO v_after USING p_valeurs, NULL, p_par || ' (Matrix)';
  ELSE
    v_keyval := p_cle ->> v_key;
    IF v_keyval IS NULL THEN RAISE EXCEPTION 'Clé manquante : %', v_key; END IF;
    EXECUTE format('SELECT to_jsonb(t.*) FROM crucible.%I t WHERE t.%I::text = $1 FOR UPDATE', p_table, v_key) INTO v_before USING v_keyval;
    IF v_before IS NULL THEN RAISE EXCEPTION 'Ligne introuvable : %.% = %', p_table, v_key, v_keyval; END IF;
    IF p_action = 'corriger' THEN
      IF v_follow IS NOT NULL AND p_valeurs ? 'name' AND coalesce(v_before ->> v_follow, '') <> '' AND (p_valeurs ->> 'name') IS DISTINCT FROM (v_before ->> 'name') THEN
        RAISE EXCEPTION 'Le nom de cette ligne suit un autre outil (%): corrigez-le dans cet outil', v_follow;
      END IF;
      IF p_valeurs ? v_key AND (p_valeurs ->> v_key) IS DISTINCT FROM v_keyval THEN RAISE EXCEPTION 'La clé % ne se modifie pas', v_key; END IF;
      SELECT string_agg(format('%I = r.%I', k, k), ', ') INTO v_list FROM jsonb_object_keys(p_valeurs) k;
      EXECUTE format('UPDATE crucible.%I t SET %s, updated_at = now()%s FROM jsonb_populate_record(NULL::crucible.%I, $1) r WHERE t.%I::text = $2 RETURNING to_jsonb(t.*)',
        p_table, v_list, v_extra, p_table, v_key) INTO v_after USING p_valeurs, v_keyval, p_par || ' (Matrix)';
    ELSE
      IF v_archive IS NULL THEN RAISE EXCEPTION 'Une ligne de % ne se retire pas (référencée par les installations)', p_table; END IF;
      EXECUTE format('UPDATE crucible.%I t SET %s, updated_at = now()%s WHERE t.%I::text = $2 RETURNING to_jsonb(t.*)', p_table, v_archive, v_extra, v_key)
        INTO v_after USING NULL, v_keyval, p_par || ' (Matrix)';
    END IF;
  END IF;

  INSERT INTO crucible.audit_entries (occurred_at, actor_name, actor_role, object_ref, change, area, entity_type, entity_id, before, after, reason)
  VALUES (now(), p_par || ' (Matrix)', 'matrix', p_table || ' ' || coalesce(v_after ->> v_key, v_keyval), 'edited from Matrix: ' || p_action,
    'Administration', p_table, CASE WHEN v_key = 'id' THEN (v_after ->> 'id')::uuid END, v_before, v_after, btrim(p_motif));
  RETURN v_after;
END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION "crucible"."pub_editer"(text, text, jsonb, jsonb, text, text) FROM PUBLIC;
