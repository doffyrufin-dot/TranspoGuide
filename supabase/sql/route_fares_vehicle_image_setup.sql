-- Add per-route vehicle image override for route fare cards.
-- Run this in Supabase SQL Editor on existing environments.

alter table public.tbl_route_fares
  add column if not exists vehicle_image_url text;
