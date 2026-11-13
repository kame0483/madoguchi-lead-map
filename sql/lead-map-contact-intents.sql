begin;
alter table public.lead_map_contact_requests drop constraint lead_map_contact_requests_action_check;
alter table public.lead_map_contact_requests add constraint lead_map_contact_requests_action_check check(action in ('respond','conditions','materials','trial'));
create or replace function public.lead_map_register_contact_v1(p_request_id uuid,p_access_hash text,p_payload_hash text,p_ip_hash text,p_action text,p_case_id text,p_company_name text,p_contact_name text,p_email text,p_phone text,p_preferred_date date,p_preferred_window text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare old public.lead_map_contact_requests; saved public.lead_map_contact_requests; context jsonb:='{}'::jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('email:'||p_email,0));
 perform pg_advisory_xact_lock(hashtextextended('phone:'||p_phone,0));
 if p_ip_hash is not null then perform pg_advisory_xact_lock(hashtextextended('ip:'||p_ip_hash,0)); end if;
 select * into old from public.lead_map_contact_requests where request_id=p_request_id;
 if found then
  if old.access_hash<>p_access_hash or old.payload_hash<>p_payload_hash then raise exception 'idempotency_conflict' using errcode='22023'; end if;
  return to_jsonb(old);
 end if;
 if p_action not in ('respond','conditions','materials','trial') or length(btrim(coalesce(p_contact_name,''))) not between 1 and 80 or p_request_id is null or coalesce(p_access_hash,'')='' or coalesce(p_payload_hash,'')='' then raise exception 'invalid_request' using errcode='22023'; end if;
 if p_preferred_date is not null and (p_preferred_date<(now() at time zone 'Asia/Tokyo')::date or p_preferred_date>(now() at time zone 'Asia/Tokyo')::date+90) then raise exception 'invalid_date' using errcode='22023'; end if;
 if (select count(*) from public.lead_map_contact_requests where created_at>now()-interval '1 day' and (email=p_email or phone=p_phone))>=12 then raise exception 'rate_limited' using errcode='P0001'; end if;
 if p_ip_hash is not null and (select count(*) from public.lead_map_contact_requests where ip_hash=p_ip_hash and created_at>now()-interval '10 minutes')>=10 then raise exception 'rate_limited' using errcode='P0001'; end if;
 if p_case_id is not null then
  select jsonb_build_object('case_id',case_id,'service_code',service_code,'pref',pref,'city',city,'address',address,'inquired_at',inquired_at,'effective_at',effective_at) into context from public.lead_map_dataset_v2() where case_id=p_case_id limit 1;
  if context is null then raise exception 'case_unavailable' using errcode='22023'; end if;
 end if;
 insert into public.lead_map_contact_requests(request_id,access_hash,payload_hash,ip_hash,action,case_id,case_snapshot,company_name,contact_name,email,phone,preferred_date,preferred_window)
 values(p_request_id,p_access_hash,p_payload_hash,p_ip_hash,p_action,p_case_id,context,p_company_name,p_contact_name,p_email,p_phone,p_preferred_date,p_preferred_window) returning * into saved;
 return to_jsonb(saved);
end $$;

commit;
