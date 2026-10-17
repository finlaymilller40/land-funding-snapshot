-- Lower the site size limit from 500 ha to 400 ha.
-- Measured on the hosted free tier through the API (anon key): at the worst
-- case (a built-up edge) screen_site() takes about 1.1 s warm at 497 ha and
-- 0.75 s at 400 ha, and a cold first call adds about 1.6 s. 400 ha keeps a cold
-- call around 2.4 s, inside the anon role's 3 s statement timeout.
update rules.settings
set value = 400,
    note = 'Abuse and speed limit on screen_site() and site_context() input (2,000 ha → 500 ha on 2026-10-17 → 400 ha on 2026-10-17 after hosted timings).'
where key = 'max_site_drawn_ha';
