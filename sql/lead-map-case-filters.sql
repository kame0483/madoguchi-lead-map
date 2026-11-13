begin;
create or replace function public.lead_map_filter_fields_v3(p_detail jsonb,p_items jsonb,p_service text)
returns jsonb language sql immutable security invoker set search_path=pg_catalog
as $$
 select jsonb_build_object('service_code',p_service,'items',coalesce(p_items #>> '{}',''))
 ||coalesce((select jsonb_object_agg('q:'||key,value) from jsonb_each(coalesce(p_detail->'chat_item','{}'::jsonb)) where jsonb_typeof(value) in ('string','number','boolean')),'{}'::jsonb)
 ||coalesce((select jsonb_object_agg('d:'||key,value) from jsonb_each(coalesce(p_detail,'{}'::jsonb)) where key=any(array['building_type','consideration_level','symptoms','story','age_of_building']) and jsonb_typeof(value) in ('string','number','boolean')),'{}'::jsonb);
$$;
create or replace function public.lead_map_filter_matches_v3(p_fields jsonb,p_effective timestamptz,p_as_of timestamptz,p_filters jsonb)
returns boolean language sql immutable security invoker set search_path=pg_catalog
as $$
 select not exists(select 1 from jsonb_each_text(coalesce(p_filters,'{}'::jsonb)) f
 where case when f.key='recent_days' then
 (p_effective at time zone 'Asia/Tokyo')::date < (p_as_of at time zone 'Asia/Tokyo')::date-case f.value when '1' then 0 when '3' then 2 when '7' then 6 when '30' then 29 else -1 end
 else coalesce(p_fields->>f.key,'')<>f.value end);
$$;
create or replace function public.lead_map_page_v3(p_since timestamptz default '2025-12-01T00:00:00+09:00',p_services text[] default array['gaiheki','amamori'],p_keys text[] default null,p_limit integer default 10,p_offset integer default 0,p_as_of timestamptz default now(),p_filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public
as $$
 with d as materialized(select * from public.lead_map_dataset_v2(p_since,p_services,p_as_of) where p_keys is null or (pref||'|'||city)=any(p_keys)),
 filtered as materialized(select * from d where public.lead_map_filter_matches_v3(public.lead_map_filter_fields_v3(detail,items,service_code),effective_at,p_as_of,p_filters)),
 page as(select * from filtered order by effective_at desc,received_at desc,case_id limit greatest(1,least(coalesce(p_limit,10),50)) offset greatest(0,coalesce(p_offset,0)))
 select jsonb_build_object('snapshot',p_as_of,'area_total',(select count(*) from d),'total',(select count(*) from filtered),'cases',coalesce((select jsonb_agg(page order by effective_at desc,received_at desc,case_id) from page),'[]'::jsonb));
$$;
create or replace function public.lead_map_filter_options_v3(p_since timestamptz default '2025-12-01T00:00:00+09:00',p_services text[] default array['gaiheki','amamori'],p_keys text[] default null,p_as_of timestamptz default now())
returns jsonb language sql stable security invoker set search_path=pg_catalog,public
as $$
 with d as materialized(select * from public.lead_map_dataset_v2(p_since,p_services,p_as_of) where p_keys is null or (pref||'|'||city)=any(p_keys)),
 v as(select f.key as field,f.value as value,count(*) as count from d cross join lateral jsonb_each_text(public.lead_map_filter_fields_v3(detail,items,service_code)) f where length(f.value) between 1 and 160 group by f.key,f.value),
 grouped as(select field,jsonb_agg(jsonb_build_object('value',value,'count',count) order by count desc,value) as options from v group by field)
 select jsonb_build_object('total',(select count(*) from d),'fields',coalesce((select jsonb_object_agg(field,options) from grouped),'{}'::jsonb),'snapshot',p_as_of);
$$;
revoke all on function public.lead_map_filter_fields_v3(jsonb,jsonb,text),public.lead_map_filter_matches_v3(jsonb,timestamptz,timestamptz,jsonb),public.lead_map_page_v3(timestamptz,text[],text[],integer,integer,timestamptz,jsonb),public.lead_map_filter_options_v3(timestamptz,text[],text[],timestamptz) from public,anon,authenticated;
grant execute on function public.lead_map_filter_fields_v3(jsonb,jsonb,text),public.lead_map_filter_matches_v3(jsonb,timestamptz,timestamptz,jsonb),public.lead_map_page_v3(timestamptz,text[],text[],integer,integer,timestamptz,jsonb),public.lead_map_filter_options_v3(timestamptz,text[],text[],timestamptz) to service_role;
commit;
