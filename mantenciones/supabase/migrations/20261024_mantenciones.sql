-- SERVIRUTA MANTENCIONES — extensión del cotizador existente (pack_modelos / productos_pack)
-- Prefijo mant_. No modifica tablas existentes. Costos solo visibles para staff.

create extension if not exists pgcrypto;

-- ---------- helper de rol (user_metadata.rol, convención actual del proyecto) ----------
create or replace function public.mant_es_staff() returns boolean
language sql stable as $$
  select coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'rol') in ('owner','coord_senior','coord_junior')
    or (auth.jwt() -> 'app_metadata' ->> 'rol') in ('owner','coord_senior','coord_junior'),
    false);
$$;

-- ---------- proveedores ----------
create table if not exists public.mant_proveedores (
  id serial primary key,
  nombre text not null unique,
  tipo text,                     -- retail, distribuidor, fabricante
  url text,
  notas text,
  activo boolean default true,
  created_at timestamptz default now()
);

-- ---------- variantes de vehículo (hijas de pack_modelos) ----------
create table if not exists public.mant_variantes (
  id serial primary key,
  modelo_id integer not null references public.pack_modelos(id) on delete cascade,
  generacion text,
  anio_desde integer,
  anio_hasta integer,            -- null = vigente
  combustible text not null default 'bencina' check (combustible in ('bencina','diesel','hibrido','electrico','gnc')),
  cilindrada numeric(4,1),
  codigo_motor text,
  mercado text default 'CL',
  notas text,
  activo boolean default true,
  created_at timestamptz default now()
);
create index if not exists mant_variantes_modelo_idx on public.mant_variantes(modelo_id);

-- ---------- lubricantes ----------
create table if not exists public.mant_lubricantes (
  id serial primary key,
  marca text not null,
  producto text not null,
  sae text not null,             -- 5W-30, 10W-40...
  normas text[] default '{}',    -- API SN, ACEA C3, dexos1...
  envase_litros numeric(4,1),
  precio_ref integer,            -- CLP, con IVA, precio público del proveedor
  proveedor_id integer references public.mant_proveedores(id),
  sku text,
  url text,
  fuente text,
  consultado_at date,
  notas text,
  activo boolean default true
);

-- ---------- filtros ----------
create table if not exists public.mant_filtros (
  id serial primary key,
  tipo text not null check (tipo in ('aceite','aire','habitaculo','combustible')),
  marca text not null,
  codigo text not null,
  precio_ref integer,
  proveedor_id integer references public.mant_proveedores(id),
  sku text,
  url text,
  fuente text,
  consultado_at date,
  notas text,
  activo boolean default true,
  unique (marca, codigo)
);

-- ---------- aplicaciones: qué lleva cada variante (regla crítica: nada inventado) ----------
create table if not exists public.mant_aplicaciones (
  id serial primary key,
  variante_id integer not null references public.mant_variantes(id) on delete cascade,
  lubricante_id integer references public.mant_lubricantes(id),
  sae text,
  normas text[] default '{}',
  capacidad_con_filtro numeric(4,1),
  capacidad_sin_filtro numeric(4,1),
  intervalo_km integer,
  filtro_aceite_id integer references public.mant_filtros(id),
  filtro_aire_id integer references public.mant_filtros(id),
  filtro_habitaculo_id integer references public.mant_filtros(id),
  filtro_combustible_id integer references public.mant_filtros(id),
  fuente text,
  url text,
  consultado_at date,
  notas text,
  estado text not null default 'needs_review' check (estado in ('verified','needs_review','unavailable')),
  revisado_por text,
  revisado_at timestamptz,
  updated_at timestamptz default now(),
  unique (variante_id)
);

-- ---------- packs (plantillas) ----------
create table if not exists public.mant_packs (
  tipo text primary key,         -- esencial, estandar, completo, diesel
  nombre text not null,
  descripcion text,
  incluye text[] not null,       -- aceite, filtro_aceite, filtro_aire, filtro_habitaculo, filtro_combustible, mano_obra, revision
  orden integer default 0,
  activo boolean default true
);
insert into public.mant_packs (tipo,nombre,descripcion,incluye,orden) values
 ('esencial','Esencial','Aceite + filtro de aceite + mano de obra + revisión básica.', '{aceite,filtro_aceite,mano_obra,revision}',1),
 ('estandar','Estándar','Esencial + filtro de aire (cuando aplique).', '{aceite,filtro_aceite,filtro_aire,mano_obra,revision}',2),
 ('completo','Completo','Aceite + filtro de aceite + filtro de aire + filtro de habitáculo/polen.', '{aceite,filtro_aceite,filtro_aire,filtro_habitaculo,mano_obra,revision}',3),
 ('diesel','Diésel','Aceite correcto + filtros de aceite, aire y combustible/separador de agua; habitáculo opcional.', '{aceite,filtro_aceite,filtro_aire,filtro_combustible,mano_obra,revision}',4)
on conflict (tipo) do nothing;

-- ---------- precios por modelo y pack (costos internos) ----------
create table if not exists public.mant_pack_precios (
  id serial primary key,
  modelo_id integer not null references public.pack_modelos(id) on delete cascade,
  pack_tipo text not null references public.mant_packs(tipo),
  costo_aceite integer default 0,
  costo_filtros integer default 0,
  costo_insumos integer default 0,
  mano_obra integer default 0,
  traslado integer default 0,
  disposicion_aceite integer default 0,
  otros_costos integer default 0,
  costo_directo integer generated always as (coalesce(costo_aceite,0)+coalesce(costo_filtros,0)+coalesce(costo_insumos,0)+coalesce(mano_obra,0)+coalesce(traslado,0)+coalesce(disposicion_aceite,0)+coalesce(otros_costos,0)) stored,
  precio_final integer not null,                 -- precio público, IVA incluido
  iva_pct numeric(4,2) default 19,
  precio_neto integer generated always as (round(precio_final / (1 + coalesce(iva_pct,19)/100.0))) stored,
  margen_pct numeric(5,2) generated always as (
    case when precio_final > 0 then round(
      (round(precio_final / (1 + coalesce(iva_pct,19)/100.0)) - (coalesce(costo_aceite,0)+coalesce(costo_filtros,0)+coalesce(costo_insumos,0)+coalesce(mano_obra,0)+coalesce(traslado,0)+coalesce(disposicion_aceite,0)+coalesce(otros_costos,0)))
      * 100.0 / round(precio_final / (1 + coalesce(iva_pct,19)/100.0)), 2) else null end) stored,
  fuente_costo text,
  costo_actualizado_at date,
  estado text not null default 'borrador' check (estado in ('borrador','publicado','pausado')),
  notas text,
  updated_at timestamptz default now(),
  unique (modelo_id, pack_tipo)
);

-- Semilla: los 33 packs "mantencion" actuales pasan a 'completo' (precio mantenido). Costos: ref actual, marcados estimado.
insert into public.mant_pack_precios (modelo_id, pack_tipo, costo_filtros, mano_obra, precio_final, fuente_costo, estado, notas)
select p.modelo_id,
       case when p.incluye ilike '%combustible%' then 'diesel' else 'completo' end,
       p.precio_repuesto_ref, p.mano_obra, p.precio_final,
       coalesce(p.fuente_ref,'estimado'), 'publicado',
       'Migrado de productos_pack (' || coalesce(p.estado,'') || '). Costo de repuestos estimado; pendiente desglose aceite/filtros.'
from public.productos_pack p
where p.tipo_pack = 'mantencion' and p.precio_final is not null
on conflict (modelo_id, pack_tipo) do nothing;

-- ---------- zonas de servicio ----------
create table if not exists public.mant_comunas (
  id serial primary key,
  region text not null default 'RM',
  comuna text not null unique,
  estado text not null default 'activa' check (estado in ('activa','confirmacion','sin_cobertura')),
  recargo integer default 0,
  notas text
);
insert into public.mant_comunas (comuna, estado, notas) values
 ('Santiago','activa',null),('Providencia','activa',null),('Las Condes','activa',null),('Vitacura','activa',null),('Lo Barnechea','activa',null),
 ('Ñuñoa','activa',null),('La Reina','activa',null),('Macul','activa',null),('Peñalolén','activa',null),('La Florida','activa',null),
 ('Puente Alto','activa',null),('San Joaquín','activa',null),('San Miguel','activa',null),('La Cisterna','activa',null),('El Bosque','activa',null),
 ('La Granja','activa',null),('San Ramón','activa',null),('La Pintana','activa',null),('Pedro Aguirre Cerda','activa',null),('Lo Espejo','activa',null),
 ('Cerrillos','activa',null),('Maipú','activa',null),('Estación Central','activa',null),('Quinta Normal','activa',null),('Cerro Navia','activa',null),
 ('Lo Prado','activa',null),('Pudahuel','activa',null),('Renca','activa',null),('Independencia','activa',null),('Recoleta','activa',null),
 ('Conchalí','activa',null),('Huechuraba','activa',null),('Quilicura','activa',null),('San Bernardo','activa',null),
 ('Colina','confirmacion','Confirmación de coordinación requerida'),('Lampa','confirmacion','Confirmación de coordinación requerida'),
 ('Peñaflor','confirmacion','Confirmación de coordinación requerida'),('Calera de Tango','confirmacion','Confirmación de coordinación requerida'),
 ('Padre Hurtado','confirmacion','Confirmación de coordinación requerida'),('Talagante','confirmacion','Confirmación de coordinación requerida'),
 ('Buin','confirmacion','Confirmación de coordinación requerida'),('Paine','confirmacion','Confirmación de coordinación requerida'),
 ('Melipilla','sin_cobertura',null),('Pirque','confirmacion',null),('San José de Maipo','sin_cobertura',null),('Tiltil','sin_cobertura',null),
 ('Curacaví','sin_cobertura',null),('María Pinto','sin_cobertura',null),('Alhué','sin_cobertura',null),('Isla de Maipo','confirmacion',null),
 ('El Monte','confirmacion',null)
on conflict (comuna) do nothing;

-- ---------- solicitudes ----------
create table if not exists public.mant_solicitudes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  nombre text not null check (length(trim(nombre)) between 2 and 80),
  telefono text not null check (telefono ~ '^\+?56?\s?9\s?\d{4}\s?\d{4}$' or telefono ~ '^\d{8,12}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  comuna text not null,
  direccion_aprox text,
  modelo_id integer references public.pack_modelos(id),
  variante_id integer references public.mant_variantes(id),
  vehiculo_texto text,                   -- lo que escribió el cliente si no estaba en catálogo
  anio integer check (anio is null or anio between 1980 and 2030),
  kilometraje integer check (kilometraje is null or kilometraje between 0 and 2000000),
  pack_tipo text references public.mant_packs(tipo),
  precio_mostrado integer,
  fecha_preferida date,
  hora_preferida text,
  comentarios text check (comentarios is null or length(comentarios) <= 1000),
  consentimiento boolean not null default false check (consentimiento = true),
  tipo text not null default 'cotizacion' check (tipo in ('cotizacion','reserva','validacion')),
  estado text not null default 'nueva' check (estado in ('nueva','contactada','cotizando','pendiente_confirmacion','confirmada','completada','cancelada')),
  asignado_a text,
  origen text default 'web',
  utm jsonb,
  user_agent text,
  website text check (website is null or website = ''),   -- honeypot: debe venir vacío
  updated_at timestamptz default now()
);
create index if not exists mant_solicitudes_estado_idx on public.mant_solicitudes(estado, created_at desc);

create table if not exists public.mant_solicitudes_historial (
  id bigserial primary key,
  solicitud_id uuid not null references public.mant_solicitudes(id) on delete cascade,
  estado_anterior text,
  estado_nuevo text not null,
  usuario text,
  nota text,
  created_at timestamptz default now()
);

create or replace function public.mant_solicitud_historial_fn() returns trigger
language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    insert into public.mant_solicitudes_historial(solicitud_id, estado_anterior, estado_nuevo, usuario, nota)
    values (new.id, null, new.estado, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'web'), 'Solicitud creada');
  elsif new.estado is distinct from old.estado then
    insert into public.mant_solicitudes_historial(solicitud_id, estado_anterior, estado_nuevo, usuario)
    values (new.id, old.estado, new.estado, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'sistema'));
  end if;
  return new;
end $$;
drop trigger if exists mant_solicitudes_historial_tg on public.mant_solicitudes;
create trigger mant_solicitudes_historial_tg
  after insert or update on public.mant_solicitudes
  for each row execute function public.mant_solicitud_historial_fn();

create or replace function public.mant_solicitud_touch_fn() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists mant_solicitudes_touch_tg on public.mant_solicitudes;
create trigger mant_solicitudes_touch_tg before update on public.mant_solicitudes
  for each row execute function public.mant_solicitud_touch_fn();

-- anti-spam: máximo 3 solicitudes por teléfono cada 10 minutos
create or replace function public.mant_solicitud_ratelimit_fn() returns trigger
language plpgsql security definer as $$
declare n int;
begin
  select count(*) into n from public.mant_solicitudes
   where telefono = new.telefono and created_at > now() - interval '10 minutes';
  if n >= 3 then raise exception 'Demasiadas solicitudes. Intenta más tarde.' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists mant_solicitudes_ratelimit_tg on public.mant_solicitudes;
create trigger mant_solicitudes_ratelimit_tg
  before insert on public.mant_solicitudes
  for each row execute function public.mant_solicitud_ratelimit_fn();

-- ---------- vistas ----------
-- Catálogo público: SIN costos ni márgenes. Solo packs publicados.
create or replace view public.v_mant_catalogo_publico with (security_invoker = false) as
select m.id as modelo_id, m.marca, m.modelo, m.motor, m.anios, m.segmento, m.origen,
       pp.pack_tipo, pk.nombre as pack_nombre, pk.descripcion as pack_descripcion, pk.incluye,
       pp.precio_final,
       (select count(*) from public.mant_variantes v where v.modelo_id = m.id and v.activo) as n_variantes,
       (select count(*) from public.mant_variantes v join public.mant_aplicaciones a on a.variante_id = v.id
         where v.modelo_id = m.id and a.estado = 'verified') as n_verificadas
from public.pack_modelos m
join public.mant_pack_precios pp on pp.modelo_id = m.id and pp.estado = 'publicado'
join public.mant_packs pk on pk.tipo = pp.pack_tipo and pk.activo
where m.activo;

-- Variantes públicas con su estado de validación (sin costos)
create or replace view public.v_mant_variantes_publico with (security_invoker = false) as
select v.id as variante_id, v.modelo_id, m.marca, m.modelo, v.generacion, v.anio_desde, v.anio_hasta,
       v.combustible, v.cilindrada, v.codigo_motor,
       a.estado as estado_aplicacion, a.sae, a.normas, a.capacidad_con_filtro, a.intervalo_km,
       fo.marca || ' ' || fo.codigo as filtro_aceite,
       fa.marca || ' ' || fa.codigo as filtro_aire,
       fh.marca || ' ' || fh.codigo as filtro_habitaculo,
       fc.marca || ' ' || fc.codigo as filtro_combustible
from public.mant_variantes v
join public.pack_modelos m on m.id = v.modelo_id
left join public.mant_aplicaciones a on a.variante_id = v.id
left join public.mant_filtros fo on fo.id = a.filtro_aceite_id
left join public.mant_filtros fa on fa.id = a.filtro_aire_id
left join public.mant_filtros fh on fh.id = a.filtro_habitaculo_id
left join public.mant_filtros fc on fc.id = a.filtro_combustible_id
where v.activo;

-- ---------- RLS ----------
alter table public.mant_proveedores enable row level security;
alter table public.mant_variantes enable row level security;
alter table public.mant_lubricantes enable row level security;
alter table public.mant_filtros enable row level security;
alter table public.mant_aplicaciones enable row level security;
alter table public.mant_packs enable row level security;
alter table public.mant_pack_precios enable row level security;
alter table public.mant_comunas enable row level security;
alter table public.mant_solicitudes enable row level security;
alter table public.mant_solicitudes_historial enable row level security;

-- Catálogo: lectura pública, escritura staff
do $$ declare t text; begin
  foreach t in array array['mant_proveedores','mant_variantes','mant_lubricantes','mant_filtros','mant_aplicaciones','mant_packs','mant_comunas'] loop
    execute format('drop policy if exists %I on public.%I', t||'_select_public', t);
    execute format('create policy %I on public.%I for select using (true)', t||'_select_public', t);
    execute format('drop policy if exists %I on public.%I', t||'_staff_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.mant_es_staff()) with check (public.mant_es_staff())', t||'_staff_all', t);
  end loop; end $$;

-- Precios/costos: solo staff (el público usa la vista v_mant_catalogo_publico)
drop policy if exists mant_pack_precios_staff on public.mant_pack_precios;
create policy mant_pack_precios_staff on public.mant_pack_precios for all to authenticated using (public.mant_es_staff()) with check (public.mant_es_staff());

-- Solicitudes: anon/authenticated pueden crear (con consentimiento y honeypot vacío); solo staff lee/edita
drop policy if exists mant_solicitudes_insert_public on public.mant_solicitudes;
create policy mant_solicitudes_insert_public on public.mant_solicitudes for insert
  with check (consentimiento = true and coalesce(website,'') = '' and estado = 'nueva');
drop policy if exists mant_solicitudes_staff on public.mant_solicitudes;
create policy mant_solicitudes_staff on public.mant_solicitudes for all to authenticated using (public.mant_es_staff()) with check (public.mant_es_staff());
drop policy if exists mant_hist_staff on public.mant_solicitudes_historial;
create policy mant_hist_staff on public.mant_solicitudes_historial for all to authenticated using (public.mant_es_staff()) with check (public.mant_es_staff());

grant select on public.v_mant_catalogo_publico, public.v_mant_variantes_publico to anon, authenticated;

-- Proveedores base
insert into public.mant_proveedores (nombre, tipo, url) values
 ('Autoplanet','retail','https://www.autoplanet.cl/'),
 ('Implementos','retail','https://www.implementos.cl/'),
 ('MANN-FILTER','fabricante','https://www.mann-filter.com/')
on conflict (nombre) do nothing;
