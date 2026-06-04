-- Ocultar perfil admin de listas de vacaciones (sigue existiendo como usuario de login).
DELETE FROM public.vacaciones_empleados
WHERE lower(trim(nombre)) IN ('norberto moreno', 'norberto moro')
   OR lower(trim(email)) = 'norbertomoro4@gmail.com';
