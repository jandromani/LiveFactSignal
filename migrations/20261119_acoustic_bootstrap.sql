-- LiveFactSignal - acoustic reference bootstrapping
-- Idempotent, non-destructive. Only source-labeled reference vectors are inherited.
-- Does not copy inferred/debate_auto voices or speaker attribution records.
CREATE OR REPLACE FUNCTION public.lfs_seed_voice_reference_for_person()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF NEW.role = 'candidate' THEN
  INSERT INTO public.voice_profiles
    (debate_id,person_name,party,model_id,embedding,duration_ms,
     source_type,source_reference,verified_by,quality_status)
  SELECT NEW.debate_id,v.person_name,NEW.party,v.model_id,v.embedding,v.duration_ms,
         'public-reference',v.source_url||'#t='||coalesce(v.source_segment_start_s::text,'0'),
         'public-source-metadata',v.quality_status
  FROM public.voice_reference_library v
  WHERE v.person_name=NEW.name AND v.quality_status='source-labeled'
    AND NOT EXISTS (
      SELECT 1 FROM public.voice_profiles p
      WHERE p.debate_id=NEW.debate_id AND p.person_name=v.person_name
        AND p.model_id=v.model_id AND p.source_type='public-reference'
        AND p.source_reference=v.source_url||'#t='||coalesce(v.source_segment_start_s::text,'0')
    )
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END
$fn$;

CREATE OR REPLACE TRIGGER lfs_seed_voice_reference_on_roster
AFTER INSERT ON public.debate_roster
FOR EACH ROW EXECUTE FUNCTION public.lfs_seed_voice_reference_for_person();

-- Legacy /api/live?action=create may insert the debate without a participant roster.
-- For derivative live sessions of the root Sánchez-Feijóo event, add the known roster.
CREATE OR REPLACE FUNCTION public.lfs_auto_roster_for_live_run()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
 root_id uuid := 'f3c2fd9b-5fa1-4818-a407-453f5cac4a34'::uuid;
 root_title text;
 root_date date;
BEGIN
 IF NEW.id=root_id OR NEW.source_type<>'live' THEN RETURN NEW; END IF;
 SELECT title,event_date INTO root_title,root_date FROM public.debates WHERE id=root_id;
 IF NEW.event_date IS DISTINCT FROM root_date OR root_title IS NULL
    OR NEW.title NOT LIKE root_title||'%' THEN RETURN NEW; END IF;
 INSERT INTO public.debate_roster (debate_id,name,party,role,aliases,confirmed)
 SELECT NEW.id,r.name,r.party,r.role,r.aliases,r.confirmed
 FROM public.debate_roster r WHERE r.debate_id=root_id
 ON CONFLICT (debate_id,name) DO NOTHING;
 INSERT INTO public.debate_calendar
 (debate_id,slug,scheduled_at,timezone,format,organizer,moderator,headcount,confirmation,topics,
  official_sources,watch_url,watch_platform,display_order,notes,video_youtube_id,stream_verified_at)
 SELECT NEW.id,c.slug||'-run-'||replace(NEW.id::text,'-',''),c.scheduled_at,c.timezone,c.format,c.organizer,c.moderator,
        c.headcount,c.confirmation,c.topics,c.official_sources,c.watch_url,c.watch_platform,500,
        'Captura independiente de seguimiento público',c.video_youtube_id,c.stream_verified_at
 FROM public.debate_calendar c WHERE c.debate_id=root_id
 ON CONFLICT (debate_id) DO NOTHING;
 RETURN NEW;
END
$fn$;

CREATE OR REPLACE TRIGGER lfs_auto_roster_on_live_run
AFTER INSERT ON public.debates
FOR EACH ROW EXECUTE FUNCTION public.lfs_auto_roster_for_live_run();

-- At-most-once acoustic decisions per session, Scribe sequence and time span.
CREATE UNIQUE INDEX IF NOT EXISTS lfs_voice_match_v2_idempotent
ON public.voice_match_events(debate_id,seq,start_ms,end_ms,method)
WHERE method='campplus-v2-span';