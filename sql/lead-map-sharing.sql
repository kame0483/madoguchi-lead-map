begin;
-- Force remains the source of truth. These additions affect only the map registry.
alter table public.lead_map_companies add column if not exists crm_company_id bigint;
create unique index if not exists lead_map_companies_crm_identity on public.lead_map_companies(crm_company_id) where crm_company_id is not null;
create table if not exists public.lead_map_site_settings(
 id text primary key check(id='campaign'),payload jsonb not null,updated_at timestamptz not null default now()
);
alter table public.lead_map_site_settings enable row level security;
revoke all on public.lead_map_site_settings from public,anon,authenticated;
grant select,insert,update on public.lead_map_site_settings to service_role;
create or replace function public.lead_map_link_crm_company_v1(p_company_id bigint)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c record;r public.lead_map_companies; imported jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('lead-map-crm:'||p_company_id::text,0));
 select id,company_name,email,prefecture,city into c from public.companies where id=p_company_id;
 if not found or coalesce(length(btrim(c.company_name)),0) not between 1 and 120 then raise exception 'company_unavailable';end if;
 select * into r from public.lead_map_companies where crm_company_id=p_company_id;
 if not found then
  -- Stable MF ID is sufficient, including when email is missing or changes.
  imported=public.lead_map_import_companies_v1(jsonb_build_array(jsonb_build_object('company_name',btrim(c.company_name),'recipient_email','','external_ref','MF:'||c.id::text)));
  update public.lead_map_companies set crm_company_id=c.id where code=imported->'rows'->0->>'code' returning * into r;
 end if;
 return jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('code',r.code,'company_name',c.company_name,'recipient_email',r.recipient_email,'external_ref',r.external_ref,'crm_company_id',c.id,'prefecture',c.prefecture,'city',c.city)));
end $$;
create or replace function public.lead_map_list_companies_v1(p_limit integer default 500,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('total',(select count(*) from public.lead_map_companies),'rows',coalesce((select jsonb_agg(r order by created_at desc,company_id) from (select l.company_id,l.code,coalesce(c.company_name,l.company_name) as company_name,l.recipient_email,l.external_ref,l.created_at,l.crm_company_id,c.prefecture,c.city from public.lead_map_companies l left join public.companies c on c.id=l.crm_company_id order by l.created_at desc,l.company_id limit least(greatest(p_limit,1),500) offset greatest(p_offset,0))r),'[]'::jsonb));
$$;
revoke all on function public.lead_map_link_crm_company_v1(bigint) from public,anon,authenticated;
grant execute on function public.lead_map_link_crm_company_v1(bigint) to service_role;
commit;
