begin;
create table public.lead_map_companies (
 company_id uuid primary key default gen_random_uuid(),
 code text not null unique default replace(gen_random_uuid()::text,'-','') check(code ~ '^[0-9a-f]{32}$'),
 company_name text not null check(length(company_name) between 1 and 120),
 recipient_email text not null check(length(recipient_email) between 3 and 254),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_name,recipient_email)
);
alter table public.lead_map_companies enable row level security;
revoke all on public.lead_map_companies from public,anon,authenticated;
grant select,insert,update,delete on public.lead_map_companies to service_role;
create index lead_map_companies_created_idx on public.lead_map_companies(created_at desc,company_id);
create index lead_map_visits_company_idx on public.lead_map_visits(company_code,last_seen desc) where company_code<>'';

create function public.lead_map_import_companies_v1(p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare item jsonb; r public.lead_map_companies; result jsonb:='[]'::jsonb;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'invalid_rows'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(item->'company_name')<>'string' or jsonb_typeof(item->'recipient_email')<>'string' or length(btrim(item->>'company_name')) not between 1 and 120 or length(btrim(item->>'recipient_email')) not between 3 and 254 then raise exception 'invalid_rows'; end if;
  insert into public.lead_map_companies(company_name,recipient_email) values(btrim(item->>'company_name'),lower(btrim(item->>'recipient_email')))
  on conflict(company_name,recipient_email) do update set updated_at=now() returning * into r;
  result=result||jsonb_build_array(jsonb_build_object('code',r.code,'company_name',r.company_name,'recipient_email',r.recipient_email));
 end loop;
 return jsonb_build_object('rows',result);
end $$;

create function public.lead_map_list_companies_v1(p_limit integer default 500,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('total',(select count(*) from public.lead_map_companies),'rows',coalesce((select jsonb_agg(r order by created_at desc,company_id) from (select company_id,code,company_name,recipient_email,created_at from public.lead_map_companies order by created_at desc,company_id limit least(greatest(p_limit,1),500) offset greatest(p_offset,0))r),'[]'::jsonb));
$$;

create function public.lead_map_admin_report_v2(p_days integer default 7)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
with report as materialized(select public.lead_map_admin_report_v1(p_days) as data),
 v as materialized(select * from public.lead_map_visits where company_code<>'' and last_seen>=now()-make_interval(days=>least(greatest(p_days,1),30))),
 e as materialized(select visit_id,count(*) as clicks from public.lead_map_visit_events where kind='button_click' and created_at>=now()-make_interval(days=>least(greatest(p_days,1),30)) group by visit_id),
 cv as materialized(select visit_id,count(*) as conversions from public.lead_map_contact_requests where created_at>=now()-make_interval(days=>least(greatest(p_days,1),30)) group by visit_id),
 companies as(select c.code,c.company_name,c.recipient_email,count(*) as visits,sum(v.active_ms) as active_ms,sum(coalesce(e.clicks,0)) as clicks,sum(coalesce(cv.conversions,0)) as conversions,max(v.last_seen) as last_seen from public.lead_map_companies c join v on v.company_code=c.code left join e using(visit_id) left join cv using(visit_id) group by c.code,c.company_name,c.recipient_email),
 sessions as(select s.value||jsonb_build_object('sent_company_name',c.company_name,'sent_recipient_email',c.recipient_email) as value,s.ordinality from report cross join lateral jsonb_array_elements(report.data->'sessions') with ordinality s left join public.lead_map_companies c on c.code=s.value->>'company_code')
select data||jsonb_build_object('registered_companies',(select count(*) from public.lead_map_companies),'identified_companies',(select count(*) from companies),'engaged_companies',(select count(*) from companies where clicks>0),'company_activity',coalesce((select jsonb_agg(t order by last_seen desc) from (select * from companies order by last_seen desc limit 100)t),'[]'::jsonb),'sessions',coalesce((select jsonb_agg(value order by ordinality) from sessions),'[]'::jsonb)) from report;
$$;
revoke all on function public.lead_map_import_companies_v1(jsonb),public.lead_map_list_companies_v1(integer,integer),public.lead_map_admin_report_v2(integer) from public,anon,authenticated;
grant execute on function public.lead_map_import_companies_v1(jsonb),public.lead_map_list_companies_v1(integer,integer),public.lead_map_admin_report_v2(integer) to service_role;
commit;
