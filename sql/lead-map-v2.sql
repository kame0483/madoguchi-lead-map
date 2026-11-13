-- Shared dataset: latest state BEFORE eligibility/area/date filtering.
-- No raw contact object is returned. All entrypoints are service_role-only.
begin;
create or replace function public.lead_map_redact_v2(v text)
returns text language sql immutable security invoker set search_path = pg_catalog
as $$
 select regexp_replace(regexp_replace(left(coalesce(v,''),1000),
 '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}', '[非表示]', 'g'),
 '(0[0-9]{1,4}[- ー－]?[0-9]{1,4}[- ー－]?[0-9]{4}|[+]81[- 0-9]{9,16})', '[電話番号非表示]', 'g');
$$;

create or replace function public.lead_map_dataset_v2(
 p_since timestamptz default '2025-12-01T00:00:00+09:00',
 p_services text[] default array['gaiheki','amamori'], p_as_of timestamptz default now())
returns table(case_id text,service_code text,received_at timestamptz,effective_at timestamptz,
 inquired_at text,state text,pref text,city text,postal_code text,address text,
 customer_surname text,masked_phone text,detail jsonb,item_detail jsonb,items jsonb,survey jsonb)
language sql stable security invoker set search_path = pg_catalog,public
as $$
 with expanded as (
 select l.id,l.received_at,l.service_code,r.ord,r.row,
 coalesce(nullif(trim(r.row->>'eid'),''),md5(coalesce(l.service_code,'')||'|'||coalesce(r.row->>'inquired_at','')||'|'||coalesce(r.row->>'pref','')||'|'||coalesce(r.row->>'city','')||'|'||coalesce(r.row->'customer'->>'address',''))) as case_id
 from public.estima_ingest_log l
 cross join lateral jsonb_array_elements(case when jsonb_typeof(l.body->'rows')='array' then l.body->'rows' else '[]'::jsonb end) with ordinality r(row,ord)
 where l.fn='lead' and l.service_code in ('gaiheki','amamori') and l.received_at<=p_as_of
 ), latest as (
 select distinct on(case_id) * from expanded order by case_id,received_at desc,id desc,ord desc
 ), dated as (
 select *,case when row->>'inquired_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (row->>'inquired_at')::timestamptz else received_at end as effective_at,
 regexp_replace(coalesce(row->'customer'->>'phone',''),'[^0-9]','','g') as digits,
 trim(coalesce(row->'customer'->>'name','')) as full_name
 from latest
 ), eligible as (
 select * from dated where service_code=any(p_services) and row->>'state' in ('enabled','pending')
 and coalesce(row->>'pref','')<>'' and coalesce(row->>'city','')<>''
 and effective_at>=p_since and effective_at<=p_as_of
 )
 select e.case_id,e.service_code,e.received_at,e.effective_at,e.row->>'inquired_at',e.row->>'state',
 trim(e.row->>'pref'),regexp_replace(replace(trim(e.row->>'city'),'ヶ','ケ'),'[[:space:]　]','','g'),
 substring(coalesce(e.row->'customer'->>'address','') from '([0-9]{3}-?[0-9]{4})'),
 public.lead_map_redact_v2(e.row->'customer'->>'address'),
 case when e.full_name ~ '[[:space:]　]' then public.lead_map_redact_v2(split_part(regexp_replace(e.full_name,'[[:space:]　]+',' ','g'),' ',1)) else '' end,
 case when length(e.digits)=11 then left(e.digits,3)||'-'||substr(e.digits,4,4)||'-****'
 when length(e.digits)=10 then left(e.digits,3)||'-'||substr(e.digits,4,3)||'-****'
 when length(e.digits)>4 then left(e.digits,length(e.digits)-4)||'****' else '' end,
 jsonb_build_object('chat_item',coalesce((
 select jsonb_object_agg(k,public.lead_map_redact_v2(v #>> '{}'))
 from jsonb_each(case when jsonb_typeof(e.row->'detail'->'chat_item')='object' then e.row->'detail'->'chat_item' else '{}'::jsonb end) q(k,v)
 where k=any(array[
 '物件は幹線道路沿い、または線路沿いですか？','築年数は？','外壁に色あせはみられますか？',
 'ベランダや屋根にテレビやBSなどのアンテナは設置してますか？','屋根の傾斜は？','物件の種類は？',
 '屋根材にひび割れや欠けはありますか？','敷地内に車は止めていますか？',
 '家が崖に隣接していたり、3メートル以上の高低差がある箇所はありますか？','屋根にカビや苔はありますか？',
 'すでに見積もりはお持ちですか？','ヘアークラックはありますか？','日当たりが良い立地ですか？',
 '外壁にはがれはありますか？','お庭やベランダに移動できない木や草花はありますか？','室外機はいくつありますか？',
 '雨漏りや漏水の症状はありますか？','何回建てでしょうか？','外壁or屋根の工事歴は？',
 '工事の予定はいつになりますか？','シロアリ・羽アリは発生してますか？','外壁にカビや苔はありますか？',
 '瓦に色あせはみられますか？','外壁の工事歴は？','隣の家との距離はどのくらいですか？',
 '延べ床面積は、おおよそどのくらいでしょうか？','お住まいの屋根材はどちらになりますか？',
 'チョーキングはありますか？','一戸建てですか？','屋根はどのような形ですか？',
 '屋根瓦にひび割れや欠けはありますか？','外壁材は？','屋根の色がくすんでいませんか？',
 '内壁にカビ・雨漏りはありますか？','物件は、山や林の中に建っていますか'])
 and jsonb_typeof(v) in ('string','number','boolean')
 ),'{}'::jsonb)) || coalesce((
 select jsonb_object_agg(k,public.lead_map_redact_v2(v #>> '{}'))
 from jsonb_each(case when jsonb_typeof(e.row->'detail')='object' then e.row->'detail' else '{}'::jsonb end) q(k,v)
 where k=any(array['building_type','consideration_level','symptoms','story','age_of_building'])
 and jsonb_typeof(v) in ('string','number','boolean')
 ),'{}'::jsonb),
 'null'::jsonb,to_jsonb(public.lead_map_redact_v2(e.row->>'items')),'null'::jsonb
 from eligible e;
$$;

create or replace function public.lead_map_bootstrap_v2(p_since timestamptz default '2025-12-01T00:00:00+09:00',p_services text[] default array['gaiheki','amamori'],p_as_of timestamptz default now())
returns jsonb language sql stable security invoker set search_path=pg_catalog,public
as $$
 with d as materialized(select * from public.lead_map_dataset_v2(p_since,p_services,p_as_of)),
 s as(select service_code,pref,city,count(*) case_count,max(received_at) latest_received_at from d group by service_code,pref,city),
 m as(select count(*) total,
 count(*) filter(where (effective_at at time zone 'Asia/Tokyo')::date=(p_as_of at time zone 'Asia/Tokyo')::date) today,
 count(*) filter(where (effective_at at time zone 'Asia/Tokyo')::date between (p_as_of at time zone 'Asia/Tokyo')::date-6 and (p_as_of at time zone 'Asia/Tokyo')::date) last7 from d)
 select jsonb_build_object('snapshot',p_as_of,'rows',coalesce((select jsonb_agg(s order by pref,city,service_code) from s),'[]'::jsonb),'metrics',(select to_jsonb(m) from m));
$$;

create or replace function public.lead_map_page_v2(p_since timestamptz default '2025-12-01T00:00:00+09:00',p_services text[] default array['gaiheki','amamori'],p_keys text[] default null,p_limit integer default 50,p_offset integer default 0,p_as_of timestamptz default now())
returns jsonb language sql stable security invoker set search_path=pg_catalog,public
as $$
 with d as materialized(select * from public.lead_map_dataset_v2(p_since,p_services,p_as_of) where p_keys is null or (pref||'|'||city)=any(p_keys)),
 page as(select * from d order by effective_at desc,received_at desc,case_id limit greatest(1,least(coalesce(p_limit,50),50)) offset greatest(0,coalesce(p_offset,0)))
 select jsonb_build_object('snapshot',p_as_of,'total',(select count(*) from d),'cases',coalesce((select jsonb_agg(page order by effective_at desc,received_at desc,case_id) from page),'[]'::jsonb));
$$;

-- Compatibility entrypoints retain their names, columns and role grants.
create or replace function public.lead_map_summary_v1(p_since timestamptz default '2025-12-01T00:00:00+09:00',p_services text[] default array['gaiheki','amamori'])
returns table(service_code text,pref text,city text,case_count bigint,latest_received_at timestamptz)
language sql stable security invoker set search_path=pg_catalog,public
as $$ select service_code,pref,city,count(*),max(received_at) from public.lead_map_dataset_v2(p_since,p_services) group by service_code,pref,city $$;

create or replace function public.lead_map_metrics_v1(p_since timestamptz default '2025-12-01T00:00:00+09:00',p_services text[] default array['gaiheki','amamori'])
returns table(total_count bigint,today_count bigint,last7_count bigint)
language sql stable security invoker set search_path=pg_catalog,public
as $$ select count(*),count(*) filter(where (effective_at at time zone 'Asia/Tokyo')::date=(now() at time zone 'Asia/Tokyo')::date),count(*) filter(where (effective_at at time zone 'Asia/Tokyo')::date between (now() at time zone 'Asia/Tokyo')::date-6 and (now() at time zone 'Asia/Tokyo')::date) from public.lead_map_dataset_v2(p_since,p_services) $$;

create or replace function public.lead_map_cases_v1(p_since timestamptz default '2025-12-01T00:00:00+09:00',p_services text[] default array['gaiheki','amamori'],p_keys text[] default null,p_limit integer default 50,p_offset integer default 0)
returns table(case_id text,service_code text,received_at timestamptz,inquired_at text,state text,pref text,city text,postal_code text,address text,customer_surname text,masked_phone text,detail jsonb,item_detail jsonb,items jsonb,survey jsonb,total_count bigint)
language sql stable security invoker set search_path=pg_catalog,public
as $$ select case_id,service_code,received_at,inquired_at,state,pref,city,postal_code,address,customer_surname,masked_phone,detail,item_detail,items,survey,count(*) over() from public.lead_map_dataset_v2(p_since,p_services) where p_keys is null or (pref||'|'||city)=any(p_keys) order by effective_at desc,received_at desc,case_id limit greatest(1,least(coalesce(p_limit,50),500)) offset greatest(0,coalesce(p_offset,0)) $$;

revoke all on function public.lead_map_redact_v2(text),public.lead_map_dataset_v2(timestamptz,text[],timestamptz),public.lead_map_bootstrap_v2(timestamptz,text[],timestamptz),public.lead_map_page_v2(timestamptz,text[],text[],integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.lead_map_redact_v2(text),public.lead_map_dataset_v2(timestamptz,text[],timestamptz),public.lead_map_bootstrap_v2(timestamptz,text[],timestamptz),public.lead_map_page_v2(timestamptz,text[],text[],integer,integer,timestamptz) to service_role;
commit;
