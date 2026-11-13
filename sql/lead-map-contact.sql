begin;
create table public.lead_map_contact_requests (
 request_id uuid primary key,
 created_at timestamptz not null default now(),
 access_hash text not null,
 payload_hash text not null,
 ip_hash text,
 action text not null check(action in ('respond','conditions')),
 case_id text,
 case_snapshot jsonb not null default '{}'::jsonb,
 company_name text not null check(length(company_name) between 1 and 120),
 contact_name text not null default '' check(length(contact_name)<=80),
 email text not null check(length(email) between 3 and 254),
 phone text not null check(phone ~ '^0[1-9][0-9]{8,9}$'),
 preferred_date date,
 preferred_window text not null check(preferred_window in ('any','09:00-12:00','12:00-15:00','15:00-18:00')),
 admin_state text not null default 'pending' check(admin_state in ('pending','sending','sent','failed','unknown')),
 receipt_state text not null default 'pending' check(receipt_state in ('pending','sending','sent','failed','unknown')),
 admin_attempts smallint not null default 0,
 receipt_attempts smallint not null default 0,
 admin_claimed_at timestamptz,
 receipt_claimed_at timestamptz,
 admin_provider_id text,
 receipt_provider_id text,
 admin_error text,
 receipt_error text
);
alter table public.lead_map_contact_requests enable row level security;
revoke all on table public.lead_map_contact_requests from public,anon,authenticated;
grant select,insert,update,delete on table public.lead_map_contact_requests to service_role;
create index lead_map_contact_email_created_idx on public.lead_map_contact_requests(email,created_at desc);
create index lead_map_contact_phone_created_idx on public.lead_map_contact_requests(phone,created_at desc);
create index lead_map_contact_ip_created_idx on public.lead_map_contact_requests(ip_hash,created_at desc);

create function public.lead_map_register_contact_v1(p_request_id uuid,p_access_hash text,p_payload_hash text,p_ip_hash text,p_action text,p_case_id text,p_company_name text,p_contact_name text,p_email text,p_phone text,p_preferred_date date,p_preferred_window text)
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
 if p_action not in ('respond','conditions') or p_request_id is null or coalesce(p_access_hash,'')='' or coalesce(p_payload_hash,'')='' then raise exception 'invalid_request' using errcode='22023'; end if;
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

create function public.lead_map_claim_contact_mail_v1(p_request_id uuid,p_kind text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare saved public.lead_map_contact_requests;
begin
 if p_kind='admin' then
  update public.lead_map_contact_requests set admin_state='sending',admin_attempts=admin_attempts+1,admin_claimed_at=now() where request_id=p_request_id and admin_state in ('pending','failed') and admin_attempts<4 returning * into saved;
 elsif p_kind='receipt' then
  update public.lead_map_contact_requests set receipt_state='sending',receipt_attempts=receipt_attempts+1,receipt_claimed_at=now() where request_id=p_request_id and admin_state='sent' and receipt_state in ('pending','failed') and receipt_attempts<4 returning * into saved;
 else raise exception 'invalid_kind' using errcode='22023';
 end if;
 if not found then return null; end if;
 return to_jsonb(saved);
end $$;

revoke all on function public.lead_map_register_contact_v1(uuid,text,text,text,text,text,text,text,text,text,date,text),public.lead_map_claim_contact_mail_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.lead_map_register_contact_v1(uuid,text,text,text,text,text,text,text,text,text,date,text),public.lead_map_claim_contact_mail_v1(uuid,text) to service_role;
commit;
