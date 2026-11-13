begin;
alter table public.lead_map_contact_requests drop constraint lead_map_contact_requests_preferred_window_check;
alter table public.lead_map_contact_requests add constraint lead_map_contact_requests_preferred_window_check check(preferred_window in ('any','now','09:00-12:00','12:00-15:00','15:00-18:00','09:00-10:00','10:00-11:00','11:00-12:00','12:00-13:00','13:00-14:00','14:00-15:00','15:00-16:00','16:00-17:00','17:00-18:00','18:00-19:00','19:00-20:00','20:00-21:00'));
alter table public.lead_map_contact_requests add column visit_id uuid, add column chat_state text not null default 'pending' check(chat_state in ('pending','sending','sent','failed','unknown')), add column chat_attempts integer not null default 0, add column chat_sent_at timestamptz, add column chat_error text, add column email_ack_at timestamptz;
create index lead_map_contact_visit_idx on public.lead_map_contact_requests(visit_id,created_at desc);

create table public.lead_map_visits(
 visit_id uuid primary key, first_seen timestamptz not null default now(), last_seen timestamptz not null default now(),
 active_ms integer not null default 0 check(active_ms between 0 and 86400000), device text not null check(device in ('mobile','desktop')), company_code text not null default '' check(company_code ~ '^[A-Za-z0-9_-]{0,64}$')
);
create table public.lead_map_visit_events(
 event_id uuid primary key, visit_id uuid not null references public.lead_map_visits(visit_id) on delete cascade, created_at timestamptz not null default now(),
 kind text not null check(kind in ('page_view','heartbeat','button_click','area_search','filter_apply','conversion')), page text not null check(page in ('map','thanks')),
 action text not null default '' check(length(action)<=80), case_id text not null default '' check(length(case_id)<=100), area text not null default '' check(length(area)<=100), field text not null default '' check(length(field)<=160), active_ms integer not null check(active_ms between 0 and 86400000)
);
alter table public.lead_map_visits enable row level security;
alter table public.lead_map_visit_events enable row level security;
revoke all on public.lead_map_visits,public.lead_map_visit_events from public,anon,authenticated;
grant select,insert,update,delete on public.lead_map_visits,public.lead_map_visit_events to service_role;
create index lead_map_visits_recent_idx on public.lead_map_visits(last_seen desc);
create index lead_map_events_visit_time_idx on public.lead_map_visit_events(visit_id,created_at desc);
create index lead_map_events_time_idx on public.lead_map_visit_events(created_at desc);

create function public.lead_map_record_activity_v1(p_visit_id uuid,p_device text,p_company_code text,p_events jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare e jsonb; affected integer; latest_ms integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('visit:'||p_visit_id::text,0));
 if jsonb_array_length(p_events) not between 1 and 20 then raise exception 'invalid_events'; end if;
 if (select count(*) from public.lead_map_visit_events where visit_id=p_visit_id and created_at>now()-interval '1 minute')>120 then raise exception 'rate_limited'; end if;
 insert into public.lead_map_visits(visit_id,device,company_code) values(p_visit_id,p_device,p_company_code) on conflict do nothing;
 for e in select value from jsonb_array_elements(p_events) loop
  insert into public.lead_map_visit_events(event_id,visit_id,kind,page,action,case_id,area,field,active_ms)
  values((e->>'event_id')::uuid,p_visit_id,e->>'kind',e->>'page',coalesce(e->>'action',''),coalesce(e->>'case_id',''),coalesce(e->>'area',''),coalesce(e->>'field',''),(e->>'active_ms')::integer) on conflict do nothing;
  get diagnostics affected=row_count;
  if affected>0 then latest_ms=greatest(latest_ms,(e->>'active_ms')::integer); end if;
 end loop;
 update public.lead_map_visits set last_seen=now(),active_ms=greatest(active_ms,latest_ms) where visit_id=p_visit_id;
end $$;

create function public.lead_map_claim_chat_v1(p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.lead_map_contact_requests;
begin
 update public.lead_map_contact_requests set chat_state='sending',chat_attempts=chat_attempts+1,chat_error=null where request_id=p_request_id and chat_state in ('pending','failed') and chat_attempts<4 returning * into r;
 if not found then return null; end if;
 return to_jsonb(r);
end $$;

create function public.lead_map_admin_report_v1(p_days integer default 7)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
with v as materialized(select * from public.lead_map_visits where last_seen>=now()-make_interval(days=>least(greatest(p_days,1),30))),
 e as materialized(select * from public.lead_map_visit_events where created_at>=now()-make_interval(days=>least(greatest(p_days,1),30))),
 c as materialized(select request_id,created_at,action,case_id,company_name,contact_name,email,phone,preferred_date,preferred_window,visit_id,chat_state,chat_error,email_ack_at from public.lead_map_contact_requests where created_at>=now()-make_interval(days=>least(greatest(p_days,1),30))),
 buttons as(select action,count(*) as clicks,count(distinct visit_id) as visits from e where kind='button_click' group by action order by count(*) desc),
 daily as(select (created_at at time zone 'Asia/Tokyo')::date as day,count(distinct visit_id) as visits,count(*) filter(where kind='page_view') as page_views from e group by 1),
 sessions as(select v.*, (select count(*) from e where e.visit_id=v.visit_id and e.kind='button_click') as clicks,(select count(*) from c where c.visit_id=v.visit_id) as conversions,(select company_name from c where c.visit_id=v.visit_id order by created_at desc limit 1) as company_name from v order by last_seen desc limit 100)
select jsonb_build_object('generated_at',now(),'days',p_days,'visits',(select count(*) from v),'active_seconds',(select coalesce(sum(active_ms),0)/1000 from v),'page_views',(select count(*) from e where kind='page_view'),'conversions',(select count(*) from c),'chat_failed',(select count(*) from c where chat_state<>'sent'),'buttons',coalesce((select jsonb_agg(buttons) from buttons),'[]'::jsonb),'daily',coalesce((select jsonb_agg(daily order by day) from daily),'[]'::jsonb),'sessions',coalesce((select jsonb_agg(sessions order by last_seen desc) from sessions),'[]'::jsonb),'contacts',coalesce((select jsonb_agg(t order by created_at desc) from (select * from c order by created_at desc limit 100)t),'[]'::jsonb));
$$;
revoke all on function public.lead_map_record_activity_v1(uuid,text,text,jsonb),public.lead_map_claim_chat_v1(uuid),public.lead_map_admin_report_v1(integer) from public,anon,authenticated;
grant execute on function public.lead_map_record_activity_v1(uuid,text,text,jsonb),public.lead_map_claim_chat_v1(uuid),public.lead_map_admin_report_v1(integer) to service_role;
commit;
