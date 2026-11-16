begin;
alter table public.lead_map_companies add column external_ref text not null default '' check(length(external_ref)<=120);
alter table public.lead_map_companies alter column recipient_email set default '';
alter table public.lead_map_companies drop constraint lead_map_companies_recipient_email_check;
alter table public.lead_map_companies add constraint lead_map_companies_recipient_email_check check(recipient_email='' or length(recipient_email) between 3 and 254);
alter table public.lead_map_companies add constraint lead_map_companies_identity_check check(recipient_email<>'' or external_ref<>'');
alter table public.lead_map_companies drop constraint lead_map_companies_company_name_recipient_email_key;
create unique index lead_map_companies_email_identity on public.lead_map_companies(company_name,recipient_email) where recipient_email<>'';
create unique index lead_map_companies_ref_identity on public.lead_map_companies(company_name,external_ref) where recipient_email='' and external_ref<>'';

create or replace function public.lead_map_import_companies_v1(p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare item jsonb; r public.lead_map_companies; result jsonb:='[]'::jsonb; name text; email text; ref text;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'invalid_rows'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  name=btrim(item->>'company_name');email=lower(btrim(coalesce(item->>'recipient_email','')));ref=btrim(coalesce(item->>'external_ref',''));
  if coalesce(length(name),0) not between 1 and 120 or (email<>'' and length(email) not between 3 and 254) or length(ref)>120 or (email='' and ref='') then raise exception 'invalid_rows'; end if;
  if email<>'' then
   insert into public.lead_map_companies(company_name,recipient_email,external_ref) values(name,email,ref)
   on conflict(company_name,recipient_email) where recipient_email<>'' do update set updated_at=now(),external_ref=coalesce(nullif(excluded.external_ref,''),public.lead_map_companies.external_ref) returning * into r;
  else
   insert into public.lead_map_companies(company_name,recipient_email,external_ref) values(name,'',ref)
   on conflict(company_name,external_ref) where recipient_email='' and external_ref<>'' do update set updated_at=now() returning * into r;
  end if;
  result=result||jsonb_build_array(jsonb_build_object('code',r.code,'company_name',r.company_name,'recipient_email',r.recipient_email,'external_ref',r.external_ref));
 end loop;
 return jsonb_build_object('rows',result);
end $$;

create or replace function public.lead_map_list_companies_v1(p_limit integer default 500,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('total',(select count(*) from public.lead_map_companies),'rows',coalesce((select jsonb_agg(r order by created_at desc,company_id) from (select company_id,code,company_name,recipient_email,external_ref,created_at from public.lead_map_companies order by created_at desc,company_id limit least(greatest(p_limit,1),500) offset greatest(p_offset,0))r),'[]'::jsonb));
$$;
create or replace function public.lead_map_admin_report_v2(p_days integer default 7)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
with report as materialized(select public.lead_map_admin_report_v1(p_days) as data),
 v as materialized(select * from public.lead_map_visits where company_code<>'' and last_seen>=now()-make_interval(days=>least(greatest(p_days,1),30))),
 e as materialized(select visit_id,count(*) as clicks from public.lead_map_visit_events where kind='button_click' and created_at>=now()-make_interval(days=>least(greatest(p_days,1),30)) group by visit_id),
 cv as materialized(select visit_id,count(*) as conversions from public.lead_map_contact_requests where created_at>=now()-make_interval(days=>least(greatest(p_days,1),30)) group by visit_id),
 companies as(select c.code,c.company_name,c.recipient_email,c.external_ref,count(*) as visits,sum(v.active_ms) as active_ms,sum(coalesce(e.clicks,0)) as clicks,sum(coalesce(cv.conversions,0)) as conversions,max(v.last_seen) as last_seen from public.lead_map_companies c join v on v.company_code=c.code left join e using(visit_id) left join cv using(visit_id) group by c.code,c.company_name,c.recipient_email,c.external_ref),
 sessions as(select s.value||jsonb_build_object('sent_company_name',c.company_name,'sent_recipient_email',c.recipient_email,'sent_company_ref',c.external_ref) as value,s.ordinality from report cross join lateral jsonb_array_elements(report.data->'sessions') with ordinality s left join public.lead_map_companies c on c.code=s.value->>'company_code')
select data||jsonb_build_object('registered_companies',(select count(*) from public.lead_map_companies),'identified_companies',(select count(*) from companies),'engaged_companies',(select count(*) from companies where clicks>0),'company_activity',coalesce((select jsonb_agg(t order by last_seen desc) from (select * from companies order by last_seen desc limit 100)t),'[]'::jsonb),'sessions',coalesce((select jsonb_agg(value order by ordinality) from sessions),'[]'::jsonb)) from report;
$$;

revoke all on function public.lead_map_import_companies_v1(jsonb),public.lead_map_list_companies_v1(integer,integer),public.lead_map_admin_report_v2(integer) from public,anon,authenticated;
grant execute on function public.lead_map_import_companies_v1(jsonb),public.lead_map_list_companies_v1(integer,integer),public.lead_map_admin_report_v2(integer) to service_role;
commit;
